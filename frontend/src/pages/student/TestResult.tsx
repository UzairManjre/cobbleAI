import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Minus, Sparkles, UserCheck, X } from 'lucide-react';
import { coursesApi, testsApi } from '../../api';
import GradientPage from '../../components/layout/GradientPage';
import { panel, pillLine, featureBg, rise, CLAY } from '../../components/ui/glass';
import { useGraphStore } from '../../store/graphStore';
import { apiErrorDetail } from '../../utils/apiError';
import { plural } from '../../utils/mastery';

interface Option { id: string; text: string; is_correct?: boolean }
interface Question {
  id: string; type: string; question_text: string; marks: number; options?: Option[];
  correct_answer?: boolean | null; explanation?: string | null; rubric?: string[]; topic?: string; node_id?: string;
}
interface Answer {
  question_id: string; answer_text?: string | null; selected_option_id?: string | null; is_correct?: boolean | null;
  marks_awarded?: number | null; feedback?: string | null; confidence?: number | null; graded_by?: string | null;
  review_status?: string | null; evidence?: { point: string; met: boolean }[];
}
interface ResultData {
  attempt: { id: string; course_id: string; status: string; total_marks_awarded: number; percentage: number; answers: Answer[]; submitted_at?: string; time_taken_seconds?: number };
  test: { id: string; title: string; total_marks: number; passing_percentage: number; questions: Question[] };
  revealed: boolean;
}

type Verdict = 'right' | 'partly' | 'wrong';
const CONFIDENCE: Record<number, string> = { 1: 'Guessing', 2: 'Unsure', 3: 'Fairly sure', 4: 'Certain' };
const VERDICT_WORD: Record<Verdict, string> = { right: 'Right', partly: 'Partly right', wrong: 'Not right' };

function verdictOf(q: Question, a?: Answer): Verdict {
  if (a?.is_correct === true) return 'right';
  const got = a?.marks_awarded ?? 0;
  if (got >= q.marks) return 'right';
  return got > 0 ? 'partly' : 'wrong';
}

function answerText(q: Question, a?: Answer) {
  if (!a) return null;
  if (q.type === 'true_false' && a.selected_option_id) return a.selected_option_id === 'true' ? 'True' : 'False';
  if (a.selected_option_id) return q.options?.find(o => o.id === a.selected_option_id)?.text ?? a.selected_option_id;
  return a.answer_text || null;
}

function correctText(q: Question) {
  if (q.type === 'mcq') return q.options?.find(o => o.is_correct)?.text ?? null;
  if (q.type === 'true_false' && q.correct_answer != null) return q.correct_answer ? 'True' : 'False';
  return null;
}

const minutes = (s?: number) => (s ? `${Math.max(1, Math.round(s / 60))} min` : '');
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

/** One graded test: the score, how each topic went, how sure the student was, then every question. */
export default function TestResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!attemptId) return;
    testsApi.getResult(attemptId)
      .then(res => {
        setData(res.data);
        coursesApi.list().then(c => setCode((c.data || []).find((x: { id: string }) => x.id === res.data.attempt.course_id)?.code ?? '')).catch(() => undefined);
      })
      .catch(err => setError(apiErrorDetail(err, 'Could not load your result.')));
  }, [attemptId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.attempt.answers.map(a => [a.question_id, a]));
    return data.test.questions.map((q, i) => ({ q, a: byId.get(q.id), n: i + 1, v: verdictOf(q, byId.get(q.id)) }));
  }, [data]);

  if (error || !data) {
    return (
      <GradientPage>
        <div className="mt-16 text-white">
          {error ? (
            <>
              <h1 className="font-display text-3xl font-medium tracking-[-0.03em]">{error}</h1>
              <button type="button" onClick={() => navigate(-1)} className="mt-5 inline-flex items-center gap-2 text-white/80 hover:text-white cursor-pointer"><ArrowLeft size={15} /> Go back</button>
            </>
          ) : (
            <div aria-busy="true"><div className="h-3 w-24 rounded bg-white/20 animate-pulse" /><div className="h-12 w-2/3 max-w-xl rounded-lg bg-white/20 animate-pulse mt-6" /></div>
          )}
        </div>
      </GradientPage>
    );
  }

  const { attempt, test, revealed } = data;
  const back = `/courses/${attempt.course_id}/tests`;
  const passed = attempt.percentage >= test.passing_percentage;
  const fullyRight = rows.filter(r => r.v === 'right').length;
  // The topic that cost the most marks is the one to practise
  const weakest = [...rows].filter(r => r.v !== 'right' && r.q.node_id).sort((x, y) => (x.a?.marks_awarded ?? 0) / x.q.marks - (y.a?.marks_awarded ?? 0) / y.q.marks)[0];
  const study = (nodeId: string) => {
    useGraphStore.setState({ currentNodeId: nodeId });
    navigate(`/courses/${attempt.course_id}/learn?node=${nodeId}`);
  };

  return (
    <GradientPage height={600}>
      <header className="mt-6 sm:mt-8 text-white" style={rise(0)}>
        <Link to={back} className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors"><ArrowLeft size={14} /> {code ? `${code} tests` : 'Tests'}</Link>
        <h1 className="mt-4 font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">{test.title}</h1>
        <p className="mt-2.5 text-white/75 text-[15px] tabular">
          {[attempt.submitted_at && `Handed in ${day(attempt.submitted_at)}`, attempt.time_taken_seconds && `took ${minutes(attempt.time_taken_seconds)}`, plural(test.questions.length, 'question')].filter(Boolean).join(' · ')}
        </p>
      </header>

      {!revealed ? (
        <section style={{ ...rise(1), background: featureBg }} className="mt-8 max-w-2xl rounded-[22px] p-6 text-white">
          <span className="grid place-items-center h-10 w-10 rounded-full bg-white/15"><Clock size={18} /></span>
          <h2 className="mt-4 font-display font-medium text-[1.7rem] leading-[1.1] tracking-[-0.03em]">Handed in. Waiting for grading.</h2>
          <p className="mt-2 text-sm text-white/75">Your professor checks the AI's grades before you see them. Your score and feedback appear here after that.</p>
          <Link to={back} className="mt-5 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors">Back to tests</Link>
        </section>
      ) : (
        <>
          {/* Row 1: score, by topic, confidence */}
          <div className="mt-8 grid gap-4 xl:grid-cols-3">
            <section style={{ ...rise(1), background: featureBg }} className="relative overflow-hidden rounded-[22px] p-6 text-white flex flex-col min-h-[250px]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-white/70">Your score</p>
                  <p className="mt-1 font-display font-medium text-[3.6rem] leading-none tracking-[-0.045em] tabular">{Math.round(attempt.percentage)}%</p>
                  <p className="mt-2 text-sm text-white/80 tabular">{attempt.total_marks_awarded} of {test.total_marks} marks · {fullyRight} of {rows.length} fully right</p>
                </div>
                <span className="h-8 px-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 text-xs">
                  {passed ? <Check size={13} /> : <Minus size={13} />}{passed ? 'Passed' : 'Below the pass mark'}
                </span>
              </div>
              {/* Score against the pass mark */}
              <div className="relative mt-5 h-2 rounded-full bg-white/20">
                <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${attempt.percentage}%` }} />
                <span className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-white/70" style={{ left: `${test.passing_percentage}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-white/60 tabular">Pass mark {test.passing_percentage}%</p>
              <div className="mt-auto pt-5 flex flex-wrap gap-2">
                {weakest?.q.node_id && (
                  <button type="button" onClick={() => study(weakest.q.node_id!)} className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors cursor-pointer">
                    <Sparkles size={14} /> Practise {weakest.q.topic ?? 'the weak spot'}
                  </button>
                )}
                <Link to={back} className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/40 text-sm hover:bg-white/10 transition-colors">All tests</Link>
              </div>
            </section>

            <section style={rise(2)} className={`${panel} p-5 flex flex-col`}>
              <h2 className="text-xs text-ink-3">By topic</h2>
              <ul className="mt-auto pt-4 space-y-3.5">
                {rows.map(({ q, a, v }) => {
                  const share = (a?.marks_awarded ?? 0) / q.marks;
                  return (
                    <li key={q.id}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        {q.node_id
                          ? <button type="button" onClick={() => study(q.node_id!)} className="text-[#0e3445] truncate hover:underline underline-offset-4 cursor-pointer">{q.topic ?? q.question_text}</button>
                          : <span className="text-[#0e3445] truncate">{q.topic ?? q.question_text}</span>}
                        <span className="tabular" style={{ color: v === 'wrong' ? CLAY.ink : '#0e3445' }}>{a?.marks_awarded ?? 0}/{q.marks}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 rounded-full bg-[#e6eef2] overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: v === 'right' ? '#1b566b' : v === 'partly' ? '#8fbccb' : CLAY.bar }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <ConfidenceCard style={rise(3)} rows={rows} />
          </div>

          {/* Row 2: every question */}
          <section aria-labelledby="questions-heading" className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem] items-start">
            <div style={rise(4)} className={`${panel} p-5`}>
              <h2 id="questions-heading" className="text-[15px] text-[#0e3445]">Questions</h2>
              <ol className="mt-4 space-y-3">
                {rows.map(r => <QuestionCard key={r.q.id} {...r} onStudy={study} />)}
              </ol>
            </div>

            <nav aria-label="Jump to a question" style={rise(5)} className={`${panel} p-4 xl:sticky xl:top-4`}>
              <p className="text-xs text-ink-3 px-1">Jump to</p>
              <ul className="mt-2 space-y-1">
                {rows.map(({ q, a, n, v }) => (
                  <li key={q.id}>
                    <a href={`#q-${q.id}`} className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-[#f1f5f7] transition-colors">
                      <VerdictBead v={v} n={n} small />
                      <span className="min-w-0 flex-1 text-sm text-[#0e3445] truncate">{q.topic ?? `Question ${n}`}</span>
                      <span className="text-xs text-ink-3 tabular">{a?.marks_awarded ?? 0}/{q.marks}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </section>
        </>
      )}
    </GradientPage>
  );
}

// ---- Pieces -------------------------------------------------------------------------

function VerdictBead({ v, n, small }: { v: Verdict; n: number; small?: boolean }) {
  const size = small ? 'h-7 w-7' : 'h-9 w-9';
  const style = v === 'right' ? { background: '#1b566b', color: '#fff' } : v === 'partly' ? { background: '#dbe7ec', color: '#0e3445' } : { background: CLAY.wash, color: CLAY.ink };
  return (
    <span className={`grid place-items-center ${size} shrink-0 rounded-full text-xs tabular`} style={style} title={VERDICT_WORD[v]}>
      {v === 'right' ? <Check size={small ? 12 : 15} /> : v === 'wrong' ? <X size={small ? 12 : 15} /> : n}
    </span>
  );
}

type Row = { q: Question; a?: Answer; n: number; v: Verdict };

/** How sure the student said they were on each question, against how it went. */
function ConfidenceCard({ style, rows }: { style: CSSProperties; rows: Row[] }) {
  const rated = rows.filter(r => r.a?.confidence);
  const overSure = rated.filter(r => (r.a!.confidence ?? 0) >= 3 && r.v === 'wrong').length;
  const underSure = rated.filter(r => (r.a!.confidence ?? 0) <= 2 && r.v !== 'wrong').length;
  const line = !rated.length ? 'You did not rate how sure you were on this test.'
    : overSure ? `You felt sure on ${plural(overSure, 'answer')} that ${overSure === 1 ? 'was' : 'were'} wrong. Worth a second look.`
      : underSure ? `You doubted ${plural(underSure, 'answer')} that ${underSure === 1 ? 'was' : 'were'} right. Trust yourself a bit more.`
        : 'Your confidence matched your results.';
  return (
    <section style={style} className={`${panel} p-5 flex flex-col`}>
      <h2 className="text-xs text-ink-3">How sure you were</h2>
      <p className="mt-1 text-[15px] text-[#0e3445]">{line}</p>
      {rated.length > 0 && (
        <ul className="mt-auto pt-4 space-y-2">
          {rated.map(({ q, a, n, v }) => (
            <li key={q.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-xs">
              <VerdictBead v={v} n={n} small />
              {/* Four steps of sureness */}
              <span className="flex gap-1" aria-label={CONFIDENCE[a!.confidence!]}>
                {[1, 2, 3, 4].map(k => <span key={k} className={`h-2 flex-1 rounded-full ${k <= a!.confidence! ? 'bg-[#2a6f87]' : 'bg-[#e6eef2]'}`} />)}
              </span>
              <span className="w-20 text-right text-ink-3">{CONFIDENCE[a!.confidence!]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestionCard({ q, a, n, v, onStudy }: Row & { onStudy: (nodeId: string) => void }) {
  const mine = answerText(q, a);
  const correct = correctText(q);
  const met = new Map((a?.evidence || []).map(e => [e.point, e.met]));
  const checkedByProfessor = !!a?.graded_by && a.graded_by !== 'auto';
  return (
    <li id={`q-${q.id}`} className="scroll-mt-6 rounded-2xl border border-[#e2eaeb] bg-white p-4">
      <div className="flex items-start gap-3">
        <VerdictBead v={v} n={n} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[15px] text-[#0e3445] leading-snug"><span className="text-ink-4 tabular mr-1.5">{n}.</span>{q.question_text}</p>
            <span className="shrink-0 h-7 px-2.5 inline-flex items-center rounded-full text-xs tabular"
              style={v === 'wrong' ? { background: CLAY.wash, color: CLAY.ink } : { background: '#f1f5f7', color: '#0e3445' }}>
              {a?.marks_awarded ?? 0} / {q.marks}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-3">{VERDICT_WORD[v]}{q.topic ? ` · ${q.topic}` : ''}{a?.confidence ? ` · you were ${CONFIDENCE[a.confidence].toLowerCase()}` : ''}</p>

          <div className={`mt-3 grid gap-2 ${correct && v !== 'right' ? 'md:grid-cols-2' : ''}`}>
            <div className="rounded-xl bg-[#f1f5f7] px-3 py-2.5">
              <p className="text-[11px] text-ink-3">Your answer</p>
              <p className="mt-0.5 text-sm text-[#0e3445] whitespace-pre-wrap">{mine ?? <span className="text-ink-4">Not answered</span>}</p>
            </div>
            {correct && v !== 'right' && (
              <div className="rounded-xl bg-[#e2edf2] px-3 py-2.5">
                <p className="text-[11px] text-[#2a6f87]">Correct answer</p>
                <p className="mt-0.5 text-sm text-[#0e3445]">{correct}</p>
              </div>
            )}
          </div>

          {!!q.rubric?.length && (
            <ul className="mt-3 space-y-1.5">
              {q.rubric.map(point => {
                const ok = met.get(point) === true;
                return (
                  <li key={point} className="flex items-center gap-2 text-[13px]">
                    <span className="grid place-items-center h-5 w-5 shrink-0 rounded-full" style={ok ? { background: '#1b566b', color: '#fff' } : { background: CLAY.wash, color: CLAY.ink }}>
                      {ok ? <Check size={11} /> : <Minus size={11} />}
                    </span>
                    <span className={ok ? 'text-[#0e3445]' : 'text-ink-3'}>{point}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {a?.feedback && (
            <div className="mt-3 flex gap-2.5 rounded-xl border border-[#dbe7ec] px-3 py-2.5">
              <UserCheck size={15} className="mt-0.5 shrink-0 text-[#2a6f87]" />
              <div>
                <p className="text-[11px] text-ink-3">{checkedByProfessor ? 'From your professor' : 'Feedback'}</p>
                <p className="mt-0.5 text-sm text-[#0e3445]">{a.feedback}</p>
              </div>
            </div>
          )}

          {q.explanation && v !== 'right' && <p className="mt-3 text-[13px] text-ink-3 leading-relaxed">{q.explanation}</p>}

          {q.node_id && v !== 'right' && (
            <button type="button" onClick={() => onStudy(q.node_id!)} className={`${pillLine} mt-3 h-8 px-3`}><Sparkles size={13} /> Study {q.topic ?? 'this topic'}</button>
          )}
        </div>
      </div>
    </li>
  );
}
