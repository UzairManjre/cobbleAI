import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { Award, CheckCircle, ChevronRight, Lock, TriangleAlert } from 'lucide-react';
import CitationList from '../tutor/CitationList';
import { evidenceToSource, type GraphEdge } from '../../types/graph';
import { conceptState, missingPrerequisites, relationText, type ConceptState } from '../../utils/concepts';
import { sourceLocation } from '../../utils/format';

interface NodeInfoProps {
  nodeId: string;
  onNavigate: (nodeId: string) => void;
}

const STATE_CHIP: Record<ConceptState, { label: string; className: string }> = {
  mastered: { label: 'Mastered', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  visited: { label: 'Visited', className: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
  locked: { label: 'Prerequisites first', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  open: { label: 'Not started', className: 'bg-[#111111] text-[#AAAAAA] border-[#262626]' },
};

const DIFFICULTY_CHIP: Record<string, string> = {
  beginner: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  intermediate: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  advanced: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
};

const STATE_DOT: Record<ConceptState, string> = {
  mastered: 'bg-emerald-400', visited: 'bg-blue-400', locked: 'bg-[#444444]', open: 'bg-[#777777]',
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[#777777] mb-3">{children}</h4>;
}

/** The current concept: what it is, what to study first, where it comes from and what it links to. */
const NodeInfo = ({ nodeId, onNavigate }: NodeInfoProps) => {
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const visited = useGraphStore(s => s.visitedNodes);
  const mastered = useGraphStore(s => s.masteredNodes);
  const isLoading = useGraphStore(s => s.isLoading);
  const toggleMastered = useGraphStore(s => s.toggleMastered);
  const { courseId } = useParams();

  const node = nodes.find(n => n.id === nodeId);
  if (!node) {
    return <div className="p-6 text-sm text-[#888888] text-center">Select a concept on the map to see its details.</div>;
  }

  const state = conceptState(node.id, edges, visited, mastered);
  const isMastered = state === 'mastered';
  const prerequisites = missingPrerequisites(node.id, nodes, edges, visited, mastered);

  // The same passage can back a concept twice (a quote and a mention): list each place once
  const seen = new Set<string>();
  const sources = (node.provenance || [])
    .map(evidenceToSource)
    .filter(s => {
      const key = `${s.doc_id || s.filename}|${sourceLocation(s)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Links into this concept first (what it builds on), then links out of it
  const connections: { edge: GraphEdge; incoming: boolean }[] = [
    ...edges.filter(e => e.to === nodeId).map(edge => ({ edge, incoming: true })),
    ...edges.filter(e => e.from === nodeId).map(edge => ({ edge, incoming: false })),
  ];

  return (
    <div className="p-6 space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${DIFFICULTY_CHIP[node.difficulty || ''] || 'bg-[#111111] text-[#AAAAAA] border-[#262626]'}`}>
            {node.difficulty || 'core'}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATE_CHIP[state].className}`}>
            {STATE_CHIP[state].label}
          </span>
        </div>
        <h2 className="text-2xl font-outfit font-light text-white leading-tight tracking-tight">{node.label}</h2>
        {node.description && <p className="mt-3 text-sm leading-relaxed text-[#BBBBBB]">{node.description}</p>}
        {node.supported === false && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-300">
            <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" /> No passage in the course materials states this concept. Treat it with care.
          </p>
        )}
        <button
          onClick={() => toggleMastered(node.id)}
          className={`mt-5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 ${
            isMastered
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
              : 'bg-white text-black border-white hover:bg-neutral-200'
          }`}
        >
          {isMastered ? <CheckCircle className="w-3.5 h-3.5" /> : <Award className="w-3.5 h-3.5" />}
          {isMastered ? 'Mastered (undo)' : 'Mark as mastered'}
        </button>
      </section>

      {prerequisites.length > 0 && (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
            <Lock className="w-3.5 h-3.5" /> Builds on {prerequisites.length === 1 ? 'a concept' : `${prerequisites.length} concepts`} you haven't studied yet
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {prerequisites.map(p => (
              <button
                key={p.id}
                onClick={() => onNavigate(p.id)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-lg text-xs text-white bg-[#111111] border border-[#2A2A2A] hover:border-amber-500/50 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#888888]">You can still study this one; starting there makes it easier.</p>
        </section>
      )}

      {sources.length > 0 && (
        <section>
          <SectionTitle>Where this comes from</SectionTitle>
          <CitationList courseId={courseId} sources={sources} title="Sources" />
        </section>
      )}

      {connections.length > 0 && (
        <section>
          <SectionTitle>Connections · {connections.length}</SectionTitle>
          <div className="space-y-2">
            {connections.map(({ edge, incoming }) => {
              const otherId = incoming ? edge.from : edge.to;
              const other = nodes.find(n => n.id === otherId);
              if (!other) return null;
              const otherState = conceptState(other.id, edges, visited, mastered);
              const quote = edge.provenance?.[0]?.quote;
              return (
                <button
                  key={edge.id}
                  onClick={() => onNavigate(otherId)}
                  disabled={isLoading}
                  className="w-full text-left p-3 rounded-xl border border-[#1A1A1A] bg-[#0A0A0A] hover:bg-[#111111] hover:border-[#333333] transition-colors disabled:opacity-50 group"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATE_DOT[otherState]}`} aria-hidden />
                    <span className="flex-1 min-w-0 text-sm leading-snug">
                      {incoming ? (
                        <><span className="text-white font-medium">{other.label}</span> <span className="text-[#888888]">{relationText(edge.relation)} this</span></>
                      ) : (
                        <><span className="text-[#888888]">This {relationText(edge.relation)}</span> <span className="text-white font-medium">{other.label}</span></>
                      )}
                    </span>
                    {edge.supported === false && (
                      <span className="text-[10px] text-amber-300 border border-amber-500/30 rounded px-1.5 py-px shrink-0 cursor-help"
                        title="No single passage in your materials discusses both concepts, so the AI inferred this link. Check it before relying on it.">
                        AI-inferred
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-[#555555] group-hover:text-white shrink-0" />
                  </div>
                  {quote && <p className="text-[11px] text-[#777777] mt-1.5 ml-5 line-clamp-2">“{quote}”</p>}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default NodeInfo;
