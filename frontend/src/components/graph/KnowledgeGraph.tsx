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

// --- Custom Node Implementation ---
const ConceptNode = ({ data, id }: NodeProps) => {
  const { visitedNodes, currentNodeId } = useGraphStore();
  const isCurrent = id === currentNodeId;
  const isVisited = visitedNodes.includes(id);

  // Difficulty-based colors
  const difficultyColor = data.difficulty === 'advanced' ? 'bg-[#FFD166]' :
                          data.difficulty === 'beginner' ? 'bg-[#06D6A0]' : 'bg-[#118AB2]';

  const borderColor = isCurrent
    ? 'border-[#FF4D5B]'
    : 'border-[#0A0A0A]';

  const bgColor = isCurrent
    ? 'bg-[#FDF0EF]'
    : isVisited
      ? 'bg-[#E6FAF5]'
      : 'bg-white';

  const shadowColor = isCurrent
    ? 'shadow-[4px_4px_0_#FF4D5B]'
    : 'shadow-[4px_4px_0_#0A0A0A]';

  return (
    <div className={`
      relative px-6 py-4 rounded-2xl transition-all duration-300
      border-[3px] cursor-pointer group ${borderColor} ${bgColor} ${shadowColor}
      hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0
    `}>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-[#0A0A0A] !border-none" />

      <div className="space-y-1">
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full border border-[#0A0A0A] ${difficultyColor}`} />
           <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#0A0A0A]/50">
             {data.difficulty || 'Concept'}
           </span>
        </div>
        <h4 className={`text-sm font-black tracking-tight text-[#0A0A0A]`}>
          {data.label}
        </h4>
        <p className="text-[11px] font-bold text-[#0A0A0A]/60 line-clamp-1 max-w-[180px]">
          {data.description}
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-[#0A0A0A] !border-none" />

      {/* Pulse effect for current node */}
      {isCurrent && (
        <div className="absolute bottom-2 right-3">
          <div className="w-2 h-2 rounded-full bg-[#FF4D5B] border border-[#0A0A0A] animate-ping" />
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
      position: { x: 0, y: 0 }, // Positioned by dagre
    }));

    const initialEdges: Edge[] = graphEdges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      animated: true,
      style: { stroke: '#0A0A0A', strokeWidth: 3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#0A0A0A' },
    }));

    return getLayoutedElements(initialNodes, initialEdges);
  }, [graphNodes, graphEdges]);

  const handleNodeClick = useCallback((_: any, node: Node) => {
    if (onNodeClick) onNodeClick(node.id);
  }, [onNodeClick]);

  return (
    <div className="w-full h-full bg-[#FCFCFC]">
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
        <Background color="#0A0A0A" gap={25} size={1.5} style={{ opacity: 0.06 }} />
        <Controls 
          className="!bg-white !border-2 !border-[#0A0A0A] !rounded-xl !shadow-[2px_2px_0_#0A0A0A] !overflow-hidden !fill-[#0A0A0A]" 
          showInteractive={false} 
        />
      </ReactFlow>
      
      {/* Legend */}
      <div className="absolute top-6 right-6 p-4 bg-white border-[3px] border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] pointer-events-none flex flex-col gap-2 font-['Outfit'] z-20">
         <div className="text-[10px] font-black uppercase tracking-wider text-[#0A0A0A] border-b-2 border-[#0A0A0A]/10 pb-1 mb-1">
           Legend
         </div>
         <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#06D6A0] border border-[#0A0A0A]" />
            <span className="text-[9px] text-[#0A0A0A] uppercase font-black tracking-wider">Foundation</span>
         </div>
         <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#118AB2] border border-[#0A0A0A]" />
            <span className="text-[9px] text-[#0A0A0A] uppercase font-black tracking-wider">Core Theory</span>
         </div>
         <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FFD166] border border-[#0A0A0A]" />
            <span className="text-[9px] text-[#0A0A0A] uppercase font-black tracking-wider">Advanced</span>
         </div>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
