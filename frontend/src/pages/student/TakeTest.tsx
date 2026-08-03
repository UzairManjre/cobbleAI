import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Clock, Send, ArrowLeft,
  AlertTriangle, Sparkles,
  ChevronLeft, ChevronRight, CheckCircle2
} from 'lucide-react';
import { testsApi } from '../../api';

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
      const formattedAnswers = Object.entries(currentAnswers).map(
        ([questionId, ans]: [string, any]) => ({
          question_id: questionId,
          answer_type: ans.type,
          answer_text: ans.type === 'text' ? ans.value : null,
          selected_option_id: ans.type === 'option' ? ans.value : null,
          time_spent_seconds: ans.time_spent || 0,
        })
      );
      await testsApi.submit(currentAttempt.id, formattedAnswers, true /* is_auto_save */);
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
    try {
      const startRes = await testsApi.start(testId || '');
      setTest(startRes.data.test);
      setAttempt(startRes.data.attempt);
      setTimeLeft(startRes.data.test.duration_minutes * 60);
    } catch (err) {
      console.error('Failed to start test:', err);
      navigate(-1);
    }
  };

  const handleAnswer = (questionId: string, value: any, type: string = 'text') => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { value, type, time_spent: 0 }
    }));
    // Schedule a debounced save after the answer changes
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
      const formattedAnswers = Object.entries(answers).map(([questionId, ans]: [string, any]) => ({
        question_id: questionId,
        answer_type: ans.type,
        answer_text: ans.type === 'text' ? ans.value : null,
        selected_option_id: ans.type === 'option' ? ans.value : null,
        time_spent_seconds: ans.time_spent || 0
      }));

      await testsApi.submit(attempt.id, formattedAnswers);
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-[#888888]">
        <div className="w-8 h-8 border-2 border-[#1A1A1A] border-t-white rounded-full animate-spin mb-4" />
        <div className="text-sm tracking-wide font-medium">Loading Assessment...</div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = test.questions?.length || 0;
  const progress = (answeredCount / totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#222] selection:text-white pb-32">
      
      {/* Top Progress Indicator */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-[#1A1A1A] z-50">
        <div 
          className="h-full bg-white transition-all duration-300 ease-out" 
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Floating Header */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-40">
        <div className="bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#1A1A1A] rounded-2xl px-6 py-4 flex items-center justify-between shadow-2xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="text-[#888888] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="h-6 w-px bg-[#1A1A1A]" />
            <div>
              <h1 className="text-sm font-medium tracking-wide text-white">{test.title}</h1>
              <p className="text-xs text-[#A3A3A3] tracking-wide mt-0.5">{answeredCount} of {totalQuestions} Completed</p>
            </div>
          </div>
          
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-mono tracking-wider transition-colors ${
            timeLeft < 300 
              ? 'bg-red-500/10 border-red-500/30 text-red-400' 
              : 'bg-[#111111] border-[#222222] text-[#AAAAAA]'
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
              <div className="shrink-0 w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A] flex items-center justify-center text-sm font-outfit text-[#888888]">
                {currentQuestionIdx + 1}
              </div>
              <div className="pt-1">
                <div className="flex items-center gap-3 mb-3 text-xs tracking-wider">
                  <span className="text-[#A3A3A3] uppercase bg-[#111111] px-2 py-1 rounded-md">{currentQuestion.type.replace('_', ' ')}</span>
                  <span className="text-[#A3A3A3]">{currentQuestion.marks} Pts</span>
                </div>
                <h2 className="text-2xl font-light text-white leading-snug">
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
                            ? 'bg-white text-black border-white' 
                            : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#AAAAAA] hover:border-[#333333] hover:text-white'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-black' : 'border-[#333333]'
                        }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-black" />}
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
                        ? 'bg-white text-black border-white'
                        : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#AAAAAA] hover:border-[#333333] hover:text-white'
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
                        ? 'bg-white text-black border-white'
                        : 'bg-[#0A0A0A] border-[#1A1A1A] text-[#AAAAAA] hover:border-[#333333] hover:text-white'
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
                  className="w-full bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl px-5 py-4 text-[15px] text-white placeholder:text-[#444444] focus:outline-none focus:border-white transition-colors resize-none leading-relaxed"
                />
              )}

              {/* Code Input */}
              {currentQuestion.type === 'code' && (
                <div>
                  {currentQuestion.starter_code && (
                    <div className="bg-[#111111] border border-[#1A1A1A] rounded-t-xl p-4 border-b-0">
                      <pre className="text-[13px] font-mono text-[#888888] overflow-x-auto">
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
                    className={`w-full bg-[#050505] border border-[#1A1A1A] px-5 py-4 text-[13px] font-mono text-white placeholder:text-[#444444] focus:outline-none focus:border-white transition-colors resize-none leading-relaxed ${
                      currentQuestion.starter_code ? 'rounded-b-xl' : 'rounded-xl'
                    }`}
                  />
                </div>
              )}

              {/* Hints */}
              {currentQuestion.hints?.length > 0 && (
                <div className="mt-8 p-5 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl">
                  <div className="flex items-center gap-2 text-[#888888] text-xs font-bold mb-3 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    Hints
                  </div>
                  <ul className="space-y-3">
                    {currentQuestion.hints.map((hint: any, idx: number) => (
                      <li key={idx} className="text-[14px] text-[#AAAAAA] flex gap-3 leading-relaxed">
                        <span className="text-[#444444] mt-1">—</span> {hint}
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
        <div className="bg-[#0A0A0A]/90 backdrop-blur-xl border border-[#1A1A1A] rounded-full p-2 flex items-center justify-between shadow-2xl">
          
          <button
            onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
            disabled={currentQuestionIdx === 0}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#1A1A1A] disabled:opacity-30 disabled:hover:bg-transparent transition-all"
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
                      ? 'bg-white text-black' 
                      : isAnswered
                        ? 'bg-[#1A1A1A] text-white hover:bg-[#222222]'
                        : 'text-[#A3A3A3] hover:text-[#AAAAAA] hover:bg-[#111111]'
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
              className="w-10 h-10 rounded-full flex items-center justify-center text-[#888888] hover:text-white hover:bg-[#1A1A1A] transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="px-4 h-10 rounded-full bg-white hover:bg-gray-200 text-black text-sm font-medium transition-all flex items-center gap-2 mr-1"
            >
              Submit
            </button>
          )}

        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-3xl p-8 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#111111] border border-[#222222] rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-7 h-7 text-[#888888]" />
              </div>
              <h3 className="text-xl font-outfit text-white mb-2">Submit Assessment?</h3>
              <p className="text-[#888888] text-sm leading-relaxed">
                You've completed <span className="text-white font-medium">{answeredCount}</span> of <span className="text-white font-medium">{totalQuestions}</span> questions.
                {answeredCount < totalQuestions && ' Some answers are blank.'}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSubmitTest}
                disabled={isSubmitting}
                className="w-full py-3.5 bg-white hover:bg-gray-200 text-black rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>Submit Final Answers</>
                )}
              </button>
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="w-full py-3.5 bg-transparent hover:bg-[#111111] text-[#888888] hover:text-white rounded-xl text-sm font-medium transition-all"
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
