import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  Clock, CheckCircle, AlertCircle, Send, Save, ArrowLeft,
  AlertTriangle, Sparkles
} from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

export default function TakeTest() {
  const navigate = useNavigate();
  const { testId } = useParams();
  const { token } = useAuthStore();

  const [test, setTest] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
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
      const startRes = await axios.post(
        `${API_URL}/api/tests/${testId}/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setTest(startRes.data.test);
      setAttempt(startRes.data.attempt);
      setTimeLeft(startRes.data.test.duration_minutes * 60);
    } catch (err) {
      console.error('Failed to start test:', err);
      navigate(-1);
    }
  };

  const handleAnswer = (questionId, value, type = 'text') => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: { value, type, time_spent: 0 }
    }));
  };

  const autoSaveProgress = async () => {
    // Could implement auto-save endpoint here
    console.log('Auto-saving progress...');
  };

  const handleSubmitTest = async () => {
    setIsSubmitting(true);
    
    try {
      const formattedAnswers = Object.entries(answers).map(([questionId, ans]) => ({
        question_id: questionId,
        answer_type: ans.type,
        answer_text: ans.type === 'text' ? ans.value : null,
        selected_option_id: ans.type === 'option' ? ans.value : null,
        time_spent_seconds: ans.time_spent || 0
      }));

      const res = await axios.post(
        `${API_URL}/api/tests/attempt/${attempt.id}/submit`,
        {
          attempt_id: attempt.id,
          answers: formattedAnswers
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Show results
      navigate(`/tests/${testId}/result/${attempt.id}`);
    } catch (err) {
      console.error('Failed to submit test:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentQuestion = test?.questions?.[currentQuestionIdx];

  if (!test || !attempt) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-white/40">Loading test...</div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = test.questions?.length || 0;
  const progress = (answeredCount / totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 bg-[#0A0A0A]/95 backdrop-blur border-b border-white/[0.06] z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold text-white">{test.title}</h1>
                <p className="text-xs text-white/30">{answeredCount} of {totalQuestions} answered</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Progress Bar */}
              <div className="w-32">
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Timer */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
                timeLeft < 300 ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/60'
              }`}>
                <Clock className="w-4 h-4" />
                <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Question Content */}
      <div className="pt-24 pb-32">
        <div className="max-w-3xl mx-auto px-6">
          {currentQuestion && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-8">
              {/* Question Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="text-xs font-semibold text-[var(--accent)] mb-2 block">
                    Question {currentQuestionIdx + 1} of {totalQuestions}
                  </span>
                  <h2 className="text-xl font-semibold text-white leading-relaxed">
                    {currentQuestion.question_text}
                  </h2>
                </div>
                <div className="text-right">
                  <span className="text-xs text-white/30 block">{currentQuestion.type.toUpperCase()}</span>
                  <span className="text-sm font-bold text-white/60">{currentQuestion.marks} marks</span>
                </div>
              </div>

              {/* Question Input */}
              <div className="mt-8">
                {currentQuestion.type === 'mcq' && (
                  <div className="space-y-3">
                    {currentQuestion.options?.map((option) => {
                      const isSelected = answers[currentQuestion.id]?.value === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleAnswer(currentQuestion.id, option.id, 'option')}
                          className={`w-full p-4 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-blue-500/20 border-blue-500/50 text-white'
                              : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-blue-400' : 'border-white/20'
                            }`}>
                              {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />}
                            </div>
                            <span>{option.text}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQuestion.type === 'true_false' && (
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleAnswer(currentQuestion.id, 'true', 'option')}
                      className={`p-6 rounded-xl border text-center font-semibold transition-all ${
                        answers[currentQuestion.id]?.value === 'true'
                          ? 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]'
                      }`}
                    >
                      True
                    </button>
                    <button
                      onClick={() => handleAnswer(currentQuestion.id, 'false', 'option')}
                      className={`p-6 rounded-xl border text-center font-semibold transition-all ${
                        answers[currentQuestion.id]?.value === 'false'
                          ? 'bg-red-500/20 border-red-500/50 text-red-400'
                          : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]'
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
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none transition-colors"
                  />
                )}

                {currentQuestion.type === 'code' && (
                  <div>
                    {currentQuestion.starter_code && (
                      <pre className="bg-black/40 border border-white/10 rounded-lg p-4 mb-4 text-sm text-white/60 overflow-x-auto">
                        {currentQuestion.starter_code}
                      </pre>
                    )}
                    <textarea
                      value={answers[currentQuestion.id]?.value || ''}
                      onChange={(e) => handleAnswer(currentQuestion.id, e.target.value, 'text')}
                      placeholder="// Write your code here..."
                      rows={10}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 font-mono resize-none transition-colors"
                    />
                  </div>
                )}
              </div>

              {/* Hints */}
              {currentQuestion.hints?.length > 0 && (
                <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium mb-2">
                    <Sparkles className="w-4 h-4" />
                    Hints
                  </div>
                  <ul className="space-y-1">
                    {currentQuestion.hints.map((hint, idx) => (
                      <li key={idx} className="text-xs text-yellow-300/70">• {hint}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A0A0A]/95 backdrop-blur border-t border-white/[0.06] z-40">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
              disabled={currentQuestionIdx === 0}
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white rounded-xl font-medium transition-all"
            >
              Previous
            </button>

            {/* Question Navigator */}
            <div className="flex gap-2">
              {test.questions?.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentQuestionIdx(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
                    idx === currentQuestionIdx
                      ? 'bg-[var(--accent)] text-white'
                      : answers[test.questions[idx].id]
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-white/5 text-white/30 hover:bg-white/10'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>

            {currentQuestionIdx < totalQuestions - 1 ? (
              <button
                onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold transition-all"
              >
                Submit Test
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Submit Test?</h3>
              <p className="text-white/40 text-sm">
                You've answered {answeredCount} of {totalQuestions} questions.
                {answeredCount < totalQuestions && ' Some questions are still unanswered.'}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
              >
                Continue Test
              </button>
              <button
                onClick={handleSubmitTest}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  'Submitting...'
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit
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
