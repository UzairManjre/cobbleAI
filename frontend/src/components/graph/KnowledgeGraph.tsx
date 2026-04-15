import React, { useCallback, useMemo } from 'react';
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

// --- Custom Node Implementation ---
const ConceptNode = ({ data, id }: NodeProps) => {
  const { visitedNodes, currentNodeId } = useGraphStore();
  const isCurrent = id === currentNodeId;
  const isVisited = visitedNodes.includes(id);

  // Difficulty-based colors
  const difficultyColor = data.difficulty === 'advanced' ? 'bg-amber-400' :
                          data.difficulty === 'beginner' ? 'bg-emerald-400' : 'bg-blue-400';

  const borderColor = isCurrent
    ? 'border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
    : isVisited
      ? 'border-emerald-500/20'
      : 'border-white/10 hover:border-white/20';

  const bgColor = isCurrent
    ? 'bg-blue-500/10 scale-105'
    : isVisited
      ? 'bg-emerald-500/5'
      : 'bg-white/[0.03]';

  return (
    <div className={`
      relative px-6 py-4 rounded-2xl transition-all duration-300
      backdrop-blur-xl border-2 cursor-pointer group ${borderColor} ${bgColor}
    `}>
      {/* Glow background */}
      {isCurrent && (
        <div className="absolute -inset-2 bg-blue-500/20 blur-2xl rounded-3xl -z-10" />
      )}

      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/20 !border-none" />

      <div className="space-y-1">
        <div className="flex items-center gap-2">
           <div className={`w-1.5 h-1.5 rounded-full ${difficultyColor}`} />
           <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
             {data.difficulty || 'Concept'}
           </span>
        </div>
        <h4 className={`text-sm font-semibold tracking-tight ${isCurrent ? 'text-white' : 'text-white/80'}`}>
          {data.label}
        </h4>
        <p className="text-[11px] text-white/40 line-clamp-1 max-w-[180px]">
          {data.description}
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/20 !border-none" />

      {/* Pulse effect for current node */}
      {isCurrent && (
        <div className="absolute bottom-1 right-3">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        </div>
      )}
    </div>
  );
};

// Define nodeTypes outside component to prevent React Flow warning
const nodeTypes = {
  concept: ConceptNode,
};

// --- Dagre Layout Engine ---
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  
  const nodeWidth = 220;
  const nodeHeight = 80;
  
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 });

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

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ onNodeClick }) => {
  const { nodes: graphNodes, edges: graphEdges, currentNodeId } = useGraphStore();

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
      position: { x: 0, y: 0 }, // Positioned by dagre
    }));

    const initialEdges: Edge[] = graphEdges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      animated: true,
      style: { stroke: 'rgba(255, 255, 255, 0.1)', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255, 255, 255, 0.2)' },
    }));

    return getLayoutedElements(initialNodes, initialEdges);
  }, [graphNodes, graphEdges]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    if (onNodeClick) onNodeClick(node.id);
  }, [onNodeClick]);

  return (
    <div className="w-full h-full bg-[#080808]">
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
        <Background color="#111" gap={30} size={1} />
        <Controls 
          className="!bg-black/50 !border-white/10 !fill-white" 
          showInteractive={false} 
        />
      </ReactFlow>
      
      {/* Legend */}
      <div className="absolute top-6 right-6 p-4 bg-white/[0.02] border border-white/5 backdrop-blur-md rounded-2xl pointer-events-none flex flex-col gap-2">
         <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Foundation</span>
         </div>
         <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Core Theory</span>
         </div>
         <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] text-white/40 uppercase font-bold tracking-tighter">Advanced Implementation</span>
         </div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
