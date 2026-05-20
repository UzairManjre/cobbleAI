import { useGraphStore } from '../../store/graphStore';
import { ArrowRight, ArrowLeft } from 'lucide-react';

interface NodeInfoProps {
  nodeId: string;
  onNavigate: (nodeId: string) => void;
}

const NodeInfo = ({ nodeId, onNavigate }: NodeInfoProps) => {
  const { nodes, edges, isLoading } = useGraphStore();

  const currentNode = nodes.find((n) => n.id === nodeId);
  
  // Find connected neighbors
  const neighbors = edges.filter((e) => e.from === nodeId || e.to === nodeId);

  if (!currentNode) {
    return (
      <div className="p-6 text-[#0A0A0A]/40 text-[14px] font-black uppercase tracking-widest text-center">
        Select a concept to view details
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 bg-white font-['Outfit']">
      {/* Node Details */}
      <div className="bg-[#FFD166]/20 border-2 border-[#FFD166] p-5 rounded-2xl">
        <h3 className="text-xl font-black text-[#0A0A0A] mb-3 leading-tight">{currentNode.label}</h3>
        <p className="text-sm text-[#0A0A0A]/80 font-['Inter'] font-medium leading-relaxed">{currentNode.description}</p>
      </div>

      {/* Connected Concepts */}
      <div>
        <h4 className="text-[13px] font-black text-[#0A0A0A] uppercase tracking-wider mb-4 border-b-2 border-[#0A0A0A]/10 pb-2">
          Connected Concepts
        </h4>
        <div className="space-y-3">
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
                className="w-full flex items-center gap-4 p-4 bg-white hover:bg-gray-50 border-2 border-[#0A0A0A] rounded-xl transition-all shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none disabled:opacity-50 group"
              >
                <div className="flex-1 text-left">
                  <div className="text-[15px] font-extrabold text-[#0A0A0A]">
                    {neighborNode.label}
                  </div>
                  <div className="text-[11px] font-bold text-[#0A0A0A]/50 mt-1 uppercase tracking-wider">
                    {edge.relation.replace(/_/g, ' ')}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-[#0A0A0A] bg-gray-100 flex items-center justify-center shrink-0">
                  {isOutgoing ? (
                    <ArrowRight className="w-4 h-4 text-[#0A0A0A] stroke-[3px]" />
                  ) : (
                    <ArrowLeft className="w-4 h-4 text-[#0A0A0A] stroke-[3px]" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default NodeInfo;
