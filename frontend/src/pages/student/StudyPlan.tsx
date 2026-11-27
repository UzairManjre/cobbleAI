import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  BookOpen, Brain, Check, ChevronDown, Clock, Code, FileText, Lightbulb, Loader2, MessageSquare,
  RefreshCw, Sparkles, X,
} from 'lucide-react';
import { coursesApi, studyPlansApi } from '../../api';
import CourseArt from '../../components/ui/CourseArt';
import { panel, pillDark, pillLine, featureBg, rise } from '../../components/ui/glass';
import { ART_PALETTES } from '../../components/ui/artPalettes';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';
import { loadStudyPath, pct, plural } from '../../utils/mastery';

type Level = 'easy' | 'medium' | 'hard';
interface Exercise {
  id: string;
  type: 'code' | 'quiz' | 'hands-on' | 'reading' | 'reflection';
  title: string;
  description: string;
  difficulty: Level;
  solution?: string | null;
  hints: string[];
  estimated_time_minutes: number;
}
interface Topic {
  id: string;
  order: number;
  node_id: string;
  node_label: string;
  node_description?: string;
  estimated_time_minutes: number;
  difficulty: Level;
  learning_objectives: string[];
  key_concepts: string[];
  exercises: Exercise[];
  document_references: string[];
}
interface Plan { id: string; title: string; description: string; total_topics: number; estimated_duration_hours: number; topics: Topic[] }
interface Progress { completed_topics: string[]; completed_exercises: string[] }
interface DeepDive {
  title: string;
  description: string;
  learning_path?: { step: number; title: string; content: string; estimated_minutes: number; document_references?: string[] }[];
  exercises?: Exercise[];
  self_check_questions?: { question: string; answer: string; explanation?: string }[];
}

const LEVEL: Record<Level, { word: string; bars: number }> = { easy: { word: 'Easy', bars: 1 }, medium: { word: 'Medium', bars: 2 }, hard: { word: 'Hard', bars: 3 } };
const hours = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1).replace(/\.0$/, '')} h` : `${min} min`);

function ExerciseIcon({ type, size = 15 }: { type: string; size?: number }) {
  switch (type) {
    case 'code': return <Code size={size} />;
    case 'quiz': return <MessageSquare size={size} />;
    case 'hands-on': return <Lightbulb size={size} />;
    case 'reading': return <FileText size={size} />;
    case 'reflection': return <Brain size={size} />;
    default: return <BookOpen size={size} />;
  }
}

/** Difficulty as three small bars, without traffic-light colours. */
function LevelMark({ level }: { level: Level }) {
  const l = LEVEL[level] ?? LEVEL.medium;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3" title={`${l.word} difficulty`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map(i => <span key={i} className={`w-[3px] rounded-sm ${i < l.bars ? 'bg-[#1b566b]' : 'bg-[#c3d8e0]'}`} style={{ height: 5 + i * 3 }} />)}
      </span>
      {l.word}
    </span>
  );
}

/** The student's study plan for one class: what to do now, how far along they are, and every topic. */
export default function StudyPlanView() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const addToast = useToastStore(s => s.addToast);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [deepDive, setDeepDive] = useState<DeepDive | null>(null);
  const [loadingDive, setLoadingDive] = useState<string | null>(null);
  // Study-path step per concept, so topics carry the same numbers as the map and the Learn rail
  const [steps, setSteps] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    loadStudyPath(courseId).then(p => setSteps(new Map(p.map(k => [k.id, k.step])))).catch(() => undefined);
  }, [courseId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studyPlansApi.getActive(courseId);
      setPlan(res.data.study_plan ?? null);
      setProgress(res.data.progress ?? null);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not load your study plan'), 'error');
    } finally {
      setLoading(false);
    }
  }, [courseId, addToast]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const graphId = (await coursesApi.get(courseId)).data.graph_id;
      if (!graphId) { addToast('This class has no concept map yet, so there is nothing to plan.', 'error'); return; }
      const res = await (plan ? studyPlansApi.regenerate(courseId, graphId) : studyPlansApi.generate(courseId, graphId));
      setPlan(res.data.study_plan);
      setProgress(res.data.progress);
      setOpen(null);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not make a study plan'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const completeTopic = async (nodeId: string) => {
    try { setProgress((await studyPlansApi.completeTopic(courseId, nodeId)).data.progress); }
    catch (err) { addToast(apiErrorDetail(err, 'Could not save that'), 'error'); }
  };
  const completeExercise = async (id: string) => {
    try { setProgress((await studyPlansApi.completeExercise(courseId, id)).data.progress); }
    catch (err) { addToast(apiErrorDetail(err, 'Could not save that'), 'error'); }
  };

  const openDeepDive = async (nodeId: string) => {
    setLoadingDive(nodeId);
    try {
      const saved = await studyPlansApi.getTopic(nodeId, courseId).catch(() => null);
      const dive = saved?.data.topic_plan ?? (await studyPlansApi.generateTopic(nodeId, courseId)).data.topic_plan;
      setDeepDive(dive);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not make the deep dive'), 'error');
    } finally {
      setLoadingDive(null);
    }
  };

  const doneTopics = useMemo(() => new Set(progress?.completed_topics || []), [progress]);
  const doneEx = useMemo(() => new Set(progress?.completed_exercises || []), [progress]);
  const topics = useMemo(() => {
    const list = plan?.topics ?? [];
    if (!steps.size) return list;
    return list
      .map(t => ({ ...t, order: steps.get(t.node_id) ?? t.order }))
      .sort((a, b) => a.order - b.order);
  }, [plan, steps]);
  const current = topics.find(t => !doneTopics.has(t.node_id)) ?? null;
  const allEx = topics.flatMap(t => t.exercises);
  const minutesLeft = topics.filter(t => !doneTopics.has(t.node_id)).reduce((n, t) => n + t.estimated_time_minutes, 0);
  const share = topics.length ? doneTopics.size / topics.length : 0;
  const upNext = topics.filter(t => !doneTopics.has(t.node_id)).flatMap(t => t.exercises.filter(e => !doneEx.has(e.id)).map(e => ({ e, t }))).slice(0, 3);
  const study = (nodeId: string) => navigate(`/courses/${courseId}/learn?node=${nodeId}`);

  if (loading) {
    return (
      <div className="mt-8 grid gap-4 xl:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map(i => <div key={i} className={`h-[240px] ${panel} animate-pulse`} />)}
      </div>
    );
  }

  if (!plan) {
    return (
      <section style={rise(1)} className={`mt-8 ${panel} p-2 grid md:grid-cols-[1fr_1.1fr] gap-2`}>
        <div className="relative min-h-[260px] overflow-hidden rounded-[16px]">
          <CourseArt seed={`plan-${courseId}`} palette={ART_PALETTES.lagoon} nodes={9} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="p-6 md:p-8 flex flex-col justify-center">
          <h2 className="font-display font-medium text-[1.9rem] leading-[1.05] tracking-[-0.03em] text-[#0e3445]">Make a study plan</h2>
          <p className="mt-3 text-[15px] text-ink-3 max-w-md">Every concept in this class in a sensible order, with a time estimate and a few exercises for each.</p>
          <button type="button" onClick={generate} disabled={generating} className={`${pillDark} mt-6 self-start h-11 px-5 text-sm`}>
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {generating ? 'Making your plan…' : 'Make my plan'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Row 1: current topic, progress, next exercises */}
      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <section style={{ ...rise(1), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[250px]">
          <p className="text-xs text-white/70">{current ? `Now · topic ${current.order} of ${topics.length} · ${current.estimated_time_minutes} min` : 'Plan finished'}</p>
          <h2 className="mt-2 font-display font-medium text-[1.9rem] leading-[1.05] tracking-[-0.03em]">{current ? current.node_label : 'Every topic is done.'}</h2>
          {current ? (
            <ul className="mt-3 space-y-1.5 text-sm text-white/80">
              {current.learning_objectives.slice(0, 2).map(o => <li key={o} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/70" />{o}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm text-white/75">Keep it fresh with Test yourself, or make a new plan.</p>}
          {current && (
            <div className="mt-auto pt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => study(current.node_id)} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors cursor-pointer">
                <Sparkles size={14} /> Study it
              </button>
              <button type="button" onClick={() => completeTopic(current.node_id)} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/40 text-sm hover:bg-white/10 transition-colors cursor-pointer">
                <Check size={14} /> Mark done
              </button>
            </div>
          )}
        </section>

        <section style={rise(2)} className={`${panel} p-5 flex flex-col`}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xs text-ink-3">Progress</h2>
            <button type="button" onClick={() => setConfirmRegen(true)} className="inline-flex items-center gap-1.5 h-7 px-2.5 -mr-1 rounded-full text-xs text-ink-3 hover:text-[#0e3445] hover:bg-[#f1f5f7] cursor-pointer">
              <RefreshCw size={12} /> New plan
            </button>
          </div>
          <div className="mt-3 flex items-center gap-6">
            <BigRing value={share} />
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-xs text-ink-3">Topics</dt><dd className="text-[#0e3445] tabular">{doneTopics.size} of {topics.length}</dd></div>
              <div><dt className="text-xs text-ink-3">Exercises</dt><dd className="text-[#0e3445] tabular">{doneEx.size} of {allEx.length}</dd></div>
              <div><dt className="text-xs text-ink-3">Time left</dt><dd className="text-[#0e3445] tabular">about {hours(minutesLeft)}</dd></div>
            </dl>
          </div>
          {/* One segment per topic, filled when done */}
          <div className="mt-auto pt-5 flex gap-[3px]" aria-hidden>
            {topics.map(t => <span key={t.id} className={`h-2 flex-1 rounded-full ${doneTopics.has(t.node_id) ? 'bg-[#1b566b]' : t === current ? 'bg-[#8fbccb]' : 'bg-[#dbe7ec]'}`} />)}
          </div>
        </section>

        <section style={rise(3)} className={`${panel} p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] text-[#0e3445]">Next exercises</h2>
            <span className="text-xs text-ink-3">{plural(allEx.length - doneEx.size, 'left', 'left')}</span>
          </div>
          {upNext.length === 0 ? (
            <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No exercises left.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {upNext.map(({ e, t }) => (
                <li key={e.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#f1f5f7]">
                  <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-white text-[#1b566b]"><ExerciseIcon type={e.type} /></span>
                  <button type="button" onClick={() => setOpen(t.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                    <span className="block text-sm text-[#0e3445] truncate">{e.title}</span>
                    <span className="block text-xs text-ink-3">{t.node_label} · {e.estimated_time_minutes} min</span>
                  </button>
                  <button type="button" onClick={() => completeExercise(e.id)} aria-label={`Mark ${e.title} done`} title="Mark done"
                    className="grid place-items-center h-8 w-8 shrink-0 rounded-full border border-[#c3d8e0] bg-white text-ink-4 hover:text-[#0e3445] hover:border-[#2a6f87] cursor-pointer"><Check size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Row 2: every topic */}
      <section aria-labelledby="topics-heading" style={rise(4)} className={`mt-4 ${panel} p-5`}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="topics-heading" className="text-[15px] text-[#0e3445]">{plan.title}</h2>
            <p className="text-xs text-ink-3 mt-0.5">{plan.description} About {hours(Math.round(plan.estimated_duration_hours * 60))} in all.</p>
          </div>
        </div>
        <ol className="mt-4 space-y-1.5">
          {topics.map(t => (
            <TopicRow key={t.id} topic={t} done={doneTopics.has(t.node_id)} isCurrent={t === current} doneEx={doneEx} expanded={open === t.id}
              onToggle={() => setOpen(open === t.id ? null : t.id)} onStudy={() => study(t.node_id)} onComplete={() => completeTopic(t.node_id)}
              onCompleteExercise={completeExercise} onDeepDive={() => openDeepDive(t.node_id)} divingIn={loadingDive === t.node_id} />
          ))}
        </ol>
      </section>

      {confirmRegen && (
        <Dialog onClose={() => setConfirmRegen(false)} title="Make a new plan?">
          <p className="text-sm text-ink-3 leading-relaxed">This replaces your current plan and clears its progress. Your concept mastery and test results are kept.</p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setConfirmRegen(false)} className={`${pillLine} flex-1 h-11`}>Cancel</button>
            <button type="button" onClick={() => { setConfirmRegen(false); generate(); }} className={`${pillDark} flex-1 h-11`}>Make a new plan</button>
          </div>
        </Dialog>
      )}

      {generating && plan && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#0e3445]/30 backdrop-blur-[3px]">
          <span className="inline-flex items-center gap-3 h-12 px-6 rounded-full bg-white text-sm text-[#0e3445] shadow-lg"><Loader2 size={16} className="animate-spin" /> Making your plan…</span>
        </div>
      )}

      {deepDive && <DeepDiveDialog dive={deepDive} onClose={() => setDeepDive(null)} />}
    </>
  );
}

// ---- Pieces -------------------------------------------------------------------------

function BigRing({ value }: { value: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid place-items-center h-28 w-28 shrink-0">
      <svg viewBox="0 0 104 104" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="52" cy="52" r={r} fill="none" stroke="#dbe7ec" strokeWidth="8" />
        {value > 0 && <circle cx="52" cy="52" r={r} fill="none" stroke="#1b566b" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} className="transition-[stroke-dasharray] duration-700" />}
      </svg>
      <span className="font-display text-[1.9rem] leading-none tracking-[-0.04em] text-[#0e3445] tabular">{pct(value)}</span>
    </span>
  );
}

function TopicRow({ topic, done, isCurrent, doneEx, expanded, onToggle, onStudy, onComplete, onCompleteExercise, onDeepDive, divingIn }: {
  topic: Topic; done: boolean; isCurrent: boolean; doneEx: Set<string>; expanded: boolean; divingIn: boolean;
  onToggle: () => void; onStudy: () => void; onComplete: () => void; onCompleteExercise: (id: string) => void; onDeepDive: () => void;
}) {
  const [openEx, setOpenEx] = useState<string | null>(null);
  const exDone = topic.exercises.filter(e => doneEx.has(e.id)).length;
  return (
    <li className={`rounded-2xl transition-colors ${expanded ? 'bg-white border border-[#dbe7ec] shadow-[0_12px_32px_-24px_rgba(14,52,69,0.4)]' : 'bg-[#f1f5f7] border border-transparent hover:bg-[#e6eef2]'}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-4 px-2.5 py-2 text-left cursor-pointer">
        <span className={`grid place-items-center h-9 w-9 rounded-full text-sm tabular ${done ? 'bg-[#1b566b] text-white' : isCurrent ? 'bg-[#0e3445] text-white ring-4 ring-[#2a6f87]/20' : 'bg-white text-[#0e3445]'}`}>
          {done ? <Check size={16} /> : topic.order}
        </span>
        <span className="min-w-0">
          <span className={`block text-[15px] truncate ${done ? 'text-ink-3' : 'text-[#0e3445]'}`}>{topic.node_label}</span>
          {isCurrent && <span className="block text-xs text-[#2a6f87]">You are here</span>}
        </span>
        <span className="hidden lg:block w-24"><LevelMark level={topic.difficulty} /></span>
        <span className="hidden md:inline-flex items-center gap-1.5 w-20 text-xs text-ink-3 tabular"><Clock size={12} /> {topic.estimated_time_minutes} min</span>
        <span className="flex gap-1 w-16 justify-end" title={`${exDone} of ${topic.exercises.length} exercises done`} aria-hidden>
          {topic.exercises.map(e => <span key={e.id} className={`h-2.5 w-2.5 rounded-full ${doneEx.has(e.id) ? 'bg-[#1b566b]' : 'border border-[#a3bfcb]'}`} />)}
        </span>
        <ChevronDown size={16} className={`text-ink-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
            <div className="rounded-2xl bg-[#f1f5f7] p-4 space-y-4">
              {topic.node_description && <p className="text-sm text-[#0e3445] leading-relaxed">{topic.node_description}</p>}
              {topic.learning_objectives.length > 0 && (
                <div>
                  <p className="text-[11px] text-ink-3">By the end you can</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {topic.learning_objectives.map(o => <li key={o} className="flex gap-2 text-sm text-ink-2"><Check size={14} className="mt-0.5 shrink-0 text-[#2a6f87]" />{o}</li>)}
                  </ul>
                </div>
              )}
              {topic.document_references.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-ink-3 mr-1">Read</span>
                  {topic.document_references.map(d => <span key={d} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white text-xs text-[#0e3445]"><FileText size={12} />{d.replace(/\.[a-z0-9]+$/i, '')}</span>)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {topic.exercises.map(e => {
                const isDone = doneEx.has(e.id);
                const isOpen = openEx === e.id;
                return (
                  <div key={e.id} className="rounded-2xl border border-[#e2eaeb]">
                    <div className="flex items-center gap-3 p-2.5">
                      <span className={`grid place-items-center h-9 w-9 shrink-0 rounded-full ${isDone ? 'bg-[#1b566b] text-white' : 'bg-[#f1f5f7] text-[#1b566b]'}`}>{isDone ? <Check size={14} /> : <ExerciseIcon type={e.type} />}</span>
                      <button type="button" onClick={() => setOpenEx(isOpen ? null : e.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                        <span className={`block text-sm truncate ${isDone ? 'text-ink-3' : 'text-[#0e3445]'}`}>{e.title}</span>
                        <span className="block text-xs text-ink-3 capitalize">{e.type} · {e.estimated_time_minutes} min</span>
                      </button>
                      <ChevronDown size={14} className={`text-ink-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3 text-sm">
                        <p className="text-ink-2 leading-relaxed">{e.description}</p>
                        {e.hints.length > 0 && (
                          <p className="flex gap-2 text-xs text-ink-3"><Lightbulb size={13} className="mt-0.5 shrink-0" />{e.hints.join(' · ')}</p>
                        )}
                        {e.solution && (
                          <details className="group rounded-xl bg-[#f1f5f7]">
                            <summary className="flex items-center justify-between px-3 py-2 text-xs text-[#0e3445] cursor-pointer list-none">Show a model answer <ChevronDown size={13} className="transition-transform group-open:rotate-180" /></summary>
                            <div className="px-3 pb-3 text-[13px] text-ink-2 prose max-w-none"><ReactMarkdown>{e.solution}</ReactMarkdown></div>
                          </details>
                        )}
                        {!isDone && <button type="button" onClick={() => onCompleteExercise(e.id)} className={`${pillLine} h-8 px-3`}><Check size={13} /> Mark done</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onStudy} className={pillDark}><Sparkles size={14} /> Study it</button>
            <button type="button" onClick={onDeepDive} disabled={divingIn} className={pillLine}>
              {divingIn ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />} Deep dive
            </button>
            {!done && <button type="button" onClick={onComplete} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] text-ink-3 hover:text-[#0e3445] hover:bg-[#f1f5f7] cursor-pointer"><Check size={14} /> Mark topic done</button>}
          </div>
        </div>
      )}
    </li>
  );
}

function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0e3445]/40 backdrop-blur-[3px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className={`bg-white rounded-[24px] shadow-[0_24px_60px_-20px_rgba(14,52,69,0.45)] w-full ${wide ? 'max-w-3xl max-h-[88vh] flex flex-col p-2' : 'max-w-md p-6'}`}>
        {!wide && <h2 className="font-display font-medium text-2xl tracking-[-0.03em] text-[#0e3445] mb-3">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

function DeepDiveDialog({ dive, onClose }: { dive: DeepDive; onClose: () => void }) {
  return (
    <Dialog title={dive.title} onClose={onClose} wide>
      <div className="relative shrink-0 overflow-hidden rounded-[18px] px-6 py-5 text-white" style={{ background: featureBg }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 grid place-items-center h-8 w-8 rounded-full text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"><X size={16} /></button>
        <p className="text-xs text-white/70">Deep dive</p>
        <h2 className="mt-1 font-display font-medium text-2xl tracking-[-0.03em] pr-8">{dive.title.replace(/^Deep dive:\s*/i, '')}</h2>
        {dive.description && <p className="mt-1.5 text-sm text-white/80">{dive.description}</p>}
      </div>
      <div className="overflow-y-auto px-4 py-5 space-y-6">
        {!!dive.learning_path?.length && (
          <section>
            <h3 className="text-[15px] text-[#0e3445]">Steps</h3>
            <ol className="mt-3 space-y-2">
              {dive.learning_path.map(s => (
                <li key={s.step} className="flex gap-3 p-3 rounded-2xl bg-[#f1f5f7]">
                  <span className="grid place-items-center h-8 w-8 shrink-0 rounded-full bg-white text-sm tabular text-[#0e3445]">{s.step}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-[#0e3445]">{s.title} <span className="text-xs text-ink-4 tabular">· {s.estimated_minutes} min</span></p>
                    <p className="mt-1 text-[13px] text-ink-3 leading-relaxed">{s.content}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        {!!dive.self_check_questions?.length && (
          <section>
            <h3 className="text-[15px] text-[#0e3445]">Check yourself</h3>
            <div className="mt-3 space-y-2">
              {dive.self_check_questions.map(q => (
                <details key={q.question} className="group rounded-2xl bg-[#f1f5f7]">
                  <summary className="flex items-center justify-between gap-3 p-3 text-sm text-[#0e3445] cursor-pointer list-none">{q.question}<ChevronDown size={14} className="shrink-0 text-ink-4 transition-transform group-open:rotate-180" /></summary>
                  <div className="px-3 pb-3 text-[13px] text-ink-2"><p>{q.answer}</p>{q.explanation && <p className="mt-1 text-ink-3">{q.explanation}</p>}</div>
                </details>
              ))}
            </div>
          </section>
        )}
        {!!dive.exercises?.length && (
          <section>
            <h3 className="text-[15px] text-[#0e3445]">Practice</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {dive.exercises.map(e => (
                <div key={e.title} className="p-3 rounded-2xl bg-[#f1f5f7]">
                  <p className="flex items-center gap-2 text-sm text-[#0e3445]"><ExerciseIcon type={e.type} size={14} />{e.title}</p>
                  <p className="mt-1.5 text-[13px] text-ink-3 leading-relaxed">{e.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
