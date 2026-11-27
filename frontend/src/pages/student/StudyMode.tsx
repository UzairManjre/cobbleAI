import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Map as MapIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import { useAuthStore } from '../../store/authStore';
import { coursesApi } from '../../api';
import MapNotReady from '../../components/graph/MapNotReady';
import LessonThread from '../../components/study/LessonThread';
import { paletteAt, type ArtPalette } from '../../components/ui/artPalettes';
import { KNOWN, levelOf, loadStudyPath, pct, type StudyConcept } from '../../utils/mastery';

const RAIL_BG = 'radial-gradient(90% 40% at 0% 0%, rgba(64,124,145,0.55) 0%, rgba(64,124,145,0) 70%), linear-gradient(180deg, #0e3445 0%, #123f52 55%, #1b566b 100%)';
const PAGE_BG = 'radial-gradient(60% 280px at 50% 0%, rgba(143,188,203,0.35) 0%, rgba(143,188,203,0) 100%), #eef3f5';

const RAIL_PREF = 'cobble.study.railOpen';
function readRailPref() {
  try { return localStorage.getItem(RAIL_PREF) !== '0'; } catch { return true; }
}

/** A step number inside a ring that fills with how well the concept is known; a tick once it is. */
function MasteryRing({ step, mastery, active }: { step: number; mastery: number; active: boolean }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const level = levelOf(mastery);
  return (
    <span className={`relative grid place-items-center h-11 w-11 shrink-0 rounded-full ${active ? 'bg-white/15' : ''}`}>
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={level === 'known' ? '#ffffff' : '#8fbccb'} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, mastery)} ${c}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <span className={`relative grid place-items-center h-7 w-7 rounded-full text-xs tabular ${level === 'known' ? 'bg-white text-[#0e3445]' : active ? 'text-white font-medium' : 'text-white/80'}`}>
        {level === 'known' ? <Check size={13} /> : step}
      </span>
    </span>
  );
}

/** Studying one concept at a time: the study path on the left, one lesson thread in the middle. */
export default function StudyMode() {
  const { courseId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const { nodes, currentNodeId, masteredNodes, navigateToNode, isLoading, error, fetchCourseGraph, setCurrentNode } = useGraphStore();

  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<'teach' | 'review'>('teach');
  const [path, setPath] = useState<StudyConcept[]>([]);
  const [course, setCourse] = useState<{ code: string; title: string; palette: ArtPalette } | null>(null);
  const [railOpen, setRailOpen] = useState(readRailPref);
  const toggleRail = () => setRailOpen(v => {
    try { localStorage.setItem(RAIL_PREF, v ? '0' : '1'); } catch { /* private mode: not remembered */ }
    return !v;
  });

  const init = async () => {
    setChecking(true);
    try {
      await fetchCourseGraph(courseId);
      const state = useGraphStore.getState();
      // A rebuilt map can drop the concept the student was on: start from the first one then
      if (state.nodes.length && !state.nodes.some(n => n.id === state.currentNodeId)) setCurrentNode(state.nodes[0].id);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    init();
    loadStudyPath(courseId).then(setPath).catch(() => setPath([]));
    coursesApi.list().then(res => {
      const list: { id: string; code: string; title: string }[] = res.data || [];
      const i = list.findIndex(c => c.id === courseId);
      if (i >= 0) setCourse({ code: list[i].code, title: list[i].title, palette: paletteAt(i) });
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // ?node= from the study plan or the map. Only once per value: asking a question toggles isLoading,
  // and navigating again then aborted the streaming answer and cleared the chat.
  const handledNodeParam = useRef<string | null>(null);
  useEffect(() => {
    const nodeId = searchParams.get('node');
    if (nodeId && nodeId !== handledNodeParam.current && nodes.length > 0 && !isLoading) {
      handledNodeParam.current = nodeId;
      setCurrentNode(nodeId);
      navigateToNode(nodeId);
    }
  }, [nodes.length, isLoading, searchParams, setCurrentNode, navigateToNode]);

  // "I know this" counts as known straight away, before the mastery model catches up
  const steps = useMemo(() => path.map(k => (masteredNodes.includes(k.id) ? { ...k, mastery: Math.max(k.mastery, KNOWN) } : k)), [path, masteredNodes]);
  const activeId = nodes.some(n => n.id === currentNodeId) ? currentNodeId : nodes[0]?.id ?? null;
  const index = steps.findIndex(k => k.id === activeId);
  const concept = index >= 0 ? steps[index] : null;
  const prev = index > 0 ? steps[index - 1] : null;
  const next = index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
  const known = steps.filter(k => k.mastery >= KNOWN).length;
  const palette = course?.palette ?? paletteAt(0);

  if (checking && nodes.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center text-ink-3" style={{ background: PAGE_BG }}>
        <span className="flex items-center gap-3 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading your concepts</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center p-8" style={{ background: PAGE_BG }}>
        {error ? (
          <div className="max-w-sm text-center space-y-4">
            <h2 className="font-display text-xl tracking-[-0.025em]">The concept map didn't load</h2>
            <p className="text-sm text-ink-3">{error}</p>
            <button type="button" onClick={init} className="h-10 px-5 rounded-full bg-[#0e3445] text-white text-sm cursor-pointer">Try again</button>
          </div>
        ) : (
          <MapNotReady courseId={courseId} role={role} onReady={init} onBack={() => navigate(`/courses/${courseId}`)} />
        )}
      </div>
    );
  }

  return (
    // Full window: the app's centred page layout leaves the study tools cramped
    <div className="fixed inset-0 z-[60] flex text-ink" style={{ background: PAGE_BG }}>

      {/* Study path rail: full list, or just the numbered rings when collapsed */}
      <aside aria-label="Study path" className={`shrink-0 flex flex-col text-white transition-[width] duration-300 ease-out overflow-hidden ${railOpen ? 'w-[284px]' : 'w-[76px]'}`} style={{ background: RAIL_BG }}>
        <div className={railOpen ? 'px-5 pt-5' : 'pt-5 flex flex-col items-center gap-3'}>
          <div className="flex items-center justify-between gap-2">
            <Link to={`/courses/${courseId}`} title="Back to the class" className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors">
              <ArrowLeft size={14} />{railOpen && (course?.code ?? 'Back')}
            </Link>
            {railOpen && (
              <button type="button" onClick={toggleRail} aria-label="Collapse the study path" title="Collapse"
                className="grid place-items-center h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"><PanelLeftClose size={16} /></button>
            )}
          </div>
          {railOpen ? (
            <>
              <p className="mt-3 font-display font-medium text-xl leading-tight tracking-[-0.02em]">{course?.title ?? ''}</p>
              <div className="mt-5 flex items-baseline justify-between text-xs text-white/70">
                <span>Study path</span>
                <span className="tabular text-white">{known} of {steps.length} known</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: pct(steps.length ? known / steps.length : 0) }} />
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={toggleRail} aria-label="Expand the study path" title="Expand"
                className="grid place-items-center h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 cursor-pointer"><PanelLeftOpen size={16} /></button>
              <span className="text-[11px] tabular text-white/70" title={`${known} of ${steps.length} known`}>{known}/{steps.length}</span>
            </>
          )}
        </div>

        <ol className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-4 ${railOpen ? 'px-3 pt-5' : 'px-0 pt-3'}`}>
          {steps.map((k, i) => {
            const active = k.id === activeId;
            return (
              <li key={k.id} className="relative">
                {i < steps.length - 1 && <span aria-hidden className={`absolute top-11 -bottom-1 w-0.5 bg-white/15 ${railOpen ? 'left-[31px]' : 'left-[37px]'}`} />}
                <button type="button" onClick={() => navigateToNode(k.id)} aria-current={active ? 'step' : undefined}
                  title={railOpen ? undefined : `${k.step}. ${k.label} · ${pct(k.mastery)} known`}
                  className={`relative w-full flex items-center gap-3 py-1.5 rounded-2xl text-left transition-colors cursor-pointer ${railOpen ? 'px-2' : 'justify-center'} ${active && railOpen ? 'bg-white/[0.14]' : 'hover:bg-white/[0.07]'}`}>
                  <MasteryRing step={k.step} mastery={k.mastery} active={active} />
                  {railOpen && (
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm truncate ${active ? 'text-white font-medium' : 'text-white/85'}`}>{k.label}</span>
                      <span className="block text-[11px] tabular text-white/55">{levelOf(k.mastery) === 'known' ? 'Known' : `${pct(k.mastery)} known`}</span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <div className={`py-4 border-t border-white/10 ${railOpen ? 'px-5' : 'flex justify-center'}`}>
          <Link to={`/courses/${courseId}/map`} title="Open the concept map" className="inline-flex items-center gap-2 text-sm text-white/75 hover:text-white transition-colors">
            <MapIcon size={15} />{railOpen && 'Open the concept map'}
          </Link>
        </div>
      </aside>

      {/* Lesson */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center px-6">
          <span />
          <div role="tablist" aria-label="Study mode" className="flex items-center gap-0.5 p-1 rounded-full bg-white/70 backdrop-blur border border-white">
            {([
              ['teach', 'Learn', 'See the concept and ask the tutor to explain it'],
              ['review', 'Test yourself', 'Recall it from memory first, then check yourself and get quizzed'],
            ] as const).map(([v, l, hint]) => (
              <button key={v} type="button" role="tab" aria-selected={mode === v} onClick={() => setMode(v)} title={hint}
                className={`h-8 px-5 rounded-full text-sm transition-colors cursor-pointer ${mode === v ? 'bg-[#0e3445] text-white' : 'text-ink-3 hover:text-[#0e3445]'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1 text-sm text-ink-3">
            <button type="button" onClick={() => prev && navigateToNode(prev.id)} disabled={!prev} aria-label="Previous step"
              className="grid place-items-center h-9 w-9 rounded-full hover:bg-white/70 hover:text-[#0e3445] disabled:opacity-30 cursor-pointer"><ChevronLeft size={17} /></button>
            <span className="tabular px-1">{concept ? `${concept.step} / ${steps.length}` : ''}</span>
            <button type="button" onClick={() => next && navigateToNode(next.id)} disabled={!next} aria-label="Next step"
              className="grid place-items-center h-9 w-9 rounded-full hover:bg-white/70 hover:text-[#0e3445] disabled:opacity-30 cursor-pointer"><ChevronRight size={17} /></button>
          </div>
        </header>

        <div className="flex-1 min-h-0">
          {activeId && (
            <LessonThread key={`${mode}-${activeId}`} courseId={courseId} nodeId={activeId} mode={mode} palette={palette}
              concept={concept} total={steps.length} next={next} onNavigate={navigateToNode} />
          )}
        </div>
      </main>

      {error && (
        <div role="alert" className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl border border-[#e8d4cc] bg-[#f6eeea] text-[#8f5646] text-sm max-w-md z-50">{error}</div>
      )}
    </div>
  );
}
