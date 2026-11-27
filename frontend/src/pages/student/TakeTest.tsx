import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Clock, Lightbulb, LogOut } from 'lucide-react';
import { testsApi } from '../../api';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';
import { answersFromAttempt, formatAnswers, remainingSeconds, type AnswerKind, type AnswerState } from '../../utils/testAnswers';
import ConfidenceCheckIn from '../../components/tests/ConfidenceCheckIn';
import { CLAY } from '../../components/ui/glass';
import { plural } from '../../utils/mastery';

const DEBOUNCE_MS = 2000;    // wait 2 s of inactivity before auto-saving
const FLUSH_MS   = 30_000;   // force a save at most every 30 s regardless

// Same full-screen chrome as the Learn view
const RAIL_BG = 'radial-gradient(90% 40% at 0% 0%, rgba(64,124,145,0.55) 0%, rgba(64,124,145,0) 70%), linear-gradient(180deg, #0e3445 0%, #123f52 55%, #1b566b 100%)';
const PAGE_BG = 'radial-gradient(60% 280px at 50% 0%, rgba(143,188,203,0.35) 0%, rgba(143,188,203,0) 100%), #eef3f5';

interface Question {
  id: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'essay' | 'code';
  question_text: string;
  marks: number;
  options?: { id: string; text: string }[];
  starter_code?: string | null;
  hints?: string[];
}
interface Test { id: string; title: string; test_type: string; duration_minutes: number; questions: Question[] }
interface Attempt { id: string; started_at?: string; answers?: Parameters<typeof answersFromAttempt>[0] }

const TYPE_LABEL: Record<Question['type'], string> = {
  mcq: 'Multiple choice', true_false: 'True or false', short_answer: 'Short answer', essay: 'Essay', code: 'Code',
};
const kindOf = (t: string) => (t === 'assignment' ? 'Assignment' : t === 'exam' ? 'Exam' : 'Quiz');
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const isAnswered = (a?: AnswerState) => !!a && String(a.value ?? '').trim().length > 0;

/** Taking a test: full screen, with the clock and every question in a rail and one question at a time. */
export default function TakeTest() {
  const navigate = useNavigate();
  const { testId } = useParams();

  const [test, setTest] = useState<Test | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idx, setIdx] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // ── Stable refs ──────────────────────────────────────────────────────────
  // answersRef mirrors the answers state so the interval / debounce callbacks
  // always read the latest snapshot without stale closures.
  const answersRef   = useRef<Record<string, AnswerState>>({});
  const attemptRef   = useRef<Attempt | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(0);
  const startedForRef = useRef<string | undefined>(undefined);
  const submitRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    answersRef.current = answers;
    attemptRef.current = attempt;
  });

  // ── Core save function ───────────────────────────────────────────────────
  const doAutoSave = useCallback(async () => {
    const currentAttempt = attemptRef.current;
    const currentAnswers = answersRef.current;
    if (!currentAttempt || Object.keys(currentAnswers).length === 0) return;
    lastSavedRef.current = Date.now();
    try {
      await testsApi.submit(currentAttempt.id, formatAnswers(currentAnswers), true /* is_auto_save */);
      setSavedAt(new Date());
    } catch (err) {
      // Auto-save failures are non-fatal
      console.warn('Auto-save failed:', err);
    }
  }, []);

  const startTest = useCallback(async () => {
    // StrictMode runs effects twice in dev; only start the attempt once per test
    if (startedForRef.current === testId) return;
    startedForRef.current = testId;
    try {
      const startRes = await testsApi.start(testId || '');
      const startedAttempt = startRes.data.attempt;
      setTest(startRes.data.test);
      setAttempt(startedAttempt);
      // A resumed attempt keeps its saved answers and the clock keeps running from its start time
      setAnswers(answersFromAttempt(startedAttempt?.answers));
      setTimeLeft(remainingSeconds(startRes.data.test.duration_minutes, startedAttempt?.started_at));
    } catch (err) {
      startedForRef.current = undefined;
      const response = (err as { response?: { status?: number } }).response;
      // No attempts left (or the test closed): open the latest result instead of a dead end
      if (response?.status === 403) {
        try {
          const { data } = await testsApi.getMyAttempts();
          type AttemptRow = { id: string; test_id: string; status: string; submitted_at?: string | null };
          const done = ((data.attempts || []) as AttemptRow[])
            .filter(a => a.test_id === testId && a.status !== 'in_progress')
            .sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
          if (done[0]) {
            navigate(`/tests/${testId}/result/${done[0].id}`, { replace: true });
            return;
          }
        } catch {
          // fall through to going back
        }
      }
      console.error('Failed to start test:', err);
      useToastStore.getState().addToast(apiErrorDetail(err, 'Could not start the test'), 'error');
      // Opened directly (new tab or link): there is no page to go back to
      if (window.history.length > 1) navigate(-1);
      else navigate('/assignments', { replace: true });
    }
  }, [testId, navigate]);

  useEffect(() => { startTest(); }, [startTest]);

  // ── Timer: hands the test in when it reaches zero ────────────────────────
  const running = timeLeft > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          submitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  // ── Safety-net auto-save every 30 s ──────────────────────────────────────
  useEffect(() => {
    const flush = setInterval(() => {
      const hasAnswers = Object.keys(answersRef.current).length > 0;
      if (hasAnswers && Date.now() - lastSavedRef.current >= FLUSH_MS) doAutoSave();
    }, FLUSH_MS);
    return () => clearInterval(flush);
  }, [doAutoSave]);

  // ── Debounced save after each change ─────────────────────────────────────
  const scheduleDebouncedSave = useCallback(() => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      doAutoSave();
    }, DEBOUNCE_MS);
  }, [doAutoSave]);

  const handleAnswer = (questionId: string, value: string, type: AnswerKind = 'text') => {
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], value, type, time_spent: 0 } }));
    scheduleDebouncedSave();
  };

  const handleConfidence = (questionId: string, confidence: number) => {
    setAnswers(prev => prev[questionId] ? { ...prev, [questionId]: { ...prev[questionId], confidence } } : prev);
    scheduleDebouncedSave();
  };

  const handleSubmitTest = async () => {
    const current = attemptRef.current;
    if (!current) return;
    // Cancel any pending debounced save before the final submit
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setIsSubmitting(true);
    try {
      await testsApi.submit(current.id, formatAnswers(answersRef.current));
      navigate(`/tests/${testId}/result/${current.id}`);
    } catch (err) {
      useToastStore.getState().addToast(apiErrorDetail(err, 'Could not hand in the test. Try again.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };
  useEffect(() => { submitRef.current = handleSubmitTest; });

  // The attempt stays open and the clock keeps running; answers are saved first
  const saveAndLeave = async () => {
    await doAutoSave();
    if (window.history.length > 1) navigate(-1);
    else navigate('/assignments');
  };

  if (!test || !attempt) {
    return (
      <div className="fixed inset-0 grid place-items-center text-ink-3" style={{ background: PAGE_BG }}>
        <span className="flex items-center gap-3 text-sm">
          <span className="h-5 w-5 rounded-full border-2 border-[#c3d8e0] border-t-[#0e3445] animate-spin" />
          Opening your test…
        </span>
      </div>
    );
  }

  const questions = test.questions || [];
  const total = questions.length;
  const q = questions[idx];
  const answered = questions.filter(x => isAnswered(answers[x.id])).length;
  const unanswered = questions.map((x, i) => (isAnswered(answers[x.id]) ? -1 : i)).filter(i => i >= 0);
  const lowTime = timeLeft < 300;
  const last = idx === total - 1;
  const current = q ? answers[q.id] : undefined;

  const optionCard = (selected: boolean) =>
    `w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all cursor-pointer ${selected
      ? 'bg-[#0e3445] text-white shadow-[0_14px_30px_-18px_rgba(14,52,69,0.8)]'
      : 'bg-white text-[#0e3445] hover:shadow-[0_10px_24px_-18px_rgba(14,52,69,0.6)] hover:-translate-y-px'}`;

  return (
    <div className="fixed inset-0 z-[60] flex text-ink" style={{ background: PAGE_BG }}>
      {/* Rail: clock, progress, every question, hand in */}
      <aside aria-label="Test overview" className="w-[288px] shrink-0 flex flex-col text-white p-5" style={{ background: RAIL_BG }}>
        <button type="button" onClick={saveAndLeave}
          className="self-start inline-flex items-center gap-2 h-9 px-3.5 rounded-full border border-white/25 text-xs text-white/85 hover:bg-white/10 transition-colors cursor-pointer">
          <LogOut size={13} /> Save and leave
        </button>

        <p className="mt-7 text-xs text-white/60">{kindOf(test.test_type)}</p>
        <h1 className="mt-1 font-display text-[1.35rem] leading-tight tracking-[-0.02em]">{test.title}</h1>

        <div className="mt-6 rounded-2xl p-4" style={{ background: lowTime ? 'rgba(201,149,127,0.22)' : 'rgba(255,255,255,0.08)' }}>
          <p className="flex items-center gap-1.5 text-xs" style={{ color: lowTime ? '#f1d6cb' : 'rgba(255,255,255,0.65)' }}>
            <Clock size={12} /> {timeLeft === 0 ? 'Time is up' : lowTime ? 'Under 5 minutes left' : 'Time left'}
          </p>
          <p className="mt-1 font-display text-[2.4rem] leading-none tracking-[-0.04em] tabular" aria-live={lowTime ? 'polite' : 'off'}>{formatTime(timeLeft)}</p>
          <p className="mt-2 text-xs text-white/60">{timeLeft === 0 ? 'Hand in to finish this attempt.' : 'Hands in automatically at 00:00'}</p>
        </div>

        <div className="mt-6 flex items-baseline justify-between text-xs">
          <span className="text-white/65">Questions</span>
          <span className="tabular text-white/85">{answered} of {total} answered</span>
        </div>
        <ol className="mt-3 grid grid-cols-5 gap-2">
          {questions.map((x, i) => {
            const done = isAnswered(answers[x.id]);
            const active = i === idx;
            return (
              <li key={x.id}>
                <button type="button" onClick={() => setIdx(i)} aria-current={active ? 'step' : undefined}
                  aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                  className={`relative grid place-items-center h-10 w-10 rounded-full text-sm tabular transition-colors cursor-pointer ${
                    active ? 'bg-white text-[#0e3445] ring-4 ring-white/20'
                      : done ? 'bg-[#8fbccb] text-[#0e3445] hover:bg-[#a8cbd7]'
                        : 'border border-white/30 text-white/80 hover:bg-white/10'}`}>
                  {i + 1}
                  {done && !active && <Check size={10} strokeWidth={3} className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0.5 rounded-full bg-[#0e3445] text-white" />}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto pt-6">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] text-white/55">
            <Check size={12} /> {savedAt ? `Saved at ${savedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Answers save as you go'}
          </p>
          <button type="button" onClick={() => setShowConfirmSubmit(true)}
            className="w-full h-11 rounded-full bg-white text-[#0e3445] text-sm font-medium hover:bg-[#ecf3f6] transition-colors cursor-pointer">
            Hand in
          </button>
        </div>
      </aside>

      {/* The question */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {q && (
            <div key={q.id} className="max-w-[46rem] mx-auto px-8 pt-14 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <span className="text-[#0e3445]">Question {idx + 1} of {total}</span>
                <span className="h-1 w-1 rounded-full bg-ink-4" />
                {TYPE_LABEL[q.type] ?? q.type}
                <span className="h-1 w-1 rounded-full bg-ink-4" />
                {plural(q.marks, 'mark')}
              </p>
              <h2 className="mt-3 font-display text-[1.85rem] leading-[1.2] tracking-[-0.025em] text-[#0e3445] whitespace-pre-wrap">{q.question_text}</h2>

              <div className="mt-8">
                {q.type === 'mcq' && (
                  <div className="space-y-2.5" role="radiogroup" aria-label="Options">
                    {q.options?.map((option, i) => {
                      const selected = current?.value === option.id;
                      return (
                        <button key={option.id} type="button" role="radio" aria-checked={selected}
                          onClick={() => handleAnswer(q.id, option.id, 'option')} className={optionCard(selected)}>
                          <span className={`grid place-items-center h-9 w-9 shrink-0 rounded-full text-sm ${selected ? 'bg-white text-[#0e3445]' : 'bg-[#f1f5f7] text-[#1b566b]'}`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-[15px] leading-relaxed">{option.text}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="True or false">
                    {(['true', 'false'] as const).map(v => {
                      const selected = current?.value === v;
                      return (
                        <button key={v} type="button" role="radio" aria-checked={selected}
                          onClick={() => handleAnswer(q.id, v, 'option')} className={`${optionCard(selected)} justify-center h-20 text-lg`}>
                          {v === 'true' ? 'True' : 'False'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(q.type === 'short_answer' || q.type === 'essay') && (
                  <div className="rounded-[20px] bg-white shadow-[0_10px_28px_-20px_rgba(14,52,69,0.5)] focus-within:ring-2 focus-within:ring-[#2a6f87]/40 transition-shadow">
                    <textarea
                      value={current?.value || ''}
                      onChange={e => handleAnswer(q.id, e.target.value, 'text')}
                      placeholder="Write your answer…"
                      aria-label="Your answer"
                      rows={q.type === 'essay' ? 12 : 6}
                      className="w-full bg-transparent px-5 pt-4 pb-2 text-[15px] text-[#0e3445] placeholder:text-ink-4 focus:outline-none resize-none leading-relaxed"
                    />
                    <p className="px-5 pb-3 text-right text-[11px] text-ink-4 tabular">
                      {plural((current?.value || '').trim().split(/\s+/).filter(Boolean).length, 'word')}
                    </p>
                  </div>
                )}

                {q.type === 'code' && (
                  <div className="rounded-[20px] overflow-hidden bg-white shadow-[0_10px_28px_-20px_rgba(14,52,69,0.5)] focus-within:ring-2 focus-within:ring-[#2a6f87]/40">
                    {q.starter_code && (
                      <pre className="bg-[#0e3445] text-[#dbe7ec] px-5 py-4 text-[13px] font-mono overflow-x-auto">{q.starter_code}</pre>
                    )}
                    <textarea
                      value={current?.value || ''}
                      onChange={e => handleAnswer(q.id, e.target.value, 'text')}
                      placeholder="// Write your solution here"
                      aria-label="Your code"
                      spellCheck={false}
                      rows={12}
                      className="w-full bg-transparent px-5 py-4 text-[13px] font-mono text-[#0e3445] placeholder:text-ink-4 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                )}

                <ConfidenceCheckIn value={current?.confidence} disabled={!isAnswered(current)} onChange={level => handleConfidence(q.id, level)} />

                {!!q.hints?.length && (
                  <details className="group mt-3 rounded-2xl bg-white/70">
                    <summary className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-[#0e3445] cursor-pointer list-none">
                      <span className="inline-flex items-center gap-2"><Lightbulb size={15} className="text-[#2a6f87]" /> Need a hint?</span>
                      <ChevronDown size={15} className="text-ink-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="px-4 pb-4 space-y-2">
                      {q.hints.map((hint, i) => (
                        <li key={i} className="flex gap-3 text-sm text-ink-2 leading-relaxed">
                          <span className="grid place-items-center h-5 w-5 shrink-0 rounded-full bg-[#e6eef2] text-[10px] text-[#1b566b] tabular mt-0.5">{i + 1}</span>
                          {hint}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Previous / next */}
        <div className="shrink-0 border-t border-[#dbe7ec] bg-white/60 backdrop-blur">
          <div className="max-w-[46rem] mx-auto px-8 h-[72px] flex items-center justify-between">
            <button type="button" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white text-sm text-[#0e3445] border border-[#dbe7ec] hover:border-[#8fbccb] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
              <ArrowLeft size={14} /> Previous
            </button>
            <span className="text-xs text-ink-3 tabular">{idx + 1} / {total}</span>
            {last ? (
              <button type="button" onClick={() => setShowConfirmSubmit(true)}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#0e3445] text-sm text-white hover:bg-[#1b566b] transition-colors cursor-pointer">
                Review and hand in <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" onClick={() => setIdx(idx + 1)}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-full bg-[#0e3445] text-sm text-white hover:bg-[#1b566b] transition-colors cursor-pointer">
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Confirm hand-in */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4 bg-[#0e3445]/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="handin-title">
          <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-[0_30px_80px_-30px_rgba(14,52,69,0.6)]">
            <h3 id="handin-title" className="font-display text-[1.5rem] tracking-[-0.02em] text-[#0e3445]">Hand in your test?</h3>
            <p className="mt-1.5 text-sm text-ink-3">
              You answered <span className="text-[#0e3445]">{answered} of {total}</span>. You can't change answers after this.
            </p>

            {unanswered.length > 0 && (
              <div className="mt-4 rounded-2xl p-3.5" style={{ background: CLAY.wash }}>
                <p className="text-xs" style={{ color: CLAY.ink }}>{plural(unanswered.length, 'question')} still blank. Tap one to go back:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {unanswered.map(i => (
                    <button key={i} type="button" onClick={() => { setIdx(i); setShowConfirmSubmit(false); }}
                      className="grid place-items-center h-8 w-8 rounded-full bg-white text-xs tabular cursor-pointer hover:ring-2 hover:ring-[#c9957f]/50" style={{ color: CLAY.ink }}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 h-11 rounded-full border border-[#dbe7ec] text-sm text-[#0e3445] hover:border-[#8fbccb] transition-colors cursor-pointer">
                Keep working
              </button>
              <button type="button" onClick={handleSubmitTest} disabled={isSubmitting}
                className="flex-1 h-11 rounded-full bg-[#0e3445] text-sm text-white hover:bg-[#1b566b] disabled:opacity-60 transition-colors cursor-pointer inline-flex items-center justify-center gap-2">
                {isSubmitting ? <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : 'Hand in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
