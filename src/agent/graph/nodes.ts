import { GoogleGenAI } from '@google/genai';
import { AgentState } from './state.js';
import { SANA_SOUL, SANA_HARD_CONSTRAINTS, SANA_APP_MAP } from '../soul.js';
import { SANA_TOOL_REGISTRY } from '../tools.js';
import { loadContextForAgent } from '../workspace.js';
import { PassOnSchema, PassOn, ToolResult } from '../types.js';
import { generateContentWithRouter, LLMFunctionCall, AllModelsExhaustedError } from '../llmRouter.js';
import { getGeminiToolDeclarations, findToolByName } from '../geminiTools.js';
import { getSessionNotepad } from '../sessionNotepad.js';

export function buildSystemPrompt(sessionNotepadContent?: string): string {
  const notepadStr = sessionNotepadContent && sessionNotepadContent.trim().length > 0
    ? sessionNotepadContent
    : '(Empty - use `update_session_notepad` tool to save working notes, user constraints, or key findings for this session)';

  return `${SANA_SOUL}

### HARD CONSTRAINTS:
${SANA_HARD_CONSTRAINTS.map(c => `- ${c}`).join('\n')}

### APP ROUTE MAP:
${JSON.stringify(SANA_APP_MAP, null, 2)}

### SANA SESSION NOTEPAD (PRIVATE WORKING MEMORY FOR THIS SESSION):
${notepadStr}

### AUTONOMOUS AGENT REASONING PROTOCOL:
You are SANA operating in an autonomous multi-turn LangGraph loop with native Function Calling.
- You have direct access to tools for querying the Agent Vault, searching memories, recording user identity, logging incidents, creating calendar events, and updating your private session notepad.

### MANDATORY TOOL CALLING DIRECTIVES (EXECUTE FUNCTION CALLS DIRECTLY):
1. USER IDENTITY & PERSONAL DETAILS: Whenever the user introduces themselves, mentions their name, preferred nickname, location, city, climate, or lifestyle (e.g. "My name is Aryan, call me Ray, I live in Bardoli"), YOU MUST IMMEDIATELY CALL THE \`save_user_identity\` TOOL IN A FUNCTION CALL!
2. SKIN GOALS: Whenever the user sets or mentions a target skin goal (e.g. "make my skin glow", "reduce acne scars"), YOU MUST IMMEDIATELY CALL THE \`save_vault_goal\` TOOL!
3. SKIN COMPOSITION & PROFILE: Whenever the user describes their skin type, barrier patterns, or known triggers, YOU MUST IMMEDIATELY CALL THE \`update_skin_composition\` TOOL!
4. REACTION & FLARE INCIDENTS: When the user reports a flare, irritation, or symptom, YOU MUST CALL \`save_vault_incident\` OR \`save_memory_note\`.
5. VAULT SEARCH: When answering questions about past sessions, notes, or uploaded docs, call \`vault_search\` or \`search_agent_vault\`.
6. SESSION NOTEPAD: Use \`update_session_notepad\` to store working notes during multi-turn consultations.
7. WEB RESEARCH: Whenever the user asks about skin science, ingredient compatibility, medical recommendations, current guidelines, climate effects, product formulations, or whenever up-to-date live web research is needed, YOU MUST IMMEDIATELY CALL THE \`web_search\` OR \`web_fetch\` TOOL to search Google for live evidence-based data!

CRITICAL RULE: NEVER state in text that you have saved, updated, or stored user preferences or profile data into their Agent Memory Vault UNLESS you actually execute the corresponding tool function call!

- When tool results return from function calls, inspect the output in your next turn and synthesize a complete, elegant, user-facing answer.
- STRICT NO-EMOJI RULE: Do NOT include any emojis or visual icons in your text responses under any circumstances.
`;
}

export async function initializeNode(state: AgentState) {
  // Load context for agent
  const loadedContext = await loadContextForAgent(state.userId, state.sessionId, {
    profile: true,
    history: true,
    routine: true,
    vault: true
  });

  // Get session scratchpad
  const sessionNotepad = getSessionNotepad(state.sessionId);

  // Construct initial Gemini conversation messages if not already present
  let llmMessages = state.llmMessages || [];
  if (llmMessages.length === 0) {
    llmMessages = [];
    
    // Include full conversation history (up to last 30 turns)
    if (state.history && state.history.length > 0) {
      const historyWindow = state.history.length > 30 ? state.history.slice(-30) : state.history;
      for (const item of historyWindow) {
        llmMessages.push({
          role: item.role === 'model' ? 'model' : 'user',
          parts: [{ text: item.text }]
        });
      }
    }

    // Add current user message with context prefix
    const contextSummary = `[User Context: ID=${state.userId}, Session=${state.sessionId}, Profile=${JSON.stringify(loadedContext.profile || {})}]`;
    llmMessages.push({
      role: 'user',
      parts: [{ text: `${contextSummary}\nUser Message: "${state.message}"` }]
    });
  }

  return {
    context: {
      ...state.context,
      ...loadedContext
    },
    sessionNotepad,
    llmMessages,
    status: 'thinking'
  };
}

export async function reasoningNode(state: AgentState) {
  const currentIterations = state.iterations + 1;
  const currentNotepad = getSessionNotepad(state.sessionId) || state.sessionNotepad || '';
  const systemPrompt = buildSystemPrompt(currentNotepad);
  const toolsDeclarations = getGeminiToolDeclarations();

  let llmMessages = [...(state.llmMessages || [])];

  try {
    const routerResult = await generateContentWithRouter({
      contents: llmMessages,
      tools: toolsDeclarations,
      systemInstruction: systemPrompt,
      temperature: 0.3
    });

    // Check if the LLM issued function calls
    if (routerResult.functionCalls && routerResult.functionCalls.length > 0) {
      console.log(`[ReasoningNode] LLM selected ${routerResult.functionCalls.length} tool call(s):`, routerResult.functionCalls.map(f => f.name));

      // Append model message with function calls to conversation history
      const candidateContent = routerResult.rawResponse?.candidates?.[0]?.content;
      if (candidateContent) {
        llmMessages.push(candidateContent);
      } else {
        const modelPartList = routerResult.functionCalls.map(fc => ({
          functionCall: {
            name: fc.name,
            args: fc.args
          }
        }));

        if (routerResult.text) {
          modelPartList.unshift({ text: routerResult.text } as any);
        }

        llmMessages.push({
          role: 'model',
          parts: modelPartList
        });
      }

      return {
        pendingFunctionCalls: routerResult.functionCalls,
        llmMessages,
        status: 'calling_tools',
        iterations: currentIterations
      };
    }

    // LLM generated text response directly
    const responseText = routerResult.text || '';
    llmMessages.push({
      role: 'model',
      parts: [{ text: responseText }]
    });

    return {
      pendingFunctionCalls: [],
      finalText: responseText,
      llmMessages,
      status: 'done',
      iterations: currentIterations
    };

  } catch (err: any) {
    console.error('[ReasoningNode] Gemini router error across all models:', err?.message || err);
    
    // Graceful Fallback if all LLM models exhausted or rate-limited
    const vault = state.context.agentVault;
    const notesList = (vault?.notes || []).map((n: any) => `- **${n.title}** (${n.date?.slice(0, 10) || 'Recent'}): ${n.description}`).join('\n');
    const incList = (vault?.incidents || []).map((i: any) => `- **${i.title}** (${i.occurredAtDate || 'Recent'}): ${i.description || i.notes || 'Logged flare'}`).join('\n');
    const docsList = (vault?.documents || []).map((d: any) => `- **${d.title}**: ${d.summary || 'Indexed document'}`).join('\n');
    const profileInfo = vault?.composition ? `- **Skin Type**: ${vault.composition.skinTypeTendency || 'Sensitive'}\n- **Known Triggers**: ${vault.composition.knownTriggers?.join(', ') || 'None'}` : '';

    let fallbackText = '';
    if (notesList || incList || docsList || profileInfo) {
      fallbackText = `I apologize, but our AI services are currently out of credits/capacity across all models.\n\n` +
        `However, I retrieved your recorded information directly from your Sana Agent Vault:\n\n` +
        (notesList ? `### Logged Skin Memories & Notes\n${notesList}\n\n` : '') +
        (incList ? `### Tracked Reaction & Flare Incidents\n${incList}\n\n` : '') +
        (docsList ? `### Uploaded Vault Documents\n${docsList}\n\n` : '') +
        (profileInfo ? `### Skin Profile & Composition\n${profileInfo}\n\n` : '');
    } else {
      fallbackText = `I apologize, but our AI services are currently out of credits/capacity across all models. Please try again in a few moments once quota resets. Your Sana Agent Vault remains active to record your skin notes and routine logs.`;
    }

    return {
      pendingFunctionCalls: [],
      finalText: fallbackText,
      status: 'done',
      iterations: currentIterations
    };
  }
}

export async function toolsNode(state: AgentState) {
  const pendingCalls = state.pendingFunctionCalls || [];
  if (pendingCalls.length === 0) {
    return { pendingFunctionCalls: [], status: 'thinking' };
  }

  const execContext = {
    userId: state.userId,
    sessionId: state.sessionId,
    userRole: 'consumer' as const,
    activeRoute: '/'
  };

  const newToolResults: ToolResult[] = [];
  const toolResponseParts: any[] = [];
  let generatedProposal: any = null;

  for (const call of pendingCalls) {
    const toolDef = findToolByName(call.name);
    if (!toolDef) {
      const errorResult = { error: `Tool '${call.name}' not found.` };
      newToolResults.push({
        toolName: call.name,
        success: false,
        error: errorResult.error
      });
      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: errorResult
        }
      });
      continue;
    }

    try {
      console.log(`[ToolsNode] Executing tool '${call.name}' with args:`, call.args);
      const validatedArgs = toolDef.parameters.parse(call.args);
      const output = await toolDef.execute(validatedArgs, execContext);

      // Check if tool produced an action proposal card
      if (output?.proposal) {
        generatedProposal = output.proposal;
      }

      newToolResults.push({
        toolName: call.name,
        success: true,
        data: output
      });

      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { output }
        }
      });
    } catch (err: any) {
      console.warn(`[ToolsNode] Tool '${call.name}' execution failed:`, err?.message || err);
      const errMessage = err?.message || String(err);
      newToolResults.push({
        toolName: call.name,
        success: false,
        error: errMessage
      });

      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { error: errMessage }
        }
      });
    }
  }

  // Append functionResponse message to Gemini conversation history using valid 'user' role
  const llmMessages = [...(state.llmMessages || [])];
  llmMessages.push({
    role: 'user',
    parts: toolResponseParts
  });

  return {
    pendingFunctionCalls: [],
    toolResults: newToolResults,
    llmMessages,
    actionProposal: generatedProposal || state.actionProposal,
    status: generatedProposal ? 'need_approval' : 'thinking'
  };
}

export async function approvalNode(state: AgentState) {
  const proposal = state.actionProposal;
  return {
    actionProposal: proposal || null,
    finalText: state.finalText || `I have prepared an action proposal: ${proposal?.title || 'User confirmation required'}. Please review and confirm to proceed.`
  };
}

export async function scanMeasureNode(state: AgentState) {
  return {
    context: {
      ...state.context,
      scanMetrics: {
        hydrationLevel: '42%',
        rednessIndex: 'Moderate (Zone B)',
        barrierScore: 78,
        uvExposureRisk: 'Medium-High'
      }
    }
  };
}

export async function scanInterpretNode(state: AgentState) {
  const metrics = (state.context as any).scanMetrics;
  const analysisSummary = `Dermatological Barrier Assessment:
- Stratum Corneum Hydration: ${metrics?.hydrationLevel || 'Normal'}
- Redness / Vascularization: ${metrics?.rednessIndex || 'Low'}
- Lipid Barrier Resilience: Score ${metrics?.barrierScore || 80}/100`;

  return {
    context: {
      ...state.context,
      scanAnalysis: analysisSummary
    }
  };
}

export async function scanRespondNode(state: AgentState) {
  const analysis = (state.context as any).scanAnalysis || 'Skin scan assessment completed.';
  const finalResponse = `Skin Scan & Measurement Analysis:\n\n${analysis}\n\nRecommended Guidance:\nMaintain hydration with pH-balanced (5.5) lipid ceramide moisturizer and apply SPF 30+ UV protection.`;

  return {
    finalText: finalResponse,
    status: 'done'
  };
}

export async function finalizeNode(state: AgentState) {
  const finalOutputText = state.finalText || "I am SANA, your skin health agent. How can I assist with your routine today?";

  return {
    finalText: finalOutputText,
    actionProposal: state.actionProposal || null,
    status: 'done'
  };
}
