import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Controls,
  Background,
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
import { Check, Lock, Maximize2 } from 'lucide-react';
import type { GraphEdge as CourseEdge } from '../../types/graph';
import { conceptState, relationText, type ConceptState } from '../../utils/concepts';

const NODE_WIDTH = 230;
const NODE_HEIGHT = 64;

interface ConceptData {
  label: string;
  difficulty?: string;
  state: ConceptState;
  current: boolean;
  dimmed: boolean;
}

// Light, one-accent cards: state shows as a fill step, never a new hue
const STATE_STYLE: Record<ConceptState, { card: string; text: string; label: string }> = {
  mastered: { card: 'bg-surface border-ink', text: 'text-ink', label: 'Mastered' },
  visited: { card: 'bg-accent-wash border-accent-100', text: 'text-ink', label: 'Visited' },
  locked: { card: 'bg-sunken border-line', text: 'text-ink-4', label: 'Prerequisites first' },
  open: { card: 'bg-surface border-line-strong', text: 'text-ink', label: 'Not started' },
};

/** Each concept reads its state from data, so streaming chat tokens never re-render the map. */
const ConceptNode = ({ data }: NodeProps<ConceptData>) => {
  const style = STATE_STYLE[data.state];
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${data.label} - ${style.label}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      className={`relative px-4 py-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-[opacity,border-color] duration-300 hover:border-ink
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${style.card}
        ${data.current ? '!border-accent !border-2 !bg-surface' : ''}
        ${data.dimmed ? 'opacity-35' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-transparent !border-none" />
      <span className={`flex-1 font-display text-sm font-medium leading-snug tracking-[-0.01em] line-clamp-2 ${style.text}`}>
        {data.label}
      </span>
      {data.state === 'mastered' && <Check className="w-3.5 h-3.5 text-ink shrink-0" aria-hidden />}
      {data.state === 'locked' && <Lock className="w-3 h-3 text-ink-4 shrink-0" aria-hidden />}
      <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-transparent !border-none" />
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
      const stroke = touching ? '#073dea' : unsupported ? '#8e8e93' : '#cdcdd2';
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: touching ? relationText(edge.relation) : undefined,
        labelStyle: { fill: '#5c5c62', fontSize: 11, fontWeight: 500, fontFamily: 'Space Grotesk, system-ui, sans-serif' },
        labelBgStyle: { fill: '#f9f9f9', fillOpacity: 1 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        zIndex: touching ? 10 : 0,
        style: {
          stroke,
          strokeWidth: touching ? 1.75 : 1,
          strokeDasharray: unsupported ? '6 4' : undefined,
          opacity: focused && !touching ? 0.35 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
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
    <div className="w-full h-full bg-surface relative">
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
        <Background color="#e4e4e7" gap={28} size={1} />
        <Controls
          position="bottom-left"
          className="!bg-surface !border !border-line !rounded-xl !shadow-none !overflow-hidden [&>button]:!bg-surface [&>button]:!border-line [&>button]:!fill-[#5c5c62] [&>button:hover]:!bg-sunken"
          showInteractive={false}
        />
      </ReactFlow>

      {/* One line of key, and "show everything" */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
        <button
          onClick={() => flow.fitView({ padding: 0.15, duration: 400 })}
          className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-surface border border-line-strong hover:border-ink text-xs font-display text-ink-2"
        >
          <Maximize2 className="w-3 h-3" /> Whole map
        </button>
        <p className="text-xs text-ink-3 bg-canvas/90 px-1.5 py-0.5 rounded"
          title="A dashed link was inferred by the AI; no single passage in your materials supports it.">
          Blue: opened · Black outline: mastered · Dashed: inferred link
        </p>
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
