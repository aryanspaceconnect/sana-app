import { GoogleGenAI } from '@google/genai';
import {
  SanaAgentConfig,
  AgentRunParams,
  AgentRunResult,
  PassOn,
  PassOnSchema,
  ToolResult,
  AgentContext,
  Session
} from './types.js';
import { SANA_SOUL, SANA_HARD_CONSTRAINTS, SANA_APP_MAP } from './soul.js';
import { SANA_TOOL_REGISTRY } from './tools.js';
import { loadContextForAgent } from './workspace.js';

// In-memory sessions store
const activeSessions: Record<string, Session> = {};

function getOrCreateSession(userId: string, sessionId?: string): Session {
  const sId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  if (!activeSessions[sId]) {
    activeSessions[sId] = {
      sessionId: sId,
      userId,
      lastActive: Date.now(),
      turnCount: 0,
      passOnTrace: []
    };
  }
  activeSessions[sId].lastActive = Date.now();
  return activeSessions[sId];
}

export class SanaAgent {
  public config: SanaAgentConfig;
  private ai: GoogleGenAI;

  constructor(customConfig?: Partial<SanaAgentConfig>) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey });

    this.config = {
      soul: SANA_SOUL,
      hardConstraints: SANA_HARD_CONSTRAINTS,
      toolRegistry: SANA_TOOL_REGISTRY,
      memoryPolicy: {
        maxHistoryTurns: 6,
        sessionTimeoutMs: 30 * 60 * 1000
      },
      outputGuardrails: [
        (text: string) => {
          if (/diagnos(e|is)|you have psoriasis|you have eczema/i.test(text) && !/observation|consult|dermatologist/i.test(text)) {
            return { passed: false, reason: 'Contains ungrounded medical diagnosis claim.' };
          }
          return { passed: true };
        },
        (text: string) => {
          if (/(stop taking|discontinue|throw away) (your|prescription)/i.test(text)) {
            return { passed: false, reason: 'Advising cessation of prescription medication.' };
          }
          return { passed: true };
        }
      ],
      model: 'gemini-2.5-flash',
      ...customConfig
    };
  }

  private buildSystemPrompt(): string {
    const toolsDescription = this.config.toolRegistry.map(t => `- **${t.name}**: ${t.description}`).join('\n');
    const constraintsList = this.config.hardConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n');

    return `${this.config.soul}

### STRICT OPERATIONAL HARD CONSTRAINTS:
${constraintsList}

### ISOLATED AGENT MEMORY VAULT ARCHITECTURE:
- The AI Agent operates with an **Isolated Agent Memory Vault** (\`agent_vaults/{userId}\`) stored independently from the primary application user database.
- Agent memory notes, skin observations, flare-up logs, and parsed uploaded documents (PDFs, lab reports) reside strictly within this vault.
- Writing to or querying the Agent Memory Vault does NOT modify the user's primary application settings or core profile, and DOES NOT require user approval cards.
- When the user asks to remember, log, or store an observation, pimple, flare-up, symptom, or skin memory note (e.g., 'Can u remember that i had a pimple yesterday'), use the \`save_memory_note\` tool directly.
- When the user provides or uploads a document/PDF/routine guide, use the \`ingest_document_to_vault\` tool to parse and index it into their isolated vault.
- When you need to retrieve past memory notes or documents from the vault, use \`search_agent_vault\` or set \`vault: true\` in \`memoryNeeds\`.

### AVAILABLE TOOLS:
${toolsDescription}

### PASSON PROTOCOL (MANDATORY JSON FORMAT):
You MUST respond ONLY with a raw, valid JSON object matching the following structure. Do NOT wrap in markdown codeblocks (\`\`\`json).

{
  "thought": "Internal reasoning step detailing current understanding, missing knowledge, or evaluation.",
  "intent": "Short upper-snake-case intent tag (e.g. INGREDIENT_COMPATIBILITY_CHECK, SCHEDULE_ROUTINE, SKIN_INCIDENT_ANALYSIS)",
  "status": "need_info" | "ready" | "need_approval" | "failed",
  "nextTools": [
    { "name": "tool_name", "arguments": { ... }, "optional": false }
  ],
  "memoryNeeds": {
    "profile": boolean,
    "latestScan": boolean,
    "incidentsDays": number,
    "settingHistory": ["key_name"],
    "episodicQuery": "search query",
    "appMap": boolean,
    "vault": boolean
  },
  "finalResponse": "Clear, supportive, clinical-grade user message when status is 'ready' or 'need_approval'.",
  "actionProposal": {
    "actionId": "unique_string",
    "title": "Action Card Title",
    "description": "Clear explanation of proposed state change",
    "actionType": "UPDATE_SETTING" | "CREATE_EVENT" | "LOG_INCIDENT" | "GENERATE_PROTOCOL",
    "payload": { ... },
    "riskLevel": "low" | "medium"
  },
  "errorSummary": "Optional description if status is 'failed'"
}`;
  }

  private parsePassOn(rawText: string): PassOn {
    let cleanText = rawText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(cleanText);
      const validated = PassOnSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      } else {
        console.warn('Zod PassOn validation warnings:', validated.error.format());
        return {
          thought: parsed.thought || 'Parsed with minor schema adjustments.',
          intent: parsed.intent || 'GENERAL_QUERY',
          status: parsed.status || 'ready',
          finalResponse: parsed.finalResponse || parsed.text || cleanText,
          actionProposal: parsed.actionProposal,
          errorSummary: 'Schema structural adjustment applied.'
        };
      }
    } catch (err: any) {
      console.error('Failed to parse PassOn JSON:', rawText);
      return {
        thought: 'Fallback parsing due to non-JSON format output.',
        intent: 'GENERAL_RESPONSE',
        status: 'ready',
        finalResponse: rawText,
        errorSummary: `JSON Parse error: ${err?.message}`
      };
    }
  }

  private async callLLMWithRetry(contents: any[], systemInstruction: string, retries = 2): Promise<string> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.config.model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        });
        if (response.text) return response.text;
      } catch (err: any) {
        console.warn(`LLM call attempt ${attempt + 1} failed:`, err?.message);
        if (attempt === retries) {
          throw err;
        }
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw new Error('LLM call failed after retries.');
  }

  private async executeToolsParallel(
    toolCalls: Array<{ name: string; arguments: Record<string, any> }>,
    context: AgentContext
  ): Promise<ToolResult[]> {
    const promises = toolCalls.map(async (tc): Promise<ToolResult> => {
      const toolDef = this.config.toolRegistry.find(t => t.name === tc.name);
      if (!toolDef) {
        return {
          toolName: tc.name,
          success: false,
          error: `Tool '${tc.name}' not registered in SanaAgent registry.`
        };
      }

      let attempt = 0;
      const maxToolAttempts = 2;

      while (attempt < maxToolAttempts) {
        try {
          const validatedArgs = toolDef.parameters.parse(tc.arguments);
          const data = await toolDef.execute(validatedArgs, context);
          return {
            toolName: tc.name,
            success: true,
            data
          };
        } catch (err: any) {
          attempt++;
          if (attempt >= maxToolAttempts) {
            return {
              toolName: tc.name,
              success: false,
              error: err?.message || 'Tool execution error',
              retried: true
            };
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }

      return {
        toolName: tc.name,
        success: false,
        error: 'Unknown tool execution error.'
      };
    });

    return Promise.all(promises);
  }

  public async run(params: AgentRunParams): Promise<AgentRunResult> {
    const session = getOrCreateSession(params.userId, params.sessionId);
    session.turnCount++;

    const systemPrompt = this.buildSystemPrompt();
    const passOnTrace: PassOn[] = [];

    let currentContext: AgentContext = {
      userId: params.userId,
      sessionId: session.sessionId
    };

    const conversationHistory = (params.history || []).slice(-this.config.memoryPolicy.maxHistoryTurns).map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }));

    // Step 1: Initial Planner Step
    const initialContents = [
      ...conversationHistory,
      {
        role: 'user',
        parts: [{ text: `User Message: "${params.message}"\nSession ID: ${session.sessionId}` }]
      }
    ];

    let rawPassOn = await this.callLLMWithRetry(initialContents, systemPrompt);
    let currentPassOn = this.parsePassOn(rawPassOn);
    passOnTrace.push(currentPassOn);

    const MAX_ITERATIONS = 4;
    let iteration = 0;

    // Step 2: Multi-step loop while status === 'need_info'
    while (currentPassOn.status === 'need_info' && iteration < MAX_ITERATIONS) {
      iteration++;

      // Load requested memory layers
      if (currentPassOn.memoryNeeds) {
        const loadedContext = await loadContextForAgent(params.userId, session.sessionId, currentPassOn.memoryNeeds);
        currentContext = { ...currentContext, ...loadedContext };
      }

      // Execute tool calls in parallel
      let toolResults: ToolResult[] = [];
      if (currentPassOn.nextTools && currentPassOn.nextTools.length > 0) {
        toolResults = await this.executeToolsParallel(currentPassOn.nextTools, currentContext);
      }

      // Feed results into decision step
      const decisionPrompt = [
        ...initialContents,
        {
          role: 'model',
          parts: [{ text: JSON.stringify(currentPassOn) }]
        },
        {
          role: 'user',
          parts: [{
            text: `[SYSTEM TOOL & MEMORY RESULTS - ITERATION ${iteration}]
Context Snapshot: ${JSON.stringify(currentContext)}
Tool Execution Output: ${JSON.stringify(toolResults)}

Evaluate results and produce the NEXT PassOn JSON object. If you have sufficient information or proposal ready, set status to 'ready' or 'need_approval'.`
          }]
        }
      ];

      rawPassOn = await this.callLLMWithRetry(decisionPrompt, systemPrompt);
      currentPassOn = this.parsePassOn(rawPassOn);
      passOnTrace.push(currentPassOn);
    }

    // Step 3: Guardrail Check
    let finalOutputText = currentPassOn.finalResponse || "I am SANA, your skin health agent. How can I assist with your routine today?";

    for (const guardrail of this.config.outputGuardrails) {
      const check = guardrail(finalOutputText);
      if (!check.passed) {
        console.warn('Output guardrail triggered:', check.reason);
        finalOutputText += "\n\n*Note: Always consult a licensed dermatologist for personal medical concerns.*";
        break;
      }
    }

    session.passOnTrace.push(...passOnTrace);

    return {
      text: finalOutputText,
      actionProposal: currentPassOn.actionProposal,
      sessionId: session.sessionId,
      passOnTrace,
      iterations: iteration + 1
    };
  }
}

// Singleton agent instance
export const sanaAgent = new SanaAgent();

export async function runSanaAgent(params: AgentRunParams): Promise<AgentRunResult> {
  return sanaAgent.run(params);
}
