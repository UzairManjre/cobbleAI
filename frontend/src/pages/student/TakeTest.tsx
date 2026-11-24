import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Clock, ArrowLeft,
  AlertTriangle, Sparkles,
  ChevronLeft, ChevronRight, CheckCircle2
} from 'lucide-react';
import { testsApi } from '../../api';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';
import { answersFromAttempt, formatAnswers, remainingSeconds } from '../../utils/testAnswers';
import ConfidenceCheckIn from '../../components/tests/ConfidenceCheckIn';

const DEBOUNCE_MS = 2000;    // wait 2 s of inactivity before auto-saving
const FLUSH_MS   = 30_000;   // force a save at most every 30 s regardless

export default function TakeTest() {
  const navigate = useNavigate();
  const { testId } = useParams();

  const [test, setTest] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);

  // ── Stable refs ──────────────────────────────────────────────────────────
  // answersRef mirrors the answers state so the interval / debounce callbacks
  // can always read the latest snapshot without becoming stale closures or
  // triggering interval re-creation.
  const answersRef   = useRef<Record<string, any>>({});
  const attemptRef   = useRef<any>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<number>(0);
  const startedForRef = useRef<string | undefined>(undefined);

  // Keep refs in sync with state on every render (cheap assignment)
  answersRef.current = answers;
  attemptRef.current = attempt;

  useEffect(() => {
    startTest();
  }, [testId]);

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleSubmitTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // ── Stable auto-save interval ─────────────────────────────────────────────
  // Mounted ONCE (empty dep array). Reads from answersRef so it always sees
  // the latest answers without the interval ever being torn down and recreated.
  useEffect(() => {
    const flush = setInterval(() => {
      const now = Date.now();
      const hasAnswers = Object.keys(answersRef.current).length > 0;
      const cooldownElapsed = now - lastSavedRef.current >= FLUSH_MS;
      if (hasAnswers && cooldownElapsed) {
        doAutoSave();
      }
    }, FLUSH_MS);
    return () => clearInterval(flush);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core save function ───────────────────────────────────────────────────
  const doAutoSave = useCallback(async () => {
    const currentAttempt = attemptRef.current;
    const currentAnswers = answersRef.current;
    if (!currentAttempt || Object.keys(currentAnswers).length === 0) return;

    lastSavedRef.current = Date.now();
    try {
      await testsApi.submit(currentAttempt.id, formatAnswers(currentAnswers), true /* is_auto_save */);
    } catch (err) {
      // Auto-save failures are non-fatal — silently log
      console.warn('Auto-save failed:', err);
    }
  }, []);

  // ── Debounced save triggered on each answer change ───────────────────────
  // Cancels any pending save and schedules a fresh one DEBOUNCE_MS later.
  // The interval above provides the safety-net flush.
  const scheduleDebouncedSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      doAutoSave();
    }, DEBOUNCE_MS);
  }, [doAutoSave]);

  const startTest = async () => {
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
      const response = (err as { response?: { status?: number; data?: { detail?: string } } }).response;
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
  };

  const handleAnswer = (questionId: string, value: any, type: string = 'text') => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], value, type, time_spent: 0 }
    }));
    // Schedule a debounced save after the answer changes
    scheduleDebouncedSave();
  };

  const handleConfidence = (questionId: string, confidence: number) => {
    setAnswers(prev => prev[questionId] ? { ...prev, [questionId]: { ...prev[questionId], confidence } } : prev);
    scheduleDebouncedSave();
  };

  const handleSubmitTest = async () => {
    if (!attempt) return;
    // Cancel any pending debounced save before the final submit
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setIsSubmitting(true);

    try {
      await testsApi.submit(attempt.id, formatAnswers(answersRef.current));
      navigate(`/tests/${testId}/result/${attempt.id}`);
    } catch (err) {
      console.error('Failed to submit test:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQuestion = test?.questions?.[currentQuestionIdx];

  if (!test || !attempt) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-ink-3">
        <div className="w-8 h-8 border-2 border-line border-t-white rounded-full animate-spin mb-4" />
        <div className="text-sm tracking-wide font-medium">Loading Assessment...</div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = test.questions?.length || 0;
  const progress = (answeredCount / totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-[#222] selection:text-ink pb-32">
      
      {/* Top Progress Indicator */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-sunken-2 z-50">
        <div 
          className="h-full bg-accent transition-all duration-300 ease-out" 
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Floating Header */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-40">
        <div className="bg-surface/90 backdrop-blur-xl border border-line rounded-2xl px-6 py-4 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="text-ink-3 hover:text-ink transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-sunken-2" />
            <div>
              <h1 className="text-sm font-medium tracking-wide text-ink">{test.title}</h1>
              <p className="text-xs text-ink-3 tracking-wide mt-0.5">{answeredCount} of {totalQuestions} Completed</p>
            </div>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-mono tracking-wider transition-colors ${
            timeLeft < 300 
              ? 'bg-red-500/10 border-red-500/30 text-red-600' 
              : 'bg-sunken border-line text-ink-3'
          }`}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-3xl mx-auto px-6 pt-36">
        {currentQuestion && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Question Header */}
            <div className="mb-10 flex items-start gap-6">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-surface border border-line flex items-center justify-center text-sm font-outfit text-ink-3">
                {currentQuestionIdx + 1}
              </div>
              <div className="pt-1">
                <div className="flex items-center gap-3 mb-3 text-xs tracking-wider">
                  <span className="text-ink-3 uppercase bg-sunken px-2 py-1 rounded-md">{currentQuestion.type.replace('_', ' ')}</span>
                  <span className="text-ink-3">{currentQuestion.marks} Pts</span>
                </div>
                <h2 className="text-2xl font-light text-ink leading-snug">
                  {currentQuestion.question_text}
                </h2>
              </div>
            </div>

            {/* Answer Section */}
            <div className="pl-18 ml-18">
              
              {/* Multiple Choice */}
              {currentQuestion.type === 'mcq' && (
                <div className="space-y-3" role="radiogroup" aria-label="Multiple choice options">
                  {currentQuestion.options?.map((option: any) => {
                    const isSelected = answers[currentQuestion.id]?.value === option.id;
                    return (
                      <button
                        key={option.id}
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => handleAnswer(currentQuestion.id, option.id, 'option')}
                        className={`w-full text-left p-5 rounded-xl border transition-all duration-200 flex items-center gap-4 ${
                          isSelected 
                            ? 'bg-accent text-white border-accent' 
                            : 'bg-surface border-line text-ink-3 hover:border-line-strong hover:text-ink'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-black' : 'border-line-strong'
                        }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-canvas" />}
                        </div>
                        <span className="text-[15px] font-medium leading-relaxed">{option.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* True / False */}
              {currentQuestion.type === 'true_false' && (
                <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="True or False options">
                  <button
                    role="radio"
                    aria-checked={answers[currentQuestion.id]?.value === 'true'}
                    onClick={() => handleAnswer(currentQuestion.id, 'true', 'option')}
                    className={`p-6 rounded-xl border transition-all flex items-center justify-center gap-3 ${
                      answers[currentQuestion.id]?.value === 'true'
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface border-line text-ink-3 hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    <span className="text-lg font-medium">True</span>
                  </button>
                  <button
                    role="radio"
                    aria-checked={answers[currentQuestion.id]?.value === 'false'}
                    onClick={() => handleAnswer(currentQuestion.id, 'false', 'option')}
                    className={`p-6 rounded-xl border transition-all flex items-center justify-center gap-3 ${
                      answers[currentQuestion.id]?.value === 'false'
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface border-line text-ink-3 hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    <span className="text-lg font-medium">False</span>
                  </button>
                </div>
              )}

              {/* Free Text */}
              {(currentQuestion.type === 'short_answer' || currentQuestion.type === 'essay') && (
                <textarea
                  value={answers[currentQuestion.id]?.value || ''}
                  onChange={(e) => handleAnswer(currentQuestion.id, e.target.value, 'text')}
                  placeholder="Type your answer..."
                  rows={6}
                  className="w-full bg-surface border border-line rounded-xl px-5 py-4 text-[15px] text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
                />
              )}

              {/* Code Input */}
              {currentQuestion.type === 'code' && (
                <div>
                  {currentQuestion.starter_code && (
                    <div className="bg-sunken border border-line rounded-t-xl p-4 border-b-0">
                      <pre className="text-[13px] font-mono text-ink-3 overflow-x-auto">
                        {currentQuestion.starter_code}
                      </pre>
                    </div>
                  )}
                  <textarea
                    value={answers[currentQuestion.id]?.value || ''}
                    onChange={(e) => handleAnswer(currentQuestion.id, e.target.value, 'text')}
                    placeholder="// Write your code solution here..."
                    spellCheck={false}
                    rows={12}
                    className={`w-full bg-surface border border-line px-5 py-4 text-[13px] font-mono text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed ${
                      currentQuestion.starter_code ? 'rounded-b-xl' : 'rounded-xl'
                    }`}
                  />
                </div>
              )}

              {/* Confidence check-in, before any result is shown */}
              <ConfidenceCheckIn
                value={answers[currentQuestion.id]?.confidence}
                disabled={!answers[currentQuestion.id]?.value}
                onChange={(level) => handleConfidence(currentQuestion.id, level)}
              />

              {/* Hints */}
              {currentQuestion.hints?.length > 0 && (
                <div className="mt-8 p-5 bg-surface border border-line rounded-xl">
                  <div className="flex items-center gap-2 text-ink-3 text-xs font-bold mb-3 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    Hints
                  </div>
                  <ul className="space-y-3">
                    {currentQuestion.hints.map((hint: any, idx: number) => (
                      <li key={idx} className="text-[14px] text-ink-3 flex gap-3 leading-relaxed">
                        <span className="text-ink-4 mt-1">—</span> {hint}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Navigator */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-40">
        <div className="bg-surface/90 backdrop-blur-xl border border-line rounded-full p-2 flex items-center justify-between shadow-2xl">
          
          <button
            onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
            disabled={currentQuestionIdx === 0}
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-sunken-2 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex gap-1 overflow-x-auto hide-scrollbar px-2 max-w-[280px]">
            {test.questions?.map((_: any, idx: number) => {
              const isAnswered = answers[test.questions[idx].id];
              const isActive = idx === currentQuestionIdx;
              
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentQuestionIdx(idx)}
                  className={`w-8 h-8 shrink-0 rounded-full text-xs font-medium transition-all flex items-center justify-center ${
                    isActive 
                      ? 'bg-accent text-white' 
                      : isAnswered
                        ? 'bg-sunken-2 text-ink hover:bg-sunken-2'
                        : 'text-ink-3 hover:text-ink-3 hover:bg-sunken'
                  }`}
                >
                  {isAnswered && !isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                </button>
              );
            })}
          </div>

          {currentQuestionIdx < totalQuestions - 1 ? (
            <button
              onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-sunken-2 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="px-4 h-10 rounded-full bg-accent hover:bg-accent-strong text-white text-sm font-medium transition-all flex items-center gap-2 mr-1"
            >
              Submit
            </button>
          )}

        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-sunken border border-line rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-7 h-7 text-ink-3" />
              </div>
              <h3 className="text-xl font-outfit text-ink mb-2">Submit Assessment?</h3>
              <p className="text-ink-3 text-sm leading-relaxed">
                You've completed <span className="text-ink font-medium">{answeredCount}</span> of <span className="text-ink font-medium">{totalQuestions}</span> questions.
                {answeredCount < totalQuestions && ' Some answers are blank.'}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmitTest}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-accent hover:bg-accent-strong text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>Submit Final Answers</>
                )}
              </button>
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="w-full py-3.5 bg-transparent hover:bg-sunken text-ink-3 hover:text-ink rounded-xl text-sm font-medium transition-all"
              >
                Return to Assessment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
