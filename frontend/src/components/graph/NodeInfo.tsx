import { useParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { ArrowRight, ArrowLeft, TriangleAlert } from 'lucide-react';
import CitationList from '../tutor/CitationList';
import { evidenceToSource } from '../../types/graph';

interface NodeInfoProps {
  nodeId: string;
  onNavigate: (nodeId: string) => void;
}

const NodeInfo = ({ nodeId, onNavigate }: NodeInfoProps) => {
  const { nodes, edges, isLoading } = useGraphStore();
  const { courseId } = useParams();

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
        {currentNode.supported === false && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-[#B45309]">
            <TriangleAlert className="w-3.5 h-3.5" /> Not found in the course materials — treat with care.
          </p>
        )}
      </div>

      {/* Provenance: where the concept is stated, and lecture moments that explain it */}
      {currentNode.provenance && currentNode.provenance.length > 0 && (
        <div>
          <h4 className="text-[13px] font-black text-[#0A0A0A] uppercase tracking-wider mb-3 border-b-2 border-[#0A0A0A]/10 pb-2">
            Where this comes from
          </h4>
          <CitationList courseId={courseId} sources={currentNode.provenance.map(evidenceToSource)} title="Sources" />
        </div>
      )}

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
                  <div className="text-[11px] font-bold text-[#0A0A0A]/50 mt-1 uppercase tracking-wider flex items-center gap-2">
                    {edge.relation.replace(/_/g, ' ')}
                    {edge.supported === false && (
                      <span className="normal-case tracking-normal text-[10px] text-[#B45309] border border-[#B45309]/40 rounded px-1" title="No passage in the course materials states this relation">
                        unsupported
                      </span>
                    )}
                  </div>
                  {edge.provenance?.[0]?.quote && (
                    <div className="text-[11px] text-[#0A0A0A]/60 mt-1 font-['Inter'] line-clamp-2" title={edge.provenance[0].quote}>
                      “{edge.provenance[0].quote}”
                    </div>
                  )}
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
