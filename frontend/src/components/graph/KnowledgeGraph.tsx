import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGraphStore } from '../../store/graphStore';
import dagre from 'dagre';
import { CheckCircle, Circle, Eye, Lock, Maximize2 } from 'lucide-react';
import type { GraphEdge as CourseEdge } from '../../types/graph';
import { conceptState, relationText, type ConceptState } from '../../utils/concepts';

const NODE_WIDTH = 230;
const NODE_HEIGHT = 84;

interface ConceptData {
  label: string;
  difficulty?: string;
  state: ConceptState;
  current: boolean;
  dimmed: boolean;
}

const STATE_STYLE: Record<ConceptState, { card: string; tag: string; label: string; Icon: typeof Circle }> = {
  mastered: { card: 'bg-emerald-500/10 border-emerald-500/40', tag: 'text-emerald-400', label: 'Mastered', Icon: CheckCircle },
  visited: { card: 'bg-[#0B1220] border-blue-500/30', tag: 'text-blue-400', label: 'Visited', Icon: Eye },
  locked: { card: 'bg-[#0A0A0A] border-[#1F1F1F]', tag: 'text-[#777777]', label: 'Study prerequisites first', Icon: Lock },
  open: { card: 'bg-[#101010] border-[#2A2A2A]', tag: 'text-[#A3A3A3]', label: 'Not started', Icon: Circle },
};

const DIFFICULTY_TEXT: Record<string, string> = {
  beginner: 'text-emerald-300',
  intermediate: 'text-blue-300',
  advanced: 'text-amber-300',
};

/** Each concept reads its state from data, so streaming chat tokens never re-render the map. */
const ConceptNode = ({ data }: NodeProps<ConceptData>) => {
  const style = STATE_STYLE[data.state];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${data.label} - ${style.label} - ${data.difficulty || 'core'}`}
      style={{ width: NODE_WIDTH }}
      className={`relative px-4 py-3 rounded-xl border cursor-pointer transition-all duration-300 hover:border-[#555555]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${style.card}
        ${data.current ? '!border-blue-500 ring-2 ring-blue-500/60 shadow-[0_0_28px_rgba(59,130,246,0.35)]' : ''}
        ${data.dimmed ? 'opacity-30' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-[#444444] !border-none" />
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider truncate ${style.tag}`}>
          <style.Icon className="w-3 h-3 shrink-0" />
          {data.state === 'locked' ? 'Locked' : style.label}
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${DIFFICULTY_TEXT[data.difficulty || ''] || 'text-[#888888]'}`}>
          {data.difficulty || 'core'}
        </span>
      </div>
      <div className={`text-[15px] font-medium leading-snug line-clamp-2 ${data.state === 'locked' ? 'text-[#AAAAAA]' : 'text-white'}`}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-[#444444] !border-none" />
    </div>
  );
};

const nodeTypes = { concept: ConceptNode };

/** Top-to-bottom layout; positions depend only on the graph, not on study progress. */
function layoutPositions(nodeIds: string[], edges: CourseEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50 });
  nodeIds.forEach(id => g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach(e => { if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to); });
  dagre.layout(g);
  const positions: Record<string, { x: number; y: number }> = {};
  nodeIds.forEach(id => {
    const p = g.node(id);
    positions[id] = { x: p.x - NODE_WIDTH / 2, y: p.y - NODE_HEIGHT / 2 };
  });
  return positions;
}

const MINIMAP_COLOR: Record<ConceptState, string> = {
  mastered: '#10B981', visited: '#3B82F6', locked: '#2A2A2A', open: '#555555',
};

interface KnowledgeGraphProps {
  onNodeClick?: (nodeId: string) => void;
}

function GraphCanvas({ onNodeClick }: KnowledgeGraphProps) {
  const graphNodes = useGraphStore(s => s.nodes);
  const graphEdges = useGraphStore(s => s.edges);
  const currentNodeId = useGraphStore(s => s.currentNodeId);
  const visitedNodes = useGraphStore(s => s.visitedNodes);
  const masteredNodes = useGraphStore(s => s.masteredNodes);
  const flow = useReactFlow();
  const [ready, setReady] = useState(false);

  const positions = useMemo(
    () => layoutPositions(graphNodes.map(n => n.id), graphEdges),
    [graphNodes, graphEdges],
  );

  const { nodes, edges } = useMemo(() => {
    const neighbours = new Set<string>();
    graphEdges.forEach(e => {
      if (e.from === currentNodeId) neighbours.add(e.to);
      if (e.to === currentNodeId) neighbours.add(e.from);
    });
    const focused = !!currentNodeId && graphNodes.some(n => n.id === currentNodeId);

    const flowNodes: Node<ConceptData>[] = graphNodes.map(node => ({
      id: node.id,
      type: 'concept',
      position: positions[node.id] || { x: 0, y: 0 },
      data: {
        label: node.label,
        difficulty: node.difficulty,
        state: conceptState(node.id, graphEdges, visitedNodes, masteredNodes),
        current: node.id === currentNodeId,
        dimmed: focused && node.id !== currentNodeId && !neighbours.has(node.id),
      },
    }));

    // Only the current concept's links carry labels; AI-inferred links (no passage supports them) stay dashed amber
    const flowEdges: Edge[] = graphEdges.map(edge => {
      const unsupported = edge.supported === false;
      const touching = edge.from === currentNodeId || edge.to === currentNodeId;
      const stroke = unsupported ? '#B45309' : touching ? '#60A5FA' : '#3A3A3A';
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: touching ? relationText(edge.relation) : undefined,
        labelStyle: { fill: unsupported ? '#F59E0B' : '#CBD5E1', fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: '#050505', fillOpacity: 0.9 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        zIndex: touching ? 10 : 0,
        style: {
          stroke,
          strokeWidth: touching ? 2.25 : 1.25,
          strokeDasharray: unsupported ? '6 4' : undefined,
          opacity: focused && !touching ? 0.35 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 },
      };
    });
    return { nodes: flowNodes, edges: flowEdges };
  }, [graphNodes, graphEdges, positions, currentNodeId, visitedNodes, masteredNodes]);

  // Follow the student: centre the current concept whenever it changes
  useEffect(() => {
    if (!ready) return;
    const p = currentNodeId ? positions[currentNodeId] : undefined;
    if (p) {
      flow.setCenter(p.x + NODE_WIDTH / 2, p.y + NODE_HEIGHT / 2, { zoom: Math.max(flow.getZoom(), 0.85), duration: 500 });
    } else {
      flow.fitView({ padding: 0.15 });
    }
  }, [ready, currentNodeId, positions, flow]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div className="w-full h-full bg-[#050505] relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onInit={() => setReady(true)}
        minZoom={0.1}
        maxZoom={1.75}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#2A2A2A" gap={28} size={1} />
        <Controls
          position="bottom-left"
          className="!bg-[#0A0A0A] !border !border-[#1A1A1A] !rounded-xl !shadow-2xl !overflow-hidden [&>button]:!bg-[#0A0A0A] [&>button]:!border-[#1A1A1A] [&>button]:!fill-[#AAAAAA] [&>button:hover]:!bg-[#1A1A1A]"
          showInteractive={false}
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          className="!bg-[#0A0A0A] !border !border-[#1A1A1A] !rounded-xl overflow-hidden"
          maskColor="rgba(0,0,0,0.65)"
          nodeColor={node => (node.data as ConceptData)?.current ? '#60A5FA' : MINIMAP_COLOR[(node.data as ConceptData)?.state || 'open']}
          nodeBorderRadius={6}
        />
      </ReactFlow>

      {/* Legend and "show everything" */}
      <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 px-3 py-2 bg-[#0A0A0A]/90 backdrop-blur border border-[#1A1A1A] rounded-xl text-[11px] text-[#AAAAAA]">
          <span className="flex items-center gap-1.5"><CheckCircle className="w-3 h-3 text-emerald-400" /> Mastered</span>
          <span className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-blue-400" /> Visited</span>
          <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-[#777777]" /> Prerequisites first</span>
          <span className="flex items-center gap-1.5" title="No single passage in your materials discusses both concepts, so the AI inferred this link">
            <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke="#B45309" strokeWidth="2" strokeDasharray="4 3" /></svg>
            AI-inferred link
          </span>
        </div>
        <button
          onClick={() => flow.fitView({ padding: 0.15, duration: 400 })}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-[#0A0A0A]/90 backdrop-blur border border-[#1A1A1A] hover:border-[#333333] rounded-xl text-[11px] text-[#CCCCCC] hover:text-white"
        >
          <Maximize2 className="w-3 h-3" /> Show whole map
        </button>
      </div>
    </div>
  );
}

const KnowledgeGraph = (props: KnowledgeGraphProps) => (
  <ReactFlowProvider>
    <GraphCanvas {...props} />
  </ReactFlowProvider>
);

export default KnowledgeGraph;
