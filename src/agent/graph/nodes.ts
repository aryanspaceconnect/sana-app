import { GoogleGenAI } from '@google/genai';
import { AgentState } from './state.js';
import { SANA_SOUL, SANA_HARD_CONSTRAINTS, SANA_APP_MAP } from '../soul.js';
import { SANA_TOOL_REGISTRY } from '../tools.js';
import { loadContextForAgent } from '../workspace.js';
import { PassOnSchema, PassOn, ToolResult } from '../types.js';
import { generateContentWithRouter, LLMFunctionCall, AllModelsExhaustedError } from '../llmRouter.js';
import { getGeminiToolDeclarations, findToolByName, refreshMcpToolsCache } from '../geminiTools.js';
import { getSessionNotepad } from '../sessionNotepad.js';
import { getVaultFileSystemIndex } from '../agentVault.js';
import { touchSession } from '../sessionManager.js';
import { getTemporalPromptHeader } from '../services/TemporalEngine.js';
import { getBaselineWeatherPromptHeader } from '../services/WeatherAwarenessEngine.js';

export async function buildSystemPrompt(userId: string, sessionNotepadContent?: string): Promise<string> {
  const temporalHeader = getTemporalPromptHeader();
  const weatherHeader = await getBaselineWeatherPromptHeader();
  const notepadStr = sessionNotepadContent && sessionNotepadContent.trim().length > 0
    ? sessionNotepadContent
    : '(Empty - use `update_session_notepad` tool to save working notes, user constraints, or key findings for this session)';

  let fileSystemIndex = '';
  try {
    fileSystemIndex = await getVaultFileSystemIndex(userId);
  } catch (err) {
    fileSystemIndex = 'ROOT DIRECTORY (/)\n  └── (No files or folders created yet.)';
  }

  return `${temporalHeader}
${weatherHeader}

${SANA_SOUL}

### IN-CONTEXT LEARNING (ICL): ENVIRONMENTAL & GEOLOGICAL DECISION RULES
1. BASELINE CONTEXT (No tool needed):
   - For routine casual conversations, simple routine checks, or basic skin queries, rely ONCE on the baseline \`[ENVIRONMENT & WEATHER]\` context header above (~45 tokens). DO NOT invoke \`fetch_advanced_environmental_data\`.

2. ADVANCED TOOL TRIGGER CONDITIONS (Invoke \`fetch_advanced_environmental_data\`):
   - Trigger Condition A (Acute Flare-Ups): User reports sudden inexplicable breakout, barrier burning, atopic dermatitis flare, or rosacea flushing. Query \`includeAirQuality: true\` (PM2.5/AhR check) and \`includeHourlyForecast: true\`.
   - Trigger Condition B (Geological Relocation / Travel): User mentions traveling, changing cities, or moving to a different altitude/climate. Query with target lat/long, \`includeDaily7DayTrend: true\` and \`includeGeologicalSoil: true\`.
   - Trigger Condition C (Sunscreen / Hyperpigmentation Regimen): User asks about dark spot treatment or SPF dosage during extreme UV periods. Query \`includeSolarRadiation: true\` and \`includeDaily7DayTrend: true\`.
   - Trigger Condition D (Seasonal Transition Adjustments): User asks how to transition routine from Summer -> Autumn or Winter -> Spring. Query 7-day temperature and dew point trends.

3. TIMESTAMPED MEMORY NOTEPAD LOGGING:
   - When you execute \`fetch_advanced_environmental_data\`, analyze the payload and write a concise, structured entry to the Session Notepad using \`update_session_notepad\` in format:
     \`[ENV_LOG: <ISO_TIMESTAMP>] Location: <Name> | US AQI: <AQI> (PM2.5: <val>) | Dew Point: <val> | Max UV Today: <val> | Clinical Assessment: <Summary>\`
   - When reading old \`[ENV_LOG]\` entries from the notepad, compare its timestamp against the Real-Time Temporal Ground Truth in the prompt header to calculate how many hours/days old it is before using it.

### HARD CONSTRAINTS:
${SANA_HARD_CONSTRAINTS.map(c => `- ${c}`).join('\n')}

### APP ROUTE MAP:
${JSON.stringify(SANA_APP_MAP, null, 2)}

### ROOT FILE & FOLDER SYSTEM DIRECTORY INDEX (VAULT WORKSPACE):
${fileSystemIndex}

### SANA SESSION NOTEPAD (PRIVATE WORKING MEMORY FOR THIS SESSION):
${notepadStr}

### VIRTUAL FILE & FOLDER SYSTEM CAPABILITIES:
You have complete autonomous authority to manage virtual files and folders inside user Agent Vault:
1. CREATE FOLDERS (\`create_folder\`): Create new folders or nested subfolders for organization (e.g. \`/PM_Routines\`, \`/Scans/2026\`, \`/Prescriptions\`).
2. CREATE FILES (\`create_file\`): Create virtual files containing notes, guides, protocols, or logs inside specific folders.
3. ARRANGE FILES (\`arrange_files\`): Organize and move existing files into designated target folders.
4. CREATE HYPERLINKS (\`create_hyperlink\`): Link related files, folders, or web URLs together to build a connected knowledge graph.
5. ACCESS FOLDER (\`access_folder\`): Open and inspect any folder to get its map/index. Whenever you state "I have decided to open this folder", YOU MUST CALL THE \`access_folder\` TOOL!
6. ACCESS FILE (\`access_file\`): Open and read any file in Agent Vault.

### MODEL CONTEXT PROTOCOL (MCP) INTERFACE:
You are fully equipped with Model Context Protocol (MCP) capabilities.
- MCP Server Tools are dynamically registered with prefix \`mcp__<server_id>__<tool_name>\` (e.g. \`mcp__sana_vault__search_vault\`, \`mcp__sana_knowledge__exa_answer\`, \`mcp__sana_dermatology__calculate_fitzpatrick\`, \`mcp__sana_notepad__read_notepad\`, and any custom connected remote/local MCP servers).
- You can execute MCP tools seamlessly as native function calls.
- Every MCP tool call execution, parameter set, and response payload is captured in SANA's execution trace and thought-chain logs.

### AUTONOMOUS AGENT REASONING PROTOCOL:
You are SANA operating in an autonomous multi-turn LangGraph loop with native Function Calling.
- You have direct access to tools for querying the Agent Vault, managing files & folders, searching memories, recording user identity, logging incidents, creating calendar events, updating your private session notepad, and running connected MCP tools.

### MANDATORY TOOL CALLING DIRECTIVES (EXECUTE FUNCTION CALLS DIRECTLY):
1. USER IDENTITY & PERSONAL DETAILS: Whenever the user introduces themselves, mentions their name, preferred nickname, location, city, climate, or lifestyle (e.g. "My name is Aryan, call me Ray, I live in Bardoli"), YOU MUST IMMEDIATELY CALL THE \`save_user_identity\` TOOL IN A FUNCTION CALL!
2. SKIN GOALS: Whenever the user sets or mentions a target skin goal (e.g. "make my skin glow", "reduce acne scars"), YOU MUST IMMEDIATELY CALL THE \`save_vault_goal\` TOOL!
3. SKIN COMPOSITION & PROFILE: Whenever the user describes their skin type, barrier patterns, or known triggers, YOU MUST IMMEDIATELY CALL THE \`update_skin_composition\` TOOL!
4. REACTION & FLARE INCIDENTS: When the user reports a flare, irritation, or symptom, YOU MUST CALL \`save_vault_incident\` OR \`save_memory_note\`.
5. VAULT SEARCH: When answering questions about past sessions, notes, or uploaded docs, call \`vault_search\`, \`search_agent_vault\`, or \`mcp__sana_vault__search_vault\`.
6. SESSION NOTEPAD: Use \`update_session_notepad\` or \`mcp__sana_notepad__append_note\` to store working notes during multi-turn consultations.
7. WEB RESEARCH: Whenever the user asks about skin science, ingredient compatibility, medical recommendations, current guidelines, climate effects, product formulations, or whenever up-to-date live web research is needed, YOU MUST IMMEDIATELY CALL THE \`exa_search\`, \`exa_answer\`, \`web_search\`, \`web_fetch\`, or \`mcp__sana_knowledge__exa_answer\` TOOL to perform live evidence-based web research!
8. DERMATOLOGY CALCULATIONS: Whenever phototype scoring, Fitzpatrick classification, or barrier damage indices are needed, call \`mcp__sana_dermatology__calculate_fitzpatrick\` or \`mcp__sana_dermatology__evaluate_barrier_index\`.
9. FILE & FOLDER ORGANIZER: Use \`create_folder\`, \`create_file\`, \`arrange_files\`, \`create_hyperlink\`, \`access_folder\`, and \`access_file\` whenever the user asks you to organize, store, link, or access files and folders in their workspace.

10. SINGLE-CALL SKIN SCAN VAULT RETRIEVAL (\`retrieve_skin_scan_vault\`): When retrieving facial scan records, daily scans, intermediate scans, raw Perfect Corp API report logs, concern-specific images/masks (wrinkles, acne, pores, dark circles, redness, spots, texture, moisture, firmness), or time-series progress trends, CALL \`retrieve_skin_scan_vault\`. It returns complete scan data, raw reports, target images, and progress trends in ONE SINGLE TOOL CALL!

CRITICAL RULE: NEVER state in text that you have saved, updated, or stored user preferences or profile data into their Agent Memory Vault UNLESS you actually execute the corresponding tool function call!

- When tool results return from function calls, inspect the output in your next turn and synthesize a complete, detailed, user-facing answer.
- NEVER output intermediate text commentary like "I will call access_file now", "function call to...", "Let me parse this payload", or "I'll call access_file" as your text response. Always synthesize the actual scan scores, metrics, and findings directly for the user.
- STRICT NO-EMOJI RULE: Do NOT include any emojis or visual icons in your text responses under any circumstances.
`;
}

export async function initializeNode(state: AgentState) {
  // Touch active session to refresh 10-min inactivity timer
  touchSession(state.sessionId, state.userId);

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
  // Refresh active session activity
  touchSession(state.sessionId, state.userId);

  if (state.iterations > 0) {
    // Pacing delay between multi-tool autonomous reasoning turns
    await new Promise((r) => setTimeout(r, 500));
  }

  const currentIterations = state.iterations + 1;
  const currentNotepad = getSessionNotepad(state.sessionId) || state.sessionNotepad || '';
  const systemPrompt = await buildSystemPrompt(state.userId, currentNotepad);
  
  // Refresh active MCP tools before generating declarations
  await refreshMcpToolsCache();
  const toolsDeclarations = getGeminiToolDeclarations();

  let llmMessages = [...(state.llmMessages || [])];

  try {
    const routerResult = await generateContentWithRouter({
      contents: llmMessages,
      tools: toolsDeclarations,
      systemInstruction: systemPrompt,
      temperature: 0.3,
      includeThoughts: true
    });

    // Construct PassOn trace step from thoughts or model reasoning
    const thoughtText = (routerResult.thoughts && routerResult.thoughts.length > 0)
      ? routerResult.thoughts.join('\n')
      : (routerResult.functionCalls.length > 0
          ? `Analyzed skin query and selected ${routerResult.functionCalls.length} tool(s): ${routerResult.functionCalls.map(f => f.name).join(', ')}`
          : `Synthesized skin health advice & barrier safety guidelines.`);

    const traceStep: PassOn = {
      thought: thoughtText,
      intent: routerResult.functionCalls.length > 0 ? 'tool_execution' : 'clinical_synthesis',
      status: routerResult.functionCalls.length > 0 ? 'need_info' : 'ready',
      nextTools: routerResult.functionCalls.map(fc => ({ name: fc.name, arguments: fc.args }))
    };

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
        passOnTrace: [...(state.passOnTrace || []), traceStep],
        llmMessages,
        status: 'calling_tools',
        iterations: currentIterations
      };
    }

    // LLM generated text response directly
    let responseText = routerResult.text || '';

    // Guard: Check if model outputted an intermediate monologue or if scan data query lacks tool execution
    const isMonologue = /function call to|I'll call access_file|I'll call|Let me access that file|Let me access the full scan|Let's parse the payload|I have successfully located your latest facial scan/i.test(responseText) || (responseText.trim().length < 30 && (state.toolResults?.length || 0) > 0);

    const isScanRequest = /face scan|facial scan|scan data|latest scan|scan record|vault scan/i.test(state.message || '');

    // Case A: Model outputted monologue or user asked for scan data, BUT NO tools have executed yet
    if ((isMonologue || isScanRequest) && (state.toolResults?.length || 0) === 0) {
      console.log('[ReasoningNode] Detected monologue or scan query prior to tool execution. Forcing retrieve_skin_scan_vault tool call...');
      const forcedToolCall: LLMFunctionCall = {
        name: 'retrieve_skin_scan_vault',
        args: { scanType: 'all', limit: 5 }
      };

      return {
        pendingFunctionCalls: [forcedToolCall],
        passOnTrace: [...(state.passOnTrace || []), traceStep],
        llmMessages,
        status: 'calling_tools',
        iterations: currentIterations
      };
    }

    // Case B: Model outputted monologue AFTER tools have executed -> Trigger synthesis pass
    if (isMonologue && (state.toolResults?.length || 0) > 0) {
      console.log('[ReasoningNode] Detected intermediate tool monologue instead of user report. Executing mandatory synthesis pass...');
      try {
        const synthesisMessages = [
          ...llmMessages,
          {
            role: 'user',
            parts: [{
              text: `You have retrieved all requested data and tool outputs from the Agent Vault / scan records. Present a complete, comprehensive, beautifully structured user-facing report summarizing all scan scores, metrics, skin health findings, and recommended routines. Do NOT output any meta-commentary about function calls or file access.`
            }]
          }
        ];

        const synthesisResult = await generateContentWithRouter({
          contents: synthesisMessages,
          systemInstruction: systemPrompt,
          temperature: 0.3,
          includeThoughts: true
        });

        if (synthesisResult.text && synthesisResult.text.trim().length > 0) {
          responseText = synthesisResult.text.trim();
        }
      } catch (synthErr) {
        console.warn('[ReasoningNode] Synthesis pass error:', synthErr);
      }
    }

    llmMessages.push({
      role: 'model',
      parts: [{ text: responseText }]
    });

    return {
      pendingFunctionCalls: [],
      passOnTrace: [...(state.passOnTrace || []), traceStep],
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
    userId: state.userId || 'guest_user',
    sessionId: state.sessionId || 'session_default',
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
