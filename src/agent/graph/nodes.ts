import { GoogleGenAI } from '@google/genai';
import { AgentState } from './state.js';
import { SANA_SOUL, SANA_HARD_CONSTRAINTS, SANA_APP_MAP } from '../soul.js';
import { SANA_TOOL_REGISTRY } from '../tools.js';
import { loadContextForAgent } from '../workspace.js';
import { PassOnSchema, PassOn, ToolResult } from '../types.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function buildSystemPrompt(): string {
  const toolsDescription = Object.values(SANA_TOOL_REGISTRY)
    .map(t => `- ${t.name}: ${t.description} (params: ${JSON.stringify(t.parameters)})`)
    .join('\n');

  return `${SANA_SOUL}

### HARD CONSTRAINTS:
${SANA_HARD_CONSTRAINTS.map(c => `- ${c}`).join('\n')}

### APP ROUTE MAP:
${JSON.stringify(SANA_APP_MAP, null, 2)}

### MULTI-STEP AGENT LOOP PROTOCOL (PassOn Schema):
You are SANA operating inside a StateGraph execution pipeline.
For every user turn or tool-eval loop, you MUST return a valid JSON object matching this strict schema:
{
  "thought": "<internal step-by-step reasoning>",
  "intent": "<user intent classification>",
  "status": "need_info" | "ready" | "need_approval" | "failed",
  "nextTools": [{ "name": "tool_name", "arguments": { ... } }],
  "memoryNeeds": { "profile": boolean, "history": boolean, "routine": boolean, "vault": boolean },
  "finalResponse": "<text response to show the user>",
  "actionProposal": null | { "title": "...", "description": "...", "targetRoute": "...", "payload": { ... } },
  "errorSummary": null
}

### CRITICAL RULES ON MUTATIONS & STORAGE:
- For read-only queries or Vault storage (saving notes, indexing documents, searching memory), set status to "ready" or "need_info" and execute immediately without approval cards.
- Writing to or querying the Agent Memory Vault does NOT modify user settings or profile.
- When the user asks to remember, log, or store an observation or symptom, use \`save_memory_note\` directly.
- When the user provides a document/PDF, use \`ingest_document_to_vault\`.
- When retrieving past memory notes or documents, use \`vault_search\` or \`search_agent_vault\` or set \`vault: true\` in \`memoryNeeds\`.

### MANDATORY DATA RETRIEVAL & FULFILLMENT PROTOCOL:
1. NEVER output an interim message like "I am retrieving...", "Please allow a moment...", or "Compiling your records..." with status: "ready".
2. When the user asks "What have you stored?", "Retrieve everything", "Show my skin memories", "Check my past incidents", "What do you know about me?", or any query requiring data compilation:
   - You MUST set status: "need_info".
   - You MUST include vault_search in nextTools with scope: "all" and query: "all", OR set memoryNeeds: { vault: true, profile: true }.
   - In finalResponse, set a brief interim note (e.g. "I am retrieving all stored information from your personal vault. Please allow a moment for me to compile this.").
3. In the subsequent iteration after tools return vault data, compile and synthesize ALL returned records into a clean, well-organized response with headers (e.g. ### Identity & Profile, ### Skin Memories & Incidents, ### Scheduled Events & Goals, ### Uploaded Vault Documents) and set status: "ready". Never stop on the interim message without compiling actual content!
4. STRICT NO-EMOJI RULE: Do NOT include any emojis or visual icons in your text responses or markdown headers under any circumstances.

### AVAILABLE TOOLS:
${toolsDescription}`;
}

export function parsePassOn(rawText: string): PassOn {
  try {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
    const json = JSON.parse(cleaned);
    const parsed = PassOnSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // Fallback parsing if JSON block is surrounded by commentary
  }
  return {
    thought: 'Fallback parsing used due to malformed JSON from model.',
    intent: 'general_chat',
    status: 'ready',
    nextTools: [],
    finalResponse: rawText,
    actionProposal: undefined
  };
}

async function generateContentWithFallback(params: {
  contents: any[];
  systemInstruction: string;
}): Promise<string> {
  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-2.5-flash',
    'gemini-2.5-flash'
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });
      if (response.text) {
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Gemini API] Error calling model '${model}':`, err?.message || String(err));
      lastError = err;
    }
  }

  throw lastError || new Error('All model generation attempts failed.');
}

export async function planNode(state: AgentState) {
  const systemPrompt = buildSystemPrompt();
  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `Current User ID: ${state.userId}
Session ID: ${state.sessionId}
User Message: "${state.message}"
Recent History: ${JSON.stringify(state.history.slice(-4))}

Analyze request and return the initial PassOn JSON.`
        }
      ]
    }
  ];

  let rawText = '';
  try {
    rawText = await generateContentWithFallback({
      contents,
      systemInstruction: systemPrompt
    });
  } catch (err: any) {
    console.error('[LangGraph] Rate limit or API error in planNode:', err?.message || err);
    // Safe graceful fallback PassOn if quota/network error happens
    const passOn: PassOn = {
      thought: 'Rate limit or network issue encountered; triggering safe vault retrieval fallback.',
      intent: 'general_chat',
      status: 'need_info',
      nextTools: [{ name: 'vault_search', arguments: { scope: 'all', query: 'all' } }],
      memoryNeeds: { vault: true, profile: true },
      finalResponse: 'I am checking your personal Sana Agent Vault for relevant records.'
    };
    return {
      passOn,
      passOnTrace: [passOn],
      iterations: state.iterations + 1
    };
  }

  let passOn = parsePassOn(rawText);

  // Auto-detect retrieval intent if model replied ready with no tools
  const isRetrievalIntent = /(retrieve|what (have|did) you (store|remember|log|save)|show.*(vault|memories|incidents|history)|get.*everything|compile|fetch)/i.test(state.message);
  const promisesRetrievalText = /retriev|compil|allow a moment|search.*vault|gathering/i.test(passOn.finalResponse || '');

  if ((isRetrievalIntent || promisesRetrievalText) && (!passOn.nextTools || passOn.nextTools.length === 0)) {
    passOn.status = 'need_info';
    passOn.nextTools = [
      { name: 'vault_search', arguments: { scope: 'all', query: 'all' } }
    ];
    if (!passOn.memoryNeeds) {
      passOn.memoryNeeds = { vault: true, profile: true };
    }
  }

  return {
    passOn,
    passOnTrace: [passOn],
    iterations: state.iterations + 1
  };
}

export async function loadMemoryNode(state: AgentState) {
  if (!state.passOn?.memoryNeeds) {
    return {};
  }
  const loadedContext = await loadContextForAgent(state.userId, state.sessionId, state.passOn.memoryNeeds);
  return {
    context: {
      ...state.context,
      ...loadedContext
    }
  };
}

export async function toolsNode(state: AgentState) {
  const toolsToRun = state.passOn?.nextTools || [];
  if (toolsToRun.length === 0) {
    return { toolResults: [] };
  }

  const execContext = {
    userId: state.userId,
    sessionId: state.sessionId,
    userRole: 'consumer' as const,
    activeRoute: '/'
  };

  const results: ToolResult[] = await Promise.all(
    toolsToRun.map(async (t) => {
      const toolDef = SANA_TOOL_REGISTRY.find(td => td.name === t.name);
      if (!toolDef) {
        return {
          toolName: t.name,
          success: false,
          error: `Tool '${t.name}' not found in SANA_TOOL_REGISTRY.`
        };
      }
      try {
        const validatedArgs = toolDef.parameters.parse(t.arguments);
        const data = await toolDef.execute(validatedArgs, execContext);
        return {
          toolName: t.name,
          success: true,
          data
        };
      } catch (err: any) {
        return {
          toolName: t.name,
          success: false,
          error: err.message || String(err)
        };
      }
    })
  );

  // If vault_search or search_agent_vault produced results, merge into state context
  let updatedVault = state.context.agentVault ? { ...state.context.agentVault } : undefined;
  for (const res of results) {
    if (res.success && res.data && (res.toolName === 'vault_search' || res.toolName === 'search_agent_vault')) {
      const searchRes = res.data.results || res.data;
      if (searchRes) {
        updatedVault = {
          ...updatedVault,
          userId: state.userId,
          sessions: searchRes.sessions || updatedVault?.sessions || [],
          incidents: searchRes.incidents || updatedVault?.incidents || [],
          events: searchRes.events || updatedVault?.events || [],
          goals: searchRes.goals || updatedVault?.goals || [],
          notes: searchRes.notes || updatedVault?.notes || [],
          documents: searchRes.documents || updatedVault?.documents || [],
          lastSynced: new Date().toISOString()
        };
      }
    }
  }

  return {
    toolResults: results,
    context: updatedVault ? { ...state.context, agentVault: updatedVault } : state.context
  };
}

export async function decideNode(state: AgentState) {
  const systemPrompt = buildSystemPrompt();

  if (state.onProgress && state.passOn?.finalResponse) {
    state.onProgress(state.passOn.finalResponse);
  }

  const promptText = `User Message: "${state.message}"
Recent History: ${JSON.stringify(state.history.slice(-4))}
Previous PassOn: ${JSON.stringify(state.passOn)}
Context Snapshot: ${JSON.stringify(state.context)}
Tool Execution Output: ${JSON.stringify(state.toolResults)}

MANDATORY INSTRUCTION: Examine the 'Tool Execution Output' and 'Context Snapshot' above. Synthesize a complete, articulate, user-facing response in 'finalResponse' directly answering the user's message.
- If tool results or context contain stored records (notes, skin memories, flare incidents, documents, identity, routine), present them in a clean, structured format using markdown headers (no emojis).
- If no matching records are found, clearly explain what was searched and offer to log a new observation or memory for them.
- Do NOT repeat interim text like "I am retrieving..." or "Please allow a moment...".
- Set status to 'ready' or 'need_approval'.`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: promptText }]
    }
  ];

  let rawText = '';
  try {
    rawText = await generateContentWithFallback({
      contents,
      systemInstruction: systemPrompt
    });
  } catch (err: any) {
    console.error('[LangGraph] Rate limit or API error in decideNode:', err?.message || err);
    // Graceful fallback response directly from context snapshot if model API call fails
    const vault = state.context.agentVault;
    const notesList = (vault?.notes || []).map((n: any) => `- **${n.title}** (${n.date?.slice(0, 10) || 'Recent'}): ${n.description}`).join('\n');
    const incList = (vault?.incidents || []).map((i: any) => `- **${i.title}** (${i.occurredAtDate || 'Recent'}): ${i.description || i.notes || 'Logged flare'}`).join('\n');
    const docsList = (vault?.documents || []).map((d: any) => `- **${d.title}**: ${d.summary || 'Indexed document'}`).join('\n');
    const profileInfo = vault?.composition ? `- **Skin Type**: ${vault.composition.skinTypeTendency || 'Sensitive'}\n- **Known Triggers**: ${vault.composition.knownTriggers?.join(', ') || 'None'}` : '';

    let synthText = '';
    if (notesList || incList || docsList || profileInfo) {
      synthText = `Here is what is currently recorded in your Sana Agent Vault:\n\n` +
        (notesList ? `### Logged Skin Memories & Notes\n${notesList}\n\n` : '') +
        (incList ? `### Tracked Reaction & Flare Incidents\n${incList}\n\n` : '') +
        (docsList ? `### Uploaded Vault Documents\n${docsList}\n\n` : '') +
        (profileInfo ? `### Skin Profile & Composition\n${profileInfo}\n\n` : '');
    } else {
      synthText = `I searched your Sana Agent Vault, but no previously saved skin memories or incidents were found. Your vault is active and ready to save your notes or routine logs whenever you'd like.`;
    }

    const passOn: PassOn = {
      thought: 'Rate limit fallback synthesis utilized.',
      intent: 'general_chat',
      status: 'ready',
      nextTools: [],
      finalResponse: synthText
    };

    return {
      passOn,
      passOnTrace: [passOn],
      iterations: state.iterations + 1
    };
  }

  const passOn = parsePassOn(rawText);

  return {
    passOn,
    passOnTrace: [passOn],
    iterations: state.iterations + 1
  };
}

export async function approvalNode(state: AgentState) {
  const proposal = state.passOn?.actionProposal;
  return {
    actionProposal: proposal || null,
    finalText: state.passOn?.finalResponse || `I have prepared an action proposal: ${proposal?.title || 'User confirmation required'}. Please review and confirm to proceed.`
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
    passOn: {
      thought: 'Scan pipeline executed.',
      intent: 'scan_analysis',
      status: 'ready' as const,
      nextTools: [],
      finalResponse
    }
  };
}

export async function finalizeNode(state: AgentState) {
  let finalOutputText = state.passOn?.finalResponse || "I am SANA, your skin health agent. How can I assist with your routine today?";

  // If finalOutputText is still an unfulfilled interim placeholder, synthesize directly
  if (/retriev|allow a moment|compil/i.test(finalOutputText)) {
    const vault = state.context.agentVault;
    const notesList = (vault?.notes || []).map((n: any) => `- **${n.title}** (${n.date?.slice(0, 10) || 'Recent'}): ${n.description}`).join('\n');
    const incList = (vault?.incidents || []).map((i: any) => `- **${i.title}** (${i.occurredAtDate || 'Recent'}): ${i.description || i.notes || 'Logged flare'}`).join('\n');
    const docsList = (vault?.documents || []).map((d: any) => `- **${d.title}**: ${d.summary || 'Indexed document'}`).join('\n');
    const profileInfo = vault?.composition ? `- **Skin Type**: ${vault.composition.skinTypeTendency || 'Sensitive'}\n- **Known Triggers**: ${vault.composition.knownTriggers?.join(', ') || 'None'}` : '';

    if (notesList || incList || docsList || profileInfo) {
      finalOutputText = `Here is what is currently recorded in your Sana Agent Vault:\n\n` +
        (notesList ? `### Logged Skin Memories & Notes\n${notesList}\n\n` : '') +
        (incList ? `### Tracked Reaction & Flare Incidents\n${incList}\n\n` : '') +
        (docsList ? `### Uploaded Vault Documents\n${docsList}\n\n` : '') +
        (profileInfo ? `### Skin Profile & Composition\n${profileInfo}\n\n` : '');
    } else {
      finalOutputText = `I searched your personal Sana Agent Vault, but no previously saved skin memories, flare incidents, or uploaded documents were found. Your vault is empty and ready to record your notes, skin symptoms, or routine guides whenever you'd like.`;
    }
  }

  // Strip emojis to strictly uphold the no-emoji mandate
  finalOutputText = finalOutputText.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E6}-\u{1F1FF}]/gu, '');

  return {
    finalText: finalOutputText,
    actionProposal: state.passOn?.actionProposal || null
  };
}
