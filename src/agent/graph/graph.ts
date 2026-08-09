import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { AgentStateAnnotation, AgentState } from './state.js';
import {
  planNode,
  loadMemoryNode,
  toolsNode,
  decideNode,
  approvalNode,
  scanMeasureNode,
  scanInterpretNode,
  scanRespondNode,
  finalizeNode
} from './nodes.js';

const MAX_ITERATIONS = 4;

// Persistent memory checkpointer for state checkpointing across thread sessions
export const checkpointer = new MemorySaver();

// Dedicated Scan Subgraph (Measure -> Interpret -> Respond)
export function createScanSubgraph() {
  return new StateGraph(AgentStateAnnotation)
    .addNode('scan_measure', scanMeasureNode)
    .addNode('scan_interpret', scanInterpretNode)
    .addNode('scan_respond', scanRespondNode)
    .addEdge(START, 'scan_measure')
    .addEdge('scan_measure', 'scan_interpret')
    .addEdge('scan_interpret', 'scan_respond')
    .addEdge('scan_respond', END)
    .compile();
}

export const scanSubgraph = createScanSubgraph();

function routeStep(state: AgentState): 'load_memory' | 'scan_pipeline' | 'approval' | 'finalize' {
  const isScanRequest = /(scan|analyze skin|skin barrier|photo assessment|readness assessment)/i.test(state.message);
  if (isScanRequest && state.iterations === 1 && state.passOn?.status !== 'ready') {
    return 'scan_pipeline';
  }

  if (state.passOn?.status === 'need_approval' || (state.passOn?.actionProposal && state.passOn?.status !== 'ready')) {
    return 'approval';
  }

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
    .addNode('scan_pipeline', scanSubgraph)
    .addNode('approval', approvalNode)
    .addNode('finalize', finalizeNode)
    .addEdge(START, 'plan')
    .addConditionalEdges('plan', routeStep, {
      load_memory: 'load_memory',
      scan_pipeline: 'scan_pipeline',
      approval: 'approval',
      finalize: 'finalize'
    })
    .addEdge('load_memory', 'tools')
    .addEdge('tools', 'decide')
    .addConditionalEdges('decide', routeStep, {
      load_memory: 'load_memory',
      scan_pipeline: 'scan_pipeline',
      approval: 'approval',
      finalize: 'finalize'
    })
    .addEdge('scan_pipeline', 'finalize')
    .addEdge('approval', END)
    .addEdge('finalize', END);

  return workflow.compile({ checkpointer });
}

export const sanaGraph = createSanaGraph();
