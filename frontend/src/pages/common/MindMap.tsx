import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileText, Loader2, LocateFixed, ShieldCheck, X } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import { useAuthStore } from '../../store/authStore';
import { learnerApi } from '../../api/learner';
import type { ConceptFlags } from '../../api/learner';
import MapNotReady from '../../components/graph/MapNotReady';
import EdgeAuditPanel from '../../components/graph/EdgeAuditPanel';
import KnowledgeTerrain from '../../components/graph/terrain/KnowledgeTerrain';
import { difficultyPeaks, foundationPeaks, layoutConcepts, regionPalette, strugglePeaks } from '../../components/graph/terrain/layout';
import { prerequisiteIds } from '../../utils/concepts';

// Same tones as the gradient pages, fading top to bottom so the bar melts into the map
// Many stops along an eased curve: a few linear stops leave visible bands
const TOP_FADE = `linear-gradient(180deg, ${Array.from({ length: 17 }, (_, i) => {
  const t = i / 16;
  const a = 0.78 * (1 - t * t * (3 - 2 * t)) ** 1.6;
  return `rgba(14,52,69,${a.toFixed(3)}) ${(t * 100).toFixed(1)}%`;
}).join(', ')})`;
const barPill = 'inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm border transition-colors cursor-pointer';
const barGhost = `${barPill} bg-white/[0.08] border-white/20 text-white/90 hover:bg-white/15`;
const DIFFICULTY_WORD = { beginner: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

type Mode = 'difficulty' | 'struggle' | 'foundation';
const MODE_LABEL: Record<Mode, string> = { difficulty: 'Difficulty', struggle: 'Struggle', foundation: 'Keystones' };

export default function MindMap() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const isProfessor = role === 'professor';
  const { nodes, edges, graphId, fetchCourseGraph, isLoading } = useGraphStore();
  const [auditOpen, setAuditOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('difficulty');
  const [trailsOn, setTrailsOn] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [flags, setFlags] = useState<ConceptFlags | null>(null);

  useEffect(() => { if (courseId) fetchCourseGraph(courseId); }, [courseId, fetchCourseGraph]);

  // Professors also see where students struggle
  useEffect(() => {
    if (!courseId || !isProfessor) return;
    let cancelled = false;
    learnerApi.conceptFlags(courseId).then(res => { if (!cancelled) setFlags(res.data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, isProfessor]);

  const scores = useMemo(() => new Map((flags?.concepts ?? []).map(c => [c.node_id, c.probability ?? c.heuristic_v1])), [flags]);
  const peaks = useMemo(() => (
    mode === 'struggle' ? strugglePeaks(nodes, scores)
      : mode === 'foundation' ? foundationPeaks(nodes, edges)
        : difficultyPeaks(nodes)
  ), [mode, nodes, edges, scores]);
  const regionOf = useMemo(() => new Map(layoutConcepts(nodes, edges).map(p => [p.id, p.region])), [nodes, edges]);

  const selected = nodes.find(n => n.id === selectedId) ?? null;
  const panelOpen = !!selected && !auditOpen;

  const fullScreen = 'fixed inset-0 z-40 font-sans';

  if (isLoading && nodes.length === 0) {
    return (
      <div className={`${fullScreen} bg-canvas flex items-center justify-center`}>
        <div className="flex flex-col items-center gap-3 text-sm text-ink-3">
          <Loader2 className="w-7 h-7 text-accent animate-spin" /> Loading the concept map
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={`${fullScreen} bg-canvas flex flex-col items-center justify-center p-8`}>
        {courseId && (
          <MapNotReady courseId={courseId} role={role} onReady={() => fetchCourseGraph(courseId)} onBack={() => navigate(`/courses/${courseId}`)} />
        )}
      </div>
    );
  }

  return (
    <div className={`${fullScreen} overflow-hidden`}>
      <div className="absolute inset-0">
        <KnowledgeTerrain nodes={nodes} edges={edges} peaks={peaks} heat={scores} heatOn={mode === 'struggle'} trailsOn={trailsOn} selectedId={selectedId}
          onSelect={id => { setSelectedId(id); if (id) setAuditOpen(false); }} resetKey={resetKey} panelOpen={panelOpen} />
      </div>

      {/* Top: a deep teal wash that fades into the map instead of a hard bar */}
      <div aria-hidden className="absolute top-0 inset-x-0 z-10 h-32 pointer-events-none" style={{ background: TOP_FADE }} />
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 px-4 md:px-8 h-[72px] text-white pointer-events-none [&>*]:pointer-events-auto">
        <button onClick={() => navigate(isProfessor ? `/courses/${courseId}` : `/courses/${courseId}/learn`)} className={barGhost}>
          <ArrowLeft size={16} /> <span className="hidden sm:inline">{isProfessor ? 'Back to course' : 'Back to Learn'}</span>
        </button>

        <div className="flex items-center gap-2 md:gap-3">
          {isProfessor && (
            <div className="hidden sm:inline-flex items-center gap-1 p-1 rounded-full bg-white/[0.08] border border-white/20" role="radiogroup" aria-label="What the hills show">
              <span className="pl-2.5 pr-1 text-xs text-white/60">Hills show</span>
              {/* Struggle needs student data; the other two come from the map itself */}
              {(flags ? ['difficulty', 'foundation', 'struggle'] as const : ['difficulty', 'foundation'] as const).map(m => (
                <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`h-8 px-3.5 rounded-full text-xs transition-colors cursor-pointer ${mode === m ? 'bg-white text-accent-strong' : 'text-white/80 hover:text-white'}`}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setSelectedId(null); setResetKey(k => k + 1); }} className={`${barGhost} !px-3`} title="Reset view" aria-label="Reset view">
            <LocateFixed size={16} />
          </button>
          {isProfessor && graphId && (
            <button onClick={() => { setAuditOpen(o => !o); setSelectedId(null); }} aria-expanded={auditOpen}
              className={`${barPill} ${auditOpen ? 'bg-white text-accent-strong border-white' : 'bg-white/[0.08] border-white/20 text-white/90 hover:bg-white/15'}`}>
              <ShieldCheck size={16} /> <span className="hidden md:inline">Check links</span>
            </button>
          )}
          <div className="hidden sm:block pl-1">
            <h1 className="font-display font-medium tracking-[-0.02em] text-lg leading-tight text-right">Concept map</h1>
            <p className="text-xs text-white/70 text-right tabular">{nodes.length} concepts · {edges.length} links</p>
          </div>
        </div>
      </div>

      {/* Concept detail */}
      {panelOpen && selected && (
        <ConceptPanel
          key={selected.id}
          node={selected}
          region={regionOf.get(selected.id) ?? 0}
          flag={flags?.concepts.find(c => c.node_id === selected.id)}
          isProfessor={isProfessor}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
          onStudy={() => { useGraphStore.setState({ currentNodeId: selected.id }); navigate(`/courses/${courseId}/learn`); }}
        />
      )}

      {isProfessor && auditOpen && graphId && courseId && (
        <aside className="absolute top-[84px] right-3 bottom-3 z-20 w-[calc(100%-1.5rem)] max-w-md rounded-[22px] bg-white/90 backdrop-blur-xl border border-white/70 shadow-[0_12px_32px_-18px_rgba(14,52,69,0.35)] overflow-y-auto p-5"
          aria-label="Check the map's links">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="font-display text-lg tracking-[-0.02em] text-accent-strong">Map accuracy</h2>
            <button onClick={() => setAuditOpen(false)} aria-label="Close" className="p-1.5 rounded-lg text-ink-3 hover:text-ink cursor-pointer"><X size={16} /></button>
          </div>
          <EdgeAuditPanel graphId={graphId} courseId={courseId} />
        </aside>
      )}

      {/* Legend and hint */}
      <div className="absolute bottom-4 inset-x-0 px-4 md:px-8 pointer-events-none flex flex-wrap items-end justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-2 rounded-full bg-white/75 backdrop-blur-xl border border-white/70 px-4 py-2.5 text-xs text-ink-2 shadow-[0_8px_24px_-16px_rgba(14,52,69,0.4)]">
          <span className="inline-flex items-center gap-2">
            <span className="grid place-items-center h-4 min-w-4 rounded-full bg-accent text-white text-[9px] tabular">1</span> Study order
          </span>
          {/* Turning trails off keeps the land clean; hovering a concept still draws its own */}
          <button type="button" role="switch" aria-checked={trailsOn} onClick={() => setTrailsOn(o => !o)}
            title={trailsOn ? 'Hide learn-first trails (they still show on hover)' : 'Show all learn-first trails'}
            className="-my-1 -mx-1.5 inline-flex items-center gap-2 h-7 px-1.5 rounded-full hover:bg-white/70 transition-colors cursor-pointer">
            <span className={`transition-opacity ${trailsOn ? '' : 'opacity-35'}`}><TrailGlyph /></span>
            <span className={trailsOn ? '' : 'text-ink-4'}>Learn first</span>
            <span className={`relative h-4 w-7 rounded-full transition-colors ${trailsOn ? 'bg-[#1b566b]' : 'bg-[#c3d8e0]'}`} aria-hidden>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left] duration-200 ${trailsOn ? 'left-[14px]' : 'left-0.5'}`} />
            </span>
          </button>
          {mode === 'struggle' ? (
            <span className="inline-flex items-center gap-2">
              Struggle
              <span className="h-2 w-16 rounded-full" style={{ background: 'linear-gradient(90deg, #2a6f87, #e3945c 55%, #b0402f)' }} />
              <span className="text-ink-4">taller = more</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2"><HillGlyph /> {mode === 'foundation' ? 'Taller = more builds on it' : 'Taller = harder'}</span>
          )}
          <span className="hidden lg:inline-flex items-center gap-2 text-ink-4"><ArcGlyph /> Related, on hover</span>
        </div>
        <p className="hidden md:block text-xs text-ink-3 bg-white/60 backdrop-blur rounded-full px-3 py-1.5">Drag to turn · Scroll to zoom · Click a peak</p>
      </div>
    </div>
  );
}

function ConceptPanel({ node, region, flag, isProfessor, onSelect, onClose, onStudy }: {
  node: ReturnType<typeof useGraphStore.getState>['nodes'][number];
  region: number;
  flag?: ConceptFlags['concepts'][number];
  isProfessor: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
  onStudy: () => void;
}) {
  const { nodes, edges } = useGraphStore();
  const pal = regionPalette(region);
  const label = (id: string) => nodes.find(n => n.id === id)?.label ?? id;
  const before = prerequisiteIds(node.id, edges);
  const after = nodes.filter(n => prerequisiteIds(n.id, edges).includes(node.id)).map(n => n.id);
  const ordered = new Set([...before, ...after]);
  const related = [...new Set(edges.flatMap(e => (e.from === node.id ? [e.to] : e.to === node.id ? [e.from] : [])))].filter(id => !ordered.has(id) && id !== node.id);
  const score = flag ? flag.probability ?? flag.heuristic_v1 : null;

  return (
    <aside className="absolute z-20 inset-x-3 bottom-3 max-h-[60%] md:inset-x-auto md:top-[84px] md:right-3 md:bottom-3 md:max-h-none md:w-[23rem] rounded-[22px] bg-white/90 backdrop-blur-xl border border-white/70 shadow-[0_12px_32px_-18px_rgba(14,52,69,0.35)] overflow-y-auto"
      aria-label={node.label}>
      {/* Header strip in the concept's region colours */}
      <div className="relative px-5 pt-5 pb-4 text-white overflow-hidden" style={{ background: `radial-gradient(90% 120% at 100% 0%, ${pal.light}cc 0%, ${pal.light}00 60%), linear-gradient(135deg, ${pal.deep} 0%, ${pal.mid} 100%)` }}>
        <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1.3px)', backgroundSize: '7px 7px', maskImage: 'radial-gradient(80% 100% at 100% 0%, #000 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(80% 100% at 100% 0%, #000 0%, transparent 70%)' }} />
        <div className="relative flex items-start justify-between gap-3">
          <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-white/15 border border-white/25 text-[11px]">{DIFFICULTY_WORD[node.difficulty ?? 'intermediate']}</span>
          <button onClick={onClose} aria-label="Close" className="p-1 -m-1 rounded-lg text-white/80 hover:text-white cursor-pointer"><X size={16} /></button>
        </div>
        <h2 className="relative mt-3 font-display text-[1.45rem] leading-tight tracking-[-0.02em]">{node.label}</h2>
      </div>

      <div className="p-5 space-y-4">
        {node.description && <p className="text-sm text-ink-2 leading-relaxed">{node.description}</p>}

        {isProfessor && flag && (
          <div className="grid grid-cols-3 gap-2">
            <Stat value={score !== null ? `${Math.round(score * 100)}` : '—'} label="struggle" tone={flag.flagged} />
            <Stat value={flag.mean_mastery !== null ? `${Math.round(flag.mean_mastery * 100)}%` : '—'} label="mastery" />
            <Stat value={String(flag.counts.questions)} label="questions" />
          </div>
        )}

        <Links title="Learn first" ids={before} label={label} onSelect={onSelect} />
        <Links title="Leads to" ids={after} label={label} onSelect={onSelect} arrow />
        <Links title="Related" ids={related} label={label} onSelect={onSelect} />

        {node.source_docs && node.source_docs.length > 0 && (
          <div>
            <p className="text-[11px] text-ink-4 mb-1.5">From</p>
            <ul className="space-y-1">
              {node.source_docs.map(d => (
                <li key={d} className="flex items-center gap-2 text-xs text-ink-2 truncate"><FileText size={13} className="text-accent shrink-0" /> {d.replace(/\.[^.]+$/, '')}</li>
              ))}
            </ul>
          </div>
        )}

        <button onClick={onStudy} className="w-full h-11 rounded-full bg-accent-strong text-white text-sm hover:bg-accent-400 transition-colors cursor-pointer inline-flex items-center justify-center gap-2">
          {isProfessor ? 'Preview as a student' : 'Study this concept'} <ArrowRight size={15} />
        </button>
      </div>
    </aside>
  );
}

function Links({ title, ids, label, onSelect, arrow }: { title: string; ids: string[]; label: (id: string) => string; onSelect: (id: string) => void; arrow?: boolean }) {
  if (ids.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] text-ink-4 mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {ids.map(id => (
          <button key={id} onClick={() => onSelect(id)}
            className="h-7 px-3 rounded-full bg-[#f1f5f7] text-xs text-accent-strong hover:bg-accent-wash transition-colors cursor-pointer inline-flex items-center gap-1">
            {arrow && <ArrowRight size={11} className="text-ink-4" />}{label(id)}
          </button>
        ))}
      </div>
    </div>
  );
}

const Stat = ({ value, label, tone }: { value: string; label: string; tone?: boolean }) => (
  <div className={`rounded-2xl px-3 py-2.5 ${tone ? 'bg-clay-wash text-clay' : 'bg-[#f1f5f7] text-accent-strong'}`}>
    <span className="block font-display text-lg leading-none tabular">{value}</span>
    <span className={`block mt-1 text-[11px] ${tone ? '' : 'text-ink-3'}`}>{label}</span>
  </div>
);

const HillGlyph = () => (
  <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden><path d="M1 11 C5 11 6 3 11 3 S17 11 21 11" fill="#1b566b" fillOpacity="0.85" /><path d="M5 11 C8 10 9 6 11 6 S14 10 17 11" fill="none" stroke="#fff" strokeOpacity="0.7" /></svg>
);
const TrailGlyph = () => (
  <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden><path d="M1 5 H16" stroke="#0e3445" strokeWidth="2" strokeLinecap="round" /><path d="M15 1.5 L20.5 5 L15 8.5 Z" fill="#0e3445" /><circle cx="8" cy="5" r="1.4" fill="#fff" /></svg>
);
const ArcGlyph = () => (
  <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden><path d="M1 9 Q11 -3 21 9" fill="none" stroke="#1b566b" strokeWidth="1.2" /><circle cx="15.5" cy="4.2" r="2" fill="#fff" stroke="#8fbccb" /></svg>
);
