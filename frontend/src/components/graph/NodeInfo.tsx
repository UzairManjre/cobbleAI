import React from 'react';
import { useGraphStore } from '../../store/graphStore';
import { ArrowRight, ArrowLeft } from 'lucide-react';

interface NodeInfoProps {
  nodeId: string;
  onNavigate: (nodeId: string) => void;
}

const NodeInfo: React.FC<NodeInfoProps> = ({ nodeId, onNavigate }) => {
  const { nodes, edges, navigateToNode, isLoading } = useGraphStore();

  const currentNode = nodes.find((n) => n.id === nodeId);
  
  // Find connected neighbors
  const neighbors = edges.filter((e) => e.from === nodeId || e.to === nodeId);

  if (!currentNode) {
    return (
      <div className="p-6 text-white/20 text-[13px]">
        Select a node to view details
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Node Details */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-2">{currentNode.label}</h3>
        <p className="text-xs text-white/50 leading-relaxed">{currentNode.description}</p>
      </div>

      {/* Connected Concepts */}
      <div>
        <h4 className="text-[12px] font-medium text-white/40 uppercase tracking-wider mb-3">
          Connected Concepts
        </h4>
        <div className="space-y-2">
          {neighbors.map((edge) => {
            const isOutgoing = edge.from === nodeId;
            const neighborId = isOutgoing ? edge.to : edge.from;
            const neighborNode = nodes.find((n) => n.id === neighborId);

            if (!neighborNode) return null;

            return (
              <button
                key={edge.id}
                onClick={() => {
                  // Only call the parent handler which should trigger the store update
                  onNavigate(neighborId);
                }}
                disabled={isLoading}
                className="w-full flex items-center gap-3 p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] rounded-xl transition-all disabled:opacity-30 group"
              >
                <div className="flex-1 text-left">
                  <div className="text-[13px] text-white/80 group-hover:text-white transition-colors">
                    {neighborNode.label}
                  </div>
                  <div className="text-[10px] text-white/20 mt-0.5">
                    {edge.relation.replace(/_/g, ' ')}
                  </div>
                </div>
                {isOutgoing ? (
                  <ArrowRight className="w-3.5 h-3.5 text-white/20" />
                ) : (
                  <ArrowLeft className="w-3.5 h-3.5 text-white/20" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default NodeInfo;
