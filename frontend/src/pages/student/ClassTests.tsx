import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Clock, FileText, ListChecks } from 'lucide-react';
import { testsApi } from '../../api';
import { learnerApi, type Calibration } from '../../api/learner';
import ScoreRing from '../../components/student/ScoreRing';
import CalibrationBars from '../../components/student/CalibrationBars';
import { panel, pillDark, pillLine, featureBg, rise } from '../../components/ui/glass';
import { CLAY } from '../../components/ui/glass';
import { calibrationVerdict, plural } from '../../utils/mastery';

interface Test {
  id: string; title: string; description?: string; test_type: string; status: string;
  duration_minutes: number; passing_percentage: number; total_marks: number; question_count?: number;
}
interface Attempt { id: string; test_id: string; status: string; percentage: number | null; submitted_at?: string }

type State = 'todo' | 'in_progress' | 'waiting' | 'passed' | 'below';
const STATE_LABEL: Record<State, string> = { todo: 'Not started', in_progress: 'In progress', waiting: 'Waiting for a grade', passed: 'Passed', below: 'Below the pass mark' };
const kind = (t: Test) => (t.test_type === 'assignment' ? 'Assignment' : t.test_type === 'exam' ? 'Exam' : 'Quiz');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

/** A student's tests in one class: the next one to take, how the finished ones went, and the full list. */
export default function ClassTests() {
  const { courseId = '' } = useParams();
  const [tests, setTests] = useState<Test[] | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [cal, setCal] = useState<Calibration | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([testsApi.getByCourse(courseId), testsApi.getMyAttempts(), learnerApi.calibration(courseId)]).then(([t, a, c]) => {
      if (cancelled) return;
      setTests(t.status === 'fulfilled' ? (t.value.data || []).filter((x: Test) => x.status === 'published') : []);
      setAttempts(a.status === 'fulfilled' ? a.value.data?.attempts || [] : []);
      setCal(c.status === 'fulfilled' && c.value.data.n > 0 ? c.value.data : null);
    });
    return () => { cancelled = true; };
  }, [courseId]);

  const rows = useMemo(() => {
    const latest = new Map<string, Attempt>();
    for (const a of attempts) latest.set(a.test_id, a);
    return (tests || []).map(t => {
      const a = latest.get(t.id);
      const state: State = !a ? 'todo' : a.status === 'in_progress' ? 'in_progress' : a.status !== 'graded' || a.percentage == null ? 'waiting'
        : a.percentage >= t.passing_percentage ? 'passed' : 'below';
      return { t, a, state };
    }).sort((x, y) => order(x.state) - order(y.state));
  }, [tests, attempts]);

  const loading = tests === null;
  const next = rows.find(r => r.state === 'in_progress' || r.state === 'todo') ?? null;
  const graded = rows.filter(r => r.state === 'passed' || r.state === 'below');
  const avg = graded.length ? graded.reduce((n, r) => n + (r.a!.percentage ?? 0), 0) / graded.length / 100 : null;

  return (
    <>
      {/* Row 1: next test, results so far, confidence */}
      <div className="mt-8 grid gap-4 xl:grid-cols-3">
        <section style={{ ...rise(1), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[250px]">
          <p className="text-xs text-white/70">{next ? `Up next · ${kind(next.t)}` : 'Up next'}</p>
          <h2 className="mt-2 font-display font-medium text-[1.9rem] leading-[1.05] tracking-[-0.03em]">
            {loading ? 'Loading your tests…' : next ? next.t.title : 'Nothing left to take.'}
          </h2>
          <p className="mt-2 text-sm text-white/75 line-clamp-2">{next ? next.t.description : 'New tests from your professor show up here.'}</p>
          {next && (
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80 tabular">
              <span className="inline-flex items-center gap-1.5"><Clock size={12} />{next.t.duration_minutes} min</span>
              {next.t.question_count != null && <span className="inline-flex items-center gap-1.5"><ListChecks size={12} />{plural(next.t.question_count, 'question')}</span>}
              <span>Pass at {next.t.passing_percentage}%</span>
            </p>
          )}
          {next && (
            <div className="mt-auto pt-5">
              <Link to={`/tests/${next.t.id}`} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors">
                {next.state === 'in_progress' ? 'Continue' : 'Start'} <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </section>

        <section style={rise(2)} className={`${panel} p-5 flex flex-col`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xs text-ink-3">Average score</h2>
              <p className="mt-1 font-display text-[2.4rem] leading-none tracking-[-0.04em] text-[#0e3445] tabular">{avg === null ? '–' : `${Math.round(avg * 100)}%`}</p>
            </div>
            <span className="text-xs text-ink-3 tabular">{plural(graded.length, 'graded test')}</span>
          </div>
          {graded.length === 0 ? (
            <p className="mt-auto pt-5 text-sm text-ink-3">Scores appear here once a test is graded.</p>
          ) : (
            <ul className="mt-auto pt-5 space-y-3">
              {graded.map(({ t, a, state }) => (
                <li key={t.id}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-[#0e3445] truncate">{t.title}</span>
                    <span className="tabular" style={{ color: state === 'below' ? CLAY.ink : '#0e3445' }}>{Math.round(a!.percentage!)}%</span>
                  </div>
                  {/* Score bar with the pass mark */}
                  <div className="relative mt-1.5 h-2.5 rounded-full bg-[#e6eef2]">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${a!.percentage}%`, background: state === 'below' ? CLAY.bar : '#1b566b' }} />
                    <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-[#0e3445]/45" style={{ left: `${t.passing_percentage}%` }} title={`Pass mark ${t.passing_percentage}%`} />
                  </div>
                </li>
              ))}
              <li className="flex items-center gap-1.5 text-[11px] text-ink-4"><span className="h-2.5 w-0.5 rounded-full bg-[#0e3445]/45" /> pass mark</li>
            </ul>
          )}
        </section>

        <section style={rise(3)} className={`${panel} p-5 flex flex-col`}>
          <h2 className="text-xs text-ink-3">Confidence check</h2>
          <p className="mt-1 text-[15px] text-[#0e3445]">{cal ? calibrationVerdict(cal.overconfidence) : 'Rate how sure you are on test answers to see this.'}</p>
          {cal && <div className="mt-4 flex-1 flex flex-col"><CalibrationBars cal={cal} /></div>}
        </section>
      </div>

      {/* Row 2: every test */}
      <section aria-labelledby="all-tests" style={rise(4)} className={`mt-4 ${panel} p-5`}>
        <div className="flex items-center justify-between">
          <h2 id="all-tests" className="text-[15px] text-[#0e3445]">All tests</h2>
          <span className="text-xs text-ink-3 tabular">{loading ? '' : `${rows.filter(r => r.state === 'todo' || r.state === 'in_progress').length} to take · ${graded.length} graded`}</span>
        </div>
        {loading ? (
          <div className="mt-4 space-y-2">{[0, 1].map(i => <div key={i} className="h-16 rounded-2xl bg-[#ecf3f6] animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <p className="mt-4 flex items-center gap-3 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3"><FileText size={16} /> Your professor has not published a test yet.</p>
        ) : (
          <ul className="mt-4 space-y-1.5">
            {rows.map(({ t, a, state }) => (
              <li key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 px-2.5 py-2 rounded-2xl bg-[#f1f5f7]">
                <ScoreRing value={a?.percentage != null && (state === 'passed' || state === 'below') ? a.percentage / 100 : null} color={state === 'below' ? CLAY.bar : '#1b566b'} />
                <span className="min-w-0">
                  <span className="block text-[15px] text-[#0e3445] truncate">{t.title}</span>
                  <span className="block text-xs text-ink-3 truncate tabular">
                    {kind(t)} · {t.duration_minutes} min{t.question_count != null ? ` · ${plural(t.question_count, 'question')}` : ''} · pass at {t.passing_percentage}%
                    {a?.submitted_at && state !== 'in_progress' ? ` · handed in ${day(a.submitted_at)}` : ''}
                  </span>
                </span>
                <StatusChip state={state} />
                <span className="w-[6.5rem] flex justify-end">
                  {state === 'todo' || state === 'in_progress'
                    ? <Link to={`/tests/${t.id}`} className={pillDark}>{state === 'todo' ? 'Start' : 'Continue'} <ArrowRight size={13} /></Link>
                    : state === 'waiting' ? <span className="text-xs text-ink-4">—</span>
                      : <Link to={`/tests/${t.id}/result/${a!.id}`} className={pillLine}>Result</Link>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function order(s: State) {
  return { in_progress: 0, todo: 1, waiting: 2, below: 3, passed: 4 }[s];
}

function StatusChip({ state }: { state: State }) {
  const style = state === 'below' ? { background: CLAY.wash, color: CLAY.ink }
    : state === 'passed' ? { background: '#dbe7ec', color: '#1b566b' }
      : { background: '#ffffff', color: '#5b7480' };
  return <span className="hidden md:inline-flex items-center h-7 px-3 rounded-full text-xs whitespace-nowrap" style={style}>{STATE_LABEL[state]}</span>;
}
