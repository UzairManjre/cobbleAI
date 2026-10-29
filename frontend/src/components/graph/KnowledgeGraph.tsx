import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MarkerType,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useGraphStore } from '../../store/graphStore';
import dagre from 'dagre';
import { CheckCircle, Lock, Sparkles } from 'lucide-react';

// --- Custom Node Implementation ---
const ConceptNode = ({ data, id }: NodeProps) => {
  const { visitedNodes, masteredNodes, currentNodeId, edges } = useGraphStore();
  
  const isCurrent = id === currentNodeId;
  const isMastered = masteredNodes.includes(id);
  const isVisited = visitedNodes.includes(id);

  // A node is locked if it has incoming edges and at least one predecessor is neither visited nor mastered
  const incomingEdges = edges.filter(e => e.to === id);
  const isLocked = incomingEdges.length > 0 && incomingEdges.some(
    e => !visitedNodes.includes(e.from) && !masteredNodes.includes(e.from)
  );

  // Difficulty badge colors
  const difficultyColor = data.difficulty === 'advanced' ? 'bg-amber-400 text-amber-950' :
                          data.difficulty === 'beginner' ? 'bg-emerald-400 text-emerald-950' : 'bg-blue-400 text-blue-950';

  // Dynamic visual states
  let cardStyle = 'bg-[#0A0A0A] border-[#1A1A1A] text-white hover:border-[#333333]';
  let badgeStyle = 'bg-[#111111] text-[#888888] border-[#1A1A1A]';
  let statusText = 'Unlocked';
  let StatusIcon = Sparkles;

  if (isMastered) {
    cardStyle = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.12)]';
    badgeStyle = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    statusText = 'Mastered';
    StatusIcon = CheckCircle;
  } else if (isLocked) {
    cardStyle = 'bg-[#050505] border-[#1A1A1A] text-[#888888] opacity-60 cursor-not-allowed';
    badgeStyle = 'bg-[#111111] text-[#A3A3A3] border-[#1A1A1A]';
    statusText = 'Locked';
    StatusIcon = Lock;
  } else if (isVisited) {
    cardStyle = 'bg-blue-500/5 border-blue-500/30 text-white hover:border-blue-500/50';
    badgeStyle = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    statusText = 'In Progress';
    StatusIcon = Sparkles;
  }

  if (isCurrent) {
    cardStyle = `${cardStyle} ring-2 ring-blue-500/50 border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]`;
  }

  return (
    <div 
      role="button"
      tabIndex={0}
      aria-label={`${data.label} - ${statusText} - ${data.difficulty || 'Core'}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // ReactFlow handles selection when nodes are focused and enter is pressed
        }
      }}
      className={`
      relative px-5 py-4 rounded-2xl transition-all duration-300
      border cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cardStyle}
    `}>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-[#333333] !border-none" />

      <div className="space-y-1.5 min-w-[170px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span className={`text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border ${badgeStyle}`}>
              {statusText}
            </span>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${difficultyColor}`}>
            {data.difficulty || 'Core'}
          </span>
        </div>

        <h4 className="text-sm font-medium tracking-tight leading-snug">
          {data.label}
        </h4>

        <p className="text-[11px] text-[#888888] line-clamp-1 max-w-[190px]">
          {data.description}
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-[#333333] !border-none" />

      {/* Pulse effect for current active node */}
      {isCurrent && (
        <div className="absolute -top-1 -right-1">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 absolute inset-0" />
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  concept: ConceptNode,
};

// --- Dagre Layout Engine ---
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 220;
  const nodeHeight = 90;
  
  dagreGraph.setGraph({ rankdir: direction, ranksep: 90, nodesep: 70 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};

interface KnowledgeGraphProps {
  onNodeClick?: (nodeId: string) => void;
}

const KnowledgeGraph = ({ onNodeClick }: KnowledgeGraphProps) => {
  const { nodes: graphNodes, edges: graphEdges } = useGraphStore();

  const { nodes, edges } = useMemo(() => {
    if (graphNodes.length === 0) return { nodes: [], edges: [] };

    const initialNodes: Node[] = graphNodes.map((node) => ({
      id: node.id,
      type: 'concept',
      data: {
        label: node.label,
        description: node.description,
        difficulty: node.difficulty
      },
      position: { x: 0, y: 0 },
    }));

    // Relation labels; relations not supported by the materials are dashed amber
    const initialEdges: Edge[] = graphEdges.map((edge) => {
      const unsupported = edge.supported === false;
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        animated: !unsupported,
        label: edge.relation.replace(/_/g, ' '),
        labelStyle: { fill: unsupported ? '#F59E0B' : '#888888', fontSize: 10 },
        labelBgStyle: { fill: '#050505' },
        style: unsupported
          ? { stroke: '#B45309', strokeWidth: 1.5, strokeDasharray: '6 4' }
          : { stroke: '#333333', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: unsupported ? '#B45309' : '#888888' },
      };
    });

    return getLayoutedElements(initialNodes, initialEdges);
  }, [graphNodes, graphEdges]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    if (onNodeClick) onNodeClick(node.id);
  }, [onNodeClick]);

  return (
    <div className="w-full h-full bg-[#050505] relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="#333333" gap={24} size={1} style={{ opacity: 0.15 }} />
        <Controls 
          className="!bg-[#0A0A0A] !border !border-[#1A1A1A] !rounded-xl !shadow-2xl !overflow-hidden !fill-[#888888]" 
          showInteractive={false} 
        />
      </ReactFlow>
      
      {/* Legend */}
      <div className="absolute top-4 right-4 p-3 bg-[#0A0A0A]/90 backdrop-blur-md border border-[#1A1A1A] rounded-xl pointer-events-none flex flex-col gap-2 z-20">
         <div className="text-[10px] font-semibold uppercase tracking-widest text-[#888888] border-b border-[#1A1A1A] pb-1">
           Node States
         </div>
         <div className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-[#CCCCCC]">Mastered</span>
         </div>
         <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-[#CCCCCC]">Unlocked / Ready</span>
         </div>
         <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-[#888888]" />
            <span className="text-xs text-[#A3A3A3]">Locked (Prerequisite)</span>
         </div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
