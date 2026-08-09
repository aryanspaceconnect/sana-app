import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from './state.js';
import { planNode, loadMemoryNode, toolsNode, decideNode, finalizeNode } from './nodes.js';

const MAX_ITERATIONS = 4;

function routeStep(state: AgentState): 'load_memory' | 'finalize' {
  if (state.passOn?.status === 'need_info' && state.iterations < MAX_ITERATIONS) {
    return 'load_memory';
  }
  return 'finalize';
}

export function createSanaGraph() {
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('plan', planNode)
    .addNode('load_memory', loadMemoryNode)
    .addNode('tools', toolsNode)
    .addNode('decide', decideNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'plan')
    .addConditionalEdges('plan', routeStep, {
      load_memory: 'load_memory',
      finalize: 'finalize'
    })
    .addEdge('load_memory', 'tools')
    .addEdge('tools', 'decide')
    .addConditionalEdges('decide', routeStep, {
      load_memory: 'load_memory',
      finalize: 'finalize'
    })
    .addEdge('finalize', END);

  return workflow.compile();
}

export const sanaGraph = createSanaGraph();
