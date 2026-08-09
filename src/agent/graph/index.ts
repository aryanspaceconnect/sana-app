import { sanaGraph } from './graph.js';
import { AgentRunParams, AgentRunResult } from '../types.js';
import { saveVaultSession } from '../agentVault.js';

export async function runSanaAgentGraph(params: AgentRunParams): Promise<AgentRunResult> {
  const sessionId = params.sessionId || `session_${Date.now()}`;

  const initialState = {
    userId: params.userId,
    sessionId,
    message: params.message,
    history: params.history || [],
    passOn: null,
    passOnTrace: [],
    toolResults: [],
    context: { userId: params.userId, sessionId },
    finalText: null,
    actionProposal: null,
    iterations: 0,
    onProgress: params.onProgress
  };

  const finalState = await sanaGraph.invoke(initialState);

  const finalOutputText = finalState.finalText || "I am SANA, your skin health agent. How can I assist with your routine today?";
  const passOnTrace = finalState.passOnTrace || [];

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
      intentHistory: passOnTrace.map(p => p.intent),
      passOnTrace
    });
  } catch (err) {
    console.warn('[LangGraph] Error saving session to Vault:', err);
  }

  return {
    text: finalOutputText,
    actionProposal: finalState.actionProposal || undefined,
    sessionId,
    passOnTrace,
    iterations: finalState.iterations || 1
  };
}
