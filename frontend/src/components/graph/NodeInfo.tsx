import { useParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { ArrowRight, Check } from 'lucide-react';
import CitationList from '../tutor/CitationList';
import { evidenceToSource, type GraphEdge } from '../../types/graph';
import { conceptState, missingPrerequisites, relationText } from '../../utils/concepts';
import { sourceLocation } from '../../utils/format';

interface NodeInfoProps {
  nodeId: string;
  onNavigate: (nodeId: string) => void;
}

/** The current concept as a reading page: what it is, what to study first, where it comes from, what it links to. */
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
    return <div className="p-6 text-sm text-ink-3 text-center">Pick a concept to see what it is.</div>;
  }

  const isMastered = conceptState(node.id, edges, visited, mastered) === 'mastered';
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
    <article className="max-w-[38rem] mx-auto px-6 md:px-10 py-10 md:py-14">
      <h1 className="font-display text-3xl md:text-[2.5rem] font-medium tracking-[-0.03em] leading-[1.05] text-balance">
        {node.label}
      </h1>
      <p className="mt-3 annot text-ink-3">{node.difficulty || 'core'}{isMastered ? ' · mastered' : ''}</p>
      {node.description && <p className="mt-5 text-[17px] leading-relaxed text-ink-2">{node.description}</p>}
      {node.supported === false && (
        <p className="mt-4 text-sm text-ink-3">No passage in your course materials states this directly, so check it against your notes.</p>
      )}

      {prerequisites.length > 0 && (
        <p className="mt-6 text-sm text-ink-3 leading-relaxed">
          Builds on{' '}
          {prerequisites.map((p, i) => (
            <span key={p.id}>
              {i > 0 && (i === prerequisites.length - 1 ? ' and ' : ', ')}
              <button onClick={() => onNavigate(p.id)} disabled={isLoading}
                className="text-accent underline underline-offset-4 decoration-accent-100 hover:decoration-accent disabled:opacity-50">
                {p.label}
              </button>
            </span>
          ))}
          , which you haven't studied yet.
        </p>
      )}

      <button
        onClick={() => toggleMastered(node.id)}
        aria-pressed={isMastered}
        className={`mt-8 inline-flex items-center gap-1.5 h-9 px-4 rounded-full border text-sm font-display transition-colors ${
          isMastered ? 'bg-ink border-ink text-white hover:bg-ink-2' : 'border-line-strong text-ink hover:border-ink'
        }`}
      >
        <Check className="w-3.5 h-3.5" /> {isMastered ? 'Mastered' : 'I know this'}
      </button>

      {sources.length > 0 && (
        <section className="mt-12">
          <CitationList courseId={courseId} sources={sources} title="Sources" />
        </section>
      )}

      {connections.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-base font-medium tracking-[-0.02em] pb-3 border-b border-ink">Related concepts</h2>
          <ul>
            {connections.map(({ edge, incoming }) => {
              const otherId = incoming ? edge.from : edge.to;
              const other = nodes.find(n => n.id === otherId);
              if (!other) return null;
              const inferred = edge.supported === false;
              return (
                <li key={edge.id} className="border-b border-line">
                  <button
                    onClick={() => onNavigate(otherId)}
                    disabled={isLoading}
                    title={inferred ? 'No single passage in your materials discusses both concepts, so the AI inferred this link.' : undefined}
                    className="group w-full text-left py-3.5 flex items-center gap-3 disabled:opacity-50"
                  >
                    <span className="flex-1 min-w-0 text-[15px] leading-snug">
                      <span className="text-ink group-hover:text-accent transition-colors">{other.label}</span>
                      <span className="block text-xs text-ink-3 mt-0.5">
                        {incoming ? `${relationText(edge.relation)} this` : `this ${relationText(edge.relation)} it`}
                        {inferred && ' · inferred link'}
                      </span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-ink-4 group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
};

export default NodeInfo;
