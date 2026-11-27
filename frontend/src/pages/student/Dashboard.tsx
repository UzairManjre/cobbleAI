import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Loader2, Map as MapIcon, MessageCircle, Plus, Sparkles } from 'lucide-react';
import { coursesApi, testsApi } from '../../api';
import { learnerApi, type Calibration } from '../../api/learner';
import CourseArt from '../../components/ui/CourseArt';
import ScoreRing from '../../components/student/ScoreRing';
import CalibrationBars from '../../components/student/CalibrationBars';
import GradientPage from '../../components/layout/GradientPage';
import { panel, pillDark, pillLine, heroGhost, heroSolid, featureBg, rise } from '../../components/ui/glass';
import { ART_PALETTES, paletteAt } from '../../components/ui/artPalettes';
import type { ArtPalette } from '../../components/ui/artPalettes';
import { useAuthStore } from '../../store/authStore';
import { useGraphStore } from '../../store/graphStore';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';
import { KNOWN, LEARNING, LEVEL_BG, calibrationVerdict, levelOf, loadStudyPath, nextStep, pct, plural, type StudyConcept } from '../../utils/mastery';

interface Course { id: string; title: string; code: string; description?: string | null; schedule?: string | null }
interface Test { id: string; title: string; test_type: string; duration_minutes: number; question_count?: number; status: string }
interface Attempt { id: string; test_id: string; status: string; percentage: number | null; submitted_at?: string }
interface ClassData {
  ready: boolean;
  /** Concepts in study order, with this student's mastery */
  concepts: StudyConcept[];
  tests: Test[];
  calibration: Calibration | null;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** The student's home: what to study next, how it is going, and every class. */
export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const addToast = useToastStore(s => s.addToast);

  const [courses, setCourses] = useState<Course[]>([]);
  const [data, setData] = useState<Record<string, ClassData>>({});
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [coursesRes, attemptsRes] = await Promise.all([
        coursesApi.list(),
        testsApi.getMyAttempts().catch(() => ({ data: { attempts: [] } })),
      ]);
      const list: Course[] = coursesRes.data || [];
      const entries = await Promise.all(list.map(async c => {
        const [path, tests, calibration] = await Promise.allSettled([
          loadStudyPath(c.id),
          testsApi.getByCourse(c.id),
          learnerApi.calibration(c.id),
        ]);
        const concepts = path.status === 'fulfilled' ? path.value : [];
        const value: ClassData = {
          ready: concepts.length > 0,
          concepts,
          tests: tests.status === 'fulfilled' ? (tests.value.data || []).filter((t: Test) => t.status === 'published') : [],
          calibration: calibration.status === 'fulfilled' ? calibration.value.data : null,
        };
        return [c.id, value] as const;
      }));
      setCourses(list);
      setData(Object.fromEntries(entries));
      setAttempts(attemptsRes.data?.attempts || []);
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not load your classes'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const palettes = useMemo(() => Object.fromEntries(courses.map((c, i) => [c.id, paletteAt(i)])), [courses]);

  // The next concept to study: the first one in study order that is not known yet
  const next = useMemo(() => {
    for (const c of courses) {
      const hit = nextStep(data[c.id]?.concepts || []);
      if (hit) return { course: c, concept: hit.next, before: hit.before };
    }
    return null;
  }, [courses, data]);

  // Tests: not started first, then finished ones with their score
  const attemptOf = useMemo(() => new Map(attempts.map(a => [a.test_id, a])), [attempts]);
  const tests = useMemo(() => courses
    .flatMap(c => (data[c.id]?.tests || []).map(t => ({ test: t, course: c, attempt: attemptOf.get(t.id) })))
    .sort((a, b) => Number(!!a.attempt) - Number(!!b.attempt)), [courses, data, attemptOf]);
  const toTake = tests.filter(t => !t.attempt || t.attempt.status === 'in_progress').length;

  const allConcepts = courses.flatMap(c => data[c.id]?.concepts || []);
  const known = allConcepts.filter(k => k.mastery >= KNOWN).length;
  const weakest = useMemo(() => courses
    .flatMap(c => (data[c.id]?.concepts || []).map(k => ({ ...k, course: c })))
    .filter(k => k.mastery < LEARNING)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 3), [courses, data]);

  const study = (courseId: string, nodeId: string) => {
    useGraphStore.setState({ currentNodeId: nodeId });
    navigate(`/courses/${courseId}/learn`);
  };

  const name = (user?.full_name || '').split(' ')[0];

  return (
    <>
      <GradientPage>
        {/* Greeting */}
        <header className="mt-6 sm:mt-10 flex flex-col md:flex-row md:items-end justify-between gap-6 text-white" style={rise(0)}>
          <div className="max-w-xl">
            <h1 className="font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">
              {greeting()}{name ? `, ${name}` : ''}.
            </h1>
            <p className="mt-3 text-white/75 text-[15px]" aria-live="polite">
              {isLoading ? 'Loading your classes…'
                : `${plural(courses.length, 'class', 'classes')} · ${known} of ${allConcepts.length} concepts known · ${plural(toTake, 'test')} to take`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/tutor" className={heroGhost}><MessageCircle size={16} /> Ask the tutor</Link>
            <button type="button" onClick={() => setShowJoin(true)} className={heroSolid}><Plus size={16} /> Join a class</button>
          </div>
        </header>

        {/* Row 1: next up, what you know, how sure vs how right */}
        <div className="mt-8 sm:mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <section style={{ ...rise(1), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[250px]">
            <p className="text-xs text-white/70">{next ? `Next up · ${next.course.code} · step ${next.concept.step}` : 'Next up'}</p>
            <h2 className="mt-2 font-display font-medium text-[1.9rem] leading-[1.05] tracking-[-0.03em]">
              {isLoading ? 'Finding your next step…' : next ? next.concept.label : 'Nothing left to learn yet.'}
            </h2>
            {next && (
              <>
                <p className="mt-2 text-sm text-white/75">{next.before ? `You know ${next.before.label}, so this is the next step.` : 'The first step in this class.'}</p>
                <div className="mt-4 flex items-center gap-3 text-xs text-white/80">
                  <span className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden"><span className="block h-full rounded-full bg-white" style={{ width: pct(next.concept.mastery) }} /></span>
                  <span className="tabular">{pct(next.concept.mastery)} known</span>
                </div>
              </>
            )}
            {next && (
              <div className="mt-auto pt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => study(next.course.id, next.concept.id)} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors cursor-pointer">
                  <Sparkles size={14} /> Study it
                </button>
                <Link to={`/courses/${next.course.id}/map`} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/40 text-sm hover:bg-white/10 transition-colors">
                  <MapIcon size={14} /> Map
                </Link>
              </div>
            )}
          </section>

          <section style={rise(2)} className={`${panel} p-5 flex flex-col`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xs text-ink-3">Concepts you know</h2>
                <p className="mt-1 font-display text-[2.4rem] leading-none tracking-[-0.04em] text-[#0e3445] tabular">
                  {isLoading ? '–' : known}<span className="text-ink-4 text-[1.4rem]"> / {allConcepts.length}</span>
                </p>
              </div>
              <Legend />
            </div>
            <div className="mt-auto pt-5 space-y-4">
              {courses.map(c => <MasteryDots key={c.id} code={c.code} data={data[c.id]} />)}
            </div>
          </section>

          <CalibrationCard style={rise(3)} courses={courses} data={data} />
        </div>

        {/* Row 2: tests, weakest concepts */}
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <section aria-labelledby="tests-heading" style={rise(4)} className={`${panel} p-5 xl:col-span-2`}>
            <div className="flex items-center justify-between gap-4">
              <h2 id="tests-heading" className="text-[15px] text-[#0e3445]">Tests</h2>
              <Link to="/assignments" className="text-xs text-ink-3 hover:text-[#0e3445]">All tests</Link>
            </div>
            {isLoading ? (
              <div className="mt-4 space-y-2" aria-busy="true">{[0, 1].map(i => <div key={i} className="h-16 rounded-2xl bg-[#ecf3f6] animate-pulse" />)}</div>
            ) : tests.length === 0 ? (
              <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No tests published yet.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {tests.map(({ test, course, attempt }) => {
                  const done = attempt && attempt.status !== 'in_progress';
                  return (
                    <li key={test.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-3 rounded-2xl bg-[#f1f5f7]">
                      <ScoreRing value={done && attempt?.percentage != null ? attempt.percentage / 100 : null} color={palettes[course.id]?.mid} />
                      <span className="min-w-0">
                        <span className="block text-[15px] text-[#0e3445] truncate">{test.title}</span>
                        <span className="block text-xs text-ink-3 truncate">
                          {course.code} · {test.test_type === 'assignment' ? 'Assignment' : 'Quiz'} · {test.duration_minutes} min
                          {done && (attempt?.status === 'graded' ? '' : ' · Waiting for a grade')}
                        </span>
                      </span>
                      {done ? (
                        attempt?.status === 'graded'
                          ? <Link to={`/tests/${test.id}/result/${attempt.id}`} className={pillLine}>Result</Link>
                          : <span className="text-xs text-ink-4 px-3">Submitted</span>
                      ) : (
                        <Link to={`/tests/${test.id}`} className={pillDark}>{attempt ? 'Continue' : 'Start'} <ArrowRight size={13} /></Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside aria-labelledby="weak-heading" style={rise(5)} className={`${panel} p-5`}>
            <div className="flex items-center justify-between">
              <h2 id="weak-heading" className="text-[15px] text-[#0e3445]">Needs practice</h2>
              <span className="text-xs text-ink-3">Lowest first</span>
            </div>
            {!isLoading && weakest.length === 0 ? (
              <p className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">
                <span className="grid place-items-center h-9 w-9 rounded-full bg-white text-[#2a6f87]"><Check size={16} /></span>
                Nothing is far behind.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {weakest.map(k => (
                  <li key={`${k.course.id}-${k.id}`}>
                    <button type="button" onClick={() => study(k.course.id, k.id)} className="group w-full text-left flex items-center gap-3 p-2.5 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] transition-colors cursor-pointer">
                      <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full text-white text-xs tabular" style={{ background: `linear-gradient(135deg, ${palettes[k.course.id]?.deep}, ${palettes[k.course.id]?.mid})` }}>{k.step}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-[#0e3445] truncate">{k.label}</span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="flex-1 h-1 rounded-full bg-[#dbe7ec] overflow-hidden"><span className="block h-full bg-[#2a6f87]" style={{ width: pct(k.mastery) }} /></span>
                          <span className="text-[11px] text-ink-4 tabular w-8 text-right">{pct(k.mastery)}</span>
                        </span>
                      </span>
                      <ArrowRight size={14} className="text-ink-4 group-hover:text-[#0e3445] transition-colors" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        {/* Row 3: every class */}
        <section aria-labelledby="classes-heading" className="mt-10">
          <h2 id="classes-heading" style={rise(6)} className="px-1 font-display font-medium text-[1.75rem] tracking-[-0.035em] leading-none text-[#0e3445]">Your classes</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? [0, 1].map(i => <div key={i} className={`h-[360px] ${panel} animate-pulse`} />)
              : courses.length === 0
                ? (
                  <button type="button" onClick={() => setShowJoin(true)} className="min-h-[280px] rounded-[22px] border border-dashed border-[#a3bfcb] bg-white/40 hover:bg-white/80 transition-colors flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer sm:col-span-2 xl:col-span-3">
                    <span className="grid place-items-center h-12 w-12 rounded-full bg-[#0e3445] text-white"><Plus size={20} /></span>
                    <span className="font-display font-medium text-lg tracking-[-0.02em] text-[#0e3445]">Join your first class</span>
                    <span className="text-sm text-ink-3">Ask your professor for the invite code.</span>
                  </button>
                )
                : (
                  <>
                    {courses.map((c, i) => <ClassCard key={c.id} course={c} palette={palettes[c.id]} data={data[c.id]} index={i} attempts={attemptOf} />)}
                    <button type="button" onClick={() => setShowJoin(true)} style={rise(courses.length + 7)}
                      className="group min-h-[280px] rounded-[22px] border border-dashed border-[#a3bfcb] bg-white/40 hover:bg-white/80 transition-colors flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer">
                      <span className="grid place-items-center h-12 w-12 rounded-full bg-[#0e3445] text-white group-hover:bg-[#2a6f87] transition-colors"><Plus size={20} /></span>
                      <span className="font-display font-medium text-lg tracking-[-0.02em] text-[#0e3445]">Join a class</span>
                      <span className="text-sm text-ink-3">Use the invite code from your professor.</span>
                    </button>
                  </>
                )}
          </div>
        </section>
      </GradientPage>

      {showJoin && <JoinDialog onClose={() => setShowJoin(false)} onJoined={() => { setShowJoin(false); load(); }} />}
    </>
  );
}

// ---- Small data marks -------------------------------------------------------------

const dotFor = (m: number) => LEVEL_BG[levelOf(m)];

function Legend() {
  return (
    <ul className="space-y-1 text-[11px] text-ink-3">
      {([['Known', LEVEL_BG.known], ['Learning', LEVEL_BG.learning], ['Not yet', LEVEL_BG.new]] as const).map(([l, c]) => (
        <li key={l} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{l}</li>
      ))}
    </ul>
  );
}

/** One dot per concept, in study order, shaded by how well it is known. */
function MasteryDots({ code, data }: { code: string; data?: ClassData }) {
  const concepts = data?.concepts || [];
  const known = concepts.filter(k => k.mastery >= KNOWN).length;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-3 tabular">{code}</span>
        <span className="text-[#0e3445] tabular">{data?.ready ? `${known} of ${concepts.length}` : 'Map not ready'}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
        {data?.ready
          ? concepts.map(k => <span key={k.id} title={`${k.label} · ${pct(k.mastery)}`} className={`h-[18px] w-[18px] rounded-full ${dotFor(k.mastery)}`} />)
          : Array.from({ length: 11 }, (_, i) => <span key={i} className="h-[18px] w-[18px] rounded-full border border-dashed border-[#b9cdd5]" />)}
      </div>
    </div>
  );
}


/** How sure the student said they were against how often they were right, per confidence level. */
function CalibrationCard({ style, courses, data }: { style: React.CSSProperties; courses: Course[]; data: Record<string, ClassData> }) {
  const withData = courses.filter(c => (data[c.id]?.calibration?.n ?? 0) > 0);
  const [picked, setPicked] = useState<string | null>(null);
  const course = withData.find(c => c.id === picked) ?? withData[0];
  const cal = course ? data[course.id].calibration : null;
  const verdict = calibrationVerdict(cal?.overconfidence ?? null);

  return (
    <section style={style} className={`${panel} p-5 flex flex-col md:col-span-2 xl:col-span-1`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs text-ink-3">Confidence check</h2>
          <p className="mt-1 text-[15px] text-[#0e3445]">{cal ? verdict : 'Rate your confidence on test answers to see this.'}</p>
        </div>
        {withData.length > 1 && (
          <div className="flex rounded-full bg-[#f1f5f7] p-0.5 text-xs">
            {withData.map(c => (
              <button key={c.id} type="button" onClick={() => setPicked(c.id)} className={`h-7 px-2.5 rounded-full cursor-pointer ${c.id === course?.id ? 'bg-white text-[#0e3445] shadow-sm' : 'text-ink-3'}`}>{c.code}</button>
            ))}
          </div>
        )}
      </div>
      {cal && <div className="mt-4 flex-1 flex flex-col"><CalibrationBars cal={cal} /></div>}
    </section>
  );
}

// ---- Class card -------------------------------------------------------------------

function ClassCard({ course, palette, data, index, attempts }: { course: Course; palette: ArtPalette; data?: ClassData; index: number; attempts: Map<string, Attempt> }) {
  const concepts = data?.concepts || [];
  const known = concepts.filter(k => k.mastery >= KNOWN).length;
  const learning = concepts.filter(k => k.mastery >= LEARNING && k.mastery < KNOWN).length;
  const open = (data?.tests || []).filter(t => !attempts.has(t.id)).length;
  const base = `/courses/${course.id}`;
  const total = Math.max(concepts.length, 1);

  return (
    <article style={rise(index + 7)} className={`group relative flex flex-col p-2 ${panel} transition-transform duration-300 hover:-translate-y-0.5`}>
      <div className="relative h-40 overflow-hidden rounded-[16px] text-white">
        <CourseArt seed={course.id} palette={palette} nodes={data?.ready ? concepts.length : 5} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-[1.04]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" aria-hidden />
        <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2">
          <span className="h-7 px-3 inline-flex items-center rounded-full bg-white/15 border border-white/25 backdrop-blur-md text-xs tabular">{course.code}</span>
          {open > 0 && <span className="h-7 px-3 inline-flex items-center rounded-full bg-black/20 border border-white/15 backdrop-blur-md text-xs">{plural(open, 'test')} to take</span>}
        </div>
        <h3 className="absolute bottom-4 inset-x-4 font-display font-medium text-[1.45rem] leading-[1.05] tracking-[-0.03em]">
          <Link to={base} className="after:absolute after:-inset-2 after:content-[''] focus:outline-none">{course.title}</Link>
        </h3>
      </div>

      <div className="flex flex-1 flex-col px-3 pt-4 pb-3">
        {course.schedule && <p className="text-xs text-ink-4">{course.schedule}</p>}
        {data?.ready ? (
          <div className="mt-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-3">Progress</span>
              <span className="text-[#0e3445] tabular">{known} known · {learning} learning · {concepts.length - known - learning} to go</span>
            </div>
            <div className="mt-2 flex h-2 gap-[3px]" aria-hidden>
              <span className="rounded-full bg-[#1b566b]" style={{ flex: known / total }} />
              <span className="rounded-full bg-[#8fbccb]" style={{ flex: learning / total }} />
              <span className="rounded-full bg-[#dbe7ec]" style={{ flex: (concepts.length - known - learning) / total || 1 }} />
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-3">Your professor is still preparing this class.</p>
        )}

        <div className="relative z-10 mt-auto pt-5 flex flex-wrap items-center gap-2">
          {data?.ready ? <Link to={`${base}/learn`} className={pillDark}><Sparkles size={14} /> Study</Link> : <Link to={base} className={pillDark}>Open</Link>}
          {data?.ready && <Link to={`${base}/map`} className={pillLine}><MapIcon size={14} /> Map</Link>}
          <Link to={`${base}/ask`} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] text-ink-3 hover:text-[#0e3445] hover:bg-[#f1f5f7] transition-colors">
            <MessageCircle size={14} /> Ask
          </Link>
        </div>
      </div>
    </article>
  );
}

// ---- Join dialog ------------------------------------------------------------------

function JoinDialog({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
  const addToast = useToastStore(s => s.addToast);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await coursesApi.join(code.trim());
      addToast('Joined the class', 'success');
      onJoined();
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not join with that code'), 'error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0e3445]/40 backdrop-blur-[3px] flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="join-title" className="bg-white rounded-[24px] p-2 max-w-md w-full shadow-[0_24px_60px_-20px_rgba(14,52,69,0.45)]" onClick={e => e.stopPropagation()}>
        <div className="relative h-28 overflow-hidden rounded-[18px]">
          <CourseArt seed={code || 'join'} palette={ART_PALETTES.sea} nodes={6} className="absolute inset-0 h-full w-full" />
          <h2 id="join-title" className="absolute bottom-4 left-5 font-display font-medium text-2xl tracking-[-0.03em] text-white">Join a class</h2>
        </div>
        <form onSubmit={submit} className="space-y-5 px-5 pt-5 pb-4">
          <div className="space-y-1.5">
            <label htmlFor="invite-code" className="block text-sm text-ink-2">Invite code</label>
            <input id="invite-code" autoFocus value={code} onChange={e => setCode(e.target.value)} required placeholder="e.g. ABCDEF"
              className="w-full h-12 px-4 bg-white border border-[#c3d8e0] rounded-xl font-display text-lg tracking-[0.14em] uppercase text-ink focus:outline-none focus:border-[#2a6f87] focus:ring-2 focus:ring-[#dbe7ec] placeholder:text-ink-4 placeholder:tracking-normal placeholder:text-[15px]" />
            <p className="text-xs text-ink-3">Your professor shares it from the course page.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={`${pillLine} flex-1 h-11`}>Cancel</button>
            <button type="submit" disabled={saving} className={`${pillDark} flex-1 h-11`}>{saving && <Loader2 size={14} className="animate-spin" />} Join</button>
          </div>
        </form>
      </div>
    </div>
  );
}
