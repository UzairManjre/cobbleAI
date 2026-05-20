import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Clock, Send, ArrowLeft,
  AlertTriangle, Sparkles
} from 'lucide-react';
import { testsApi } from '../api';

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

  useEffect(() => {
    startTest();
  }, [testId]);

  // Timer
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

  // Auto-save every 30 seconds
  useEffect(() => {
    const autoSave = setInterval(() => {
      if (Object.keys(answers).length > 0) {
        autoSaveProgress();
      }
    }, 30000);

    return () => clearInterval(autoSave);
  }, [answers]);

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
  };

  const autoSaveProgress = async () => {
    console.log('Auto-saving progress...');
  };

  const handleSubmitTest = async () => {
    if (!attempt) return;
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
      <div className="min-h-screen bg-[#FCFCFC] flex items-center justify-center">
        <div className="text-[#0A0A0A]/40 font-bold font-['Outfit']">Loading test...</div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = test.questions?.length || 0;
  const progress = (answeredCount / totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-[#FCFCFC] text-[#0A0A0A] selection:bg-[#ff5c5c] selection:text-white">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 bg-[#FCFCFC]/95 backdrop-blur-md border-b-[3px] border-[#0A0A0A] z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="text-[#0A0A0A]/60 hover:text-[#0A0A0A] transition-colors"
              >
                <ArrowLeft className="w-6 h-6 stroke-[3px]" />
              </button>
              <div>
                <h1 className="text-xl font-extrabold text-[#0A0A0A] font-['Outfit']">{test.title}</h1>
                <p className="text-sm font-bold text-[#0A0A0A]/50">{answeredCount} of {totalQuestions} answered</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Progress Bar */}
              <div className="w-32 hidden sm:block">
                <div className="h-2.5 bg-gray-200 border-2 border-[#0A0A0A] rounded-full overflow-hidden shadow-[2px_2px_0_#0A0A0A]">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${progress}%`, background: '#FF4D5B' }}
                  />
                </div>
              </div>

              {/* Timer */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 shadow-[2px_2px_0_#0A0A0A] font-bold ${
                timeLeft < 300 ? 'bg-red-50 border-red-500 text-red-600 shadow-[2px_2px_0_#EF4444]' : 'bg-white border-[#0A0A0A] text-[#0A0A0A]'
              }`}>
                <Clock className="w-5 h-5 stroke-[2.5px]" />
                <span className="font-mono text-lg">{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question Content */}
      <div className="pt-28 pb-40">
        <div className="max-w-3xl mx-auto px-6">
          {currentQuestion && (
            <div className="rounded-2xl p-8 bg-white border-[3px] border-[#0A0A0A] shadow-[8px_8px_0_#0A0A0A] transition-all">
              {/* Question Header */}
              <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-gray-100">
                <div>
                  <span className="text-sm font-extrabold mb-3 block uppercase tracking-wider" style={{ color: '#FF4D5B', fontFamily: "'Outfit', sans-serif" }}>
                    QUESTION {currentQuestionIdx + 1} OF {totalQuestions}
                  </span>
                  <h2 className="text-2xl font-bold text-[#0A0A0A] leading-relaxed" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {currentQuestion.question_text}
                  </h2>
                </div>
                <div className="text-right shrink-0 ml-6">
                  <span className="text-xs font-bold text-[#0A0A0A]/40 block mb-1 uppercase bg-gray-100 px-2 py-1 rounded-md border-2 border-transparent">{currentQuestion.type}</span>
                  <span className="text-sm font-extrabold text-[#0A0A0A] bg-yellow-100 border-2 border-yellow-400 px-2 py-1 rounded-md">{currentQuestion.marks} marks</span>
                </div>
              </div>

              {/* Question Input */}
              <div className="mt-4">
                {currentQuestion.type === 'mcq' && (
                  <div className="space-y-4">
                    {currentQuestion.options?.map((option: any) => {
                      const isSelected = answers[currentQuestion.id]?.value === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleAnswer(currentQuestion.id, option.id, 'option')}
                          className={`w-full p-5 rounded-xl border-[3px] text-left transition-all font-bold text-[#0A0A0A] flex items-center gap-4 ${
                            isSelected
                              ? 'bg-[#FF4D5B]/10 border-[#FF4D5B] shadow-[4px_4px_0_#FF4D5B] -translate-y-1 -translate-x-1'
                              : 'bg-white border-[#0A0A0A] hover:bg-gray-50 hover:-translate-y-0.5 hover:-translate-x-0.5 shadow-[2px_2px_0_#0A0A0A]'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-[#FF4D5B]' : 'border-[#0A0A0A]/30'
                          }`}>
                            {isSelected && <div className="w-3 h-3 rounded-full bg-[#FF4D5B]" />}
                          </div>
                          <span className="text-lg" style={{ fontFamily: "'Inter', sans-serif" }}>{option.text}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-6">
                    <button
                      onClick={() => handleAnswer(currentQuestion.id, 'true', 'option')}
                      className={`p-6 rounded-xl border-[3px] text-center font-extrabold text-xl transition-all ${
                        answers[currentQuestion.id]?.value === 'true'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-[4px_4px_0_#10B981] -translate-y-1 -translate-x-1'
                          : 'bg-white border-[#0A0A0A] text-[#0A0A0A] hover:bg-gray-50 shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:-translate-x-0.5'
                      }`}
                    >
                      True
                    </button>
                    <button
                      onClick={() => handleAnswer(currentQuestion.id, 'false', 'option')}
                      className={`p-6 rounded-xl border-[3px] text-center font-extrabold text-xl transition-all ${
                        answers[currentQuestion.id]?.value === 'false'
                          ? 'bg-red-50 border-red-500 text-red-700 shadow-[4px_4px_0_#EF4444] -translate-y-1 -translate-x-1'
                          : 'bg-white border-[#0A0A0A] text-[#0A0A0A] hover:bg-gray-50 shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:-translate-x-0.5'
                      }`}
                    >
                      False
                    </button>
                  </div>
                )}

                {(currentQuestion.type === 'short_answer' || currentQuestion.type === 'essay') && (
                    <textarea
                    value={answers[currentQuestion.id]?.value || ''}
                    onChange={(e) => handleAnswer(currentQuestion.id, e.target.value, 'text')}
                    placeholder="Type your answer here..."
                    rows={8}
                    className="w-full bg-white border-[3px] border-[#0A0A0A] rounded-xl px-5 py-4 text-base font-medium text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none focus:border-[#FF4D5B] focus:shadow-[4px_4px_0_#FF4D5B] shadow-[2px_2px_0_#0A0A0A] resize-none transition-all"
                  />
                )}

                {currentQuestion.type === 'code' && (
                  <div>
                    {currentQuestion.starter_code && (
                      <pre className="bg-[#f0f0f0] border-2 border-[#0A0A0A] rounded-xl p-4 mb-4 text-sm font-bold text-[#0A0A0A] overflow-x-auto shadow-sm">
                        {currentQuestion.starter_code}
                      </pre>
                    )}
                    <textarea
                      value={answers[currentQuestion.id]?.value || ''}
                      onChange={(e) => handleAnswer(currentQuestion.id, e.target.value, 'text')}
                      placeholder="// Write your code here..."
                      rows={10}
                      className="w-full bg-white border-[3px] border-[#0A0A0A] rounded-xl px-5 py-4 text-base font-mono font-bold text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none focus:border-[#FF4D5B] focus:shadow-[4px_4px_0_#FF4D5B] shadow-[2px_2px_0_#0A0A0A] resize-none transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Hints */}
              {currentQuestion.hints?.length > 0 && (
                <div className="mt-8 p-5 bg-amber-50 border-[3px] border-amber-400 rounded-xl shadow-[4px_4px_0_#FBBF24]">
                  <div className="flex items-center gap-2 text-amber-600 text-sm font-extrabold mb-3 uppercase tracking-wide">
                    <Sparkles className="w-5 h-5 fill-amber-400" />
                    Helpful Hints
                  </div>
                  <ul className="space-y-2">
                    {currentQuestion.hints.map((hint: any, idx: number) => (
                      <li key={idx} className="text-sm font-semibold text-amber-900 flex gap-2">
                        <span className="text-amber-500">•</span> {hint}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#FCFCFC]/95 backdrop-blur-md border-t-[3px] border-[#0A0A0A] z-40 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
              disabled={currentQuestionIdx === 0}
              className="px-6 py-3 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3px]" />
              Previous
            </button>

            {/* Question Navigator */}
            <div className="flex gap-2 overflow-x-auto px-4 hide-scrollbar">
              {test.questions?.map((_: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setCurrentQuestionIdx(idx)}
                  className={`w-10 h-10 shrink-0 rounded-xl text-sm font-extrabold border-2 transition-all flex items-center justify-center ${
                    idx === currentQuestionIdx
                      ? 'bg-[#FF4D5B] border-[#0A0A0A] text-white shadow-[2px_2px_0_#0A0A0A] -translate-y-0.5'
                      : answers[test.questions[idx].id]
                      ? 'bg-emerald-100 border-emerald-500 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-white border-[#0A0A0A]/30 text-[#0A0A0A]/50 hover:bg-gray-100 hover:border-[#0A0A0A]'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            {currentQuestionIdx < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                className="px-8 py-3 bg-white hover:bg-gray-50 text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
              >
                Next Step
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="px-8 py-3 bg-[#FF4D5B] hover:bg-[#ff3344] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0.5 active:shadow-[2px_2px_0_#0A0A0A] transition-all flex items-center gap-2"
              >
                Submit Test
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#FCFCFC] border-[3px] border-[#0A0A0A] rounded-2xl p-8 max-w-md w-full shadow-[12px_12px_0_rgba(0,0,0,0.95)] animate-in zoom-in-95 duration-200">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-amber-100 border-[3px] border-amber-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[4px_4px_0_#FBBF24]">
                <AlertTriangle className="w-10 h-10 text-amber-500 stroke-[2.5px]" />
              </div>
              <h3 className="text-2xl font-extrabold text-[#0A0A0A] mb-3 font-['Outfit']">Ready to Submit?</h3>
              <p className="text-[#0A0A0A]/60 font-bold text-sm">
                You have answered <span className="text-[#0A0A0A]">{answeredCount}</span> out of <span className="text-[#0A0A0A]">{totalQuestions}</span> questions.
                {answeredCount < totalQuestions && ' Some questions are still blank.'}
              </p>
            </div>

            <div className="flex gap-4 font-['Outfit']">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-3.5 bg-white hover:bg-gray-50 text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none transition-all"
              >
                Keep Reviewing
              </button>
              <button
                onClick={handleSubmitTest}
                disabled={isSubmitting}
                className="flex-1 py-3.5 bg-[#FF4D5B] hover:bg-[#ff3344] disabled:opacity-50 text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  'Submitting...'
                ) : (
                  <>
                    <Send className="w-5 h-5 stroke-[2.5px]" />
                    Submit Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
