import { sanaGraph } from './graph.js';
import { AgentRunParams, AgentRunResult, PassOn } from '../types.js';
import { saveVaultSession } from '../agentVault.js';
import { AgentState } from './state.js';

export async function runSanaAgentGraph(params: AgentRunParams): Promise<AgentRunResult> {
  const sessionId = params.sessionId || `session_${Date.now()}`;

  const initialState: AgentState = {
    userId: params.userId,
    sessionId,
    message: params.message,
    history: params.history || [],
    passOn: null,
    passOnTrace: [],
    toolResults: [],
    pendingFunctionCalls: [],
    llmMessages: [],
    status: 'thinking',
    sessionNotepad: '',
    context: { userId: params.userId, sessionId },
    finalText: null,
    actionProposal: null,
    iterations: 0,
    onProgress: params.onProgress
  };

  const config = { configurable: { thread_id: sessionId } };

  let finalState: AgentState = initialState;

  try {
    // Stream state updates through the LangGraph StateGraph
    const eventStream = await sanaGraph.stream(initialState, { ...config, streamMode: 'values' });

    for await (const chunk of eventStream) {
      const stateChunk = chunk as unknown as AgentState;
      finalState = stateChunk;

      if (params.onProgress && stateChunk.finalText) {
        params.onProgress(stateChunk.finalText);
      }
    }
  } catch (err: any) {
    console.warn('[LangGraph] Stream error, falling back to graph invoke:', err?.message || err);
    try {
      finalState = (await sanaGraph.invoke(initialState, config)) as AgentState;
    } catch (invokeErr: any) {
      console.error('[LangGraph] Invoke error across all models:', invokeErr?.message || invokeErr);
      finalState = {
        ...initialState,
        finalText: "I am SANA, your skin health agent. I am currently operating in high-demand safeguard mode. For skin barrier safety: 1. Keep active ingredients separated (e.g. retinoids at night, Vitamin C in AM). 2. Apply broad-spectrum SPF 50 daily. 3. Use ceramide-rich moisturizers if experiencing irritation.",
        passOnTrace: [
          {
            thought: `Safeguard triggered: ${invokeErr?.message || 'LLM model quota limit'}`,
            intent: 'clinical_synthesis',
            status: 'ready'
          }
        ]
      };
    }
  }

  const finalOutputText = finalState.finalText || "I am SANA, your skin health agent. How can I assist with your routine today?";

  // Save session trace to Vault memory
  try {
    const messagesList = (params.history || [])
      .map(h => ({
        role: h.role as 'user' | 'model',
        text: h.text,
        timestamp: new Date().toISOString()
      }))
      .concat([{ role: 'model', text: finalOutputText, timestamp: new Date().toISOString() }]);

    await saveVaultSession(params.userId, {
      sessionId,
      startedAt: new Date().toISOString(),
      status: 'active',
      summary: finalOutputText.slice(0, 200),
      messages: messagesList,
      intentHistory: ['autonomous_react_loop'],
      passOnTrace: finalState.passOnTrace || []
    });
  } catch (err) {
    console.warn('[LangGraph] Error saving session to Vault:', err);
  }

  return {
    text: finalOutputText,
    actionProposal: finalState.actionProposal || undefined,
    sessionId,
    passOnTrace: finalState.passOnTrace || [],
    iterations: finalState.iterations || 1,
    toolResults: finalState.toolResults || []
  };
}
