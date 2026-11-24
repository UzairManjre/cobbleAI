import { apiErrorDetail } from '../../utils/apiError';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { testsApi } from '../../api';
import CalibrationChart from '../../components/tests/CalibrationChart';

interface ResultOption {
  id: string;
  text: string;
  is_correct?: boolean;
}

interface ResultQuestion {
  id: string;
  type: string;
  question_text: string;
  marks: number;
  options?: ResultOption[];
  correct_answer?: boolean | null;
  explanation?: string | null;
}

interface ResultAnswer {
  question_id: string;
  answer_text?: string | null;
  selected_option_id?: string | null;
  is_correct?: boolean | null;
  marks_awarded?: number | null;
  feedback?: string | null;
}

interface ResultData {
  attempt: {
    id: string;
    course_id: string;
    status: string;
    total_marks_awarded: number;
    percentage: number;
    answers: ResultAnswer[];
  };
  test: {
    id: string;
    title: string;
    total_marks: number;
    passing_percentage: number;
    questions: ResultQuestion[];
  };
  revealed: boolean;
}

function studentAnswerText(q: ResultQuestion, a?: ResultAnswer): string {
  if (!a) return 'Not answered';
  if (a.selected_option_id) {
    return q.options?.find(o => o.id === a.selected_option_id)?.text || a.selected_option_id;
  }
  return a.answer_text || 'Not answered';
}

function correctAnswerText(q: ResultQuestion): string | null {
  if (q.type === 'mcq') return q.options?.find(o => o.is_correct)?.text || null;
  if (q.type === 'true_false' && q.correct_answer !== undefined && q.correct_answer !== null) {
    return q.correct_answer ? 'True' : 'False';
  }
  return null;
}

export default function TestResult() {
  const navigate = useNavigate();
  const { attemptId } = useParams();
  const [data, setData] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    testsApi.getResult(attemptId)
      .then(res => setData(res.data))
      .catch(err => setError(apiErrorDetail(err, 'Could not load your result.')));
  }, [attemptId]);

  if (error) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4 text-ink-3">
        <p className="text-sm">{error}</p>
        <button onClick={() => navigate('/assignments')} className="text-ink text-sm underline">Back to assignments</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-ink-3">
        <div className="w-8 h-8 border-2 border-line border-t-white rounded-full animate-spin mb-4" />
        <div className="text-sm tracking-wide font-medium">Loading Result...</div>
      </div>
    );
  }

  const { attempt, test, revealed } = data;
  const answersById = new Map(attempt.answers.map(a => [a.question_id, a]));
  const passed = attempt.percentage >= test.passing_percentage;

  return (
    <div className="min-h-screen bg-canvas text-ink pb-24">
      <div className="max-w-3xl mx-auto px-6 pt-12">
        <button
          onClick={() => navigate(`/courses/${attempt.course_id}/tests`)}
          className="flex items-center gap-2 text-sm text-ink-3 hover:text-ink transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to course tests
        </button>

        <h1 className="text-2xl font-light mb-2">{test.title}</h1>

        {!revealed ? (
          <div className="mt-8 bg-surface border border-line rounded-2xl p-8 flex items-start gap-4">
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-ink">Your answers have been submitted.</p>
              <p className="text-sm text-ink-3 mt-1">Results appear here once your instructor has reviewed them.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-ink-3">Score</p>
                <p className="text-2xl font-light mt-2">{attempt.total_marks_awarded} / {test.total_marks}</p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-ink-3">Percentage</p>
                <p className="text-2xl font-light mt-2">{Math.round(attempt.percentage)}%</p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-widest text-ink-3">Result</p>
                <p className={`text-2xl font-light mt-2 ${passed ? 'text-emerald-700' : 'text-red-600'}`}>{passed ? 'Passed' : 'Not passed'}</p>
              </div>
            </div>

            <div className="mt-10 space-y-4">
              {test.questions.map((q, idx) => {
                const a = answersById.get(q.id);
                const correct = correctAnswerText(q);
                return (
                  <div key={q.id} className="bg-surface border border-line rounded-2xl p-6">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-ink"><span className="text-ink-3 mr-2">{idx + 1}.</span>{q.question_text}</p>
                      {a?.is_correct === true && <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />}
                      {a?.is_correct === false && <XCircle className="w-5 h-5 text-red-600 shrink-0" />}
                    </div>
                    <p className="text-xs text-ink-3 mt-4">Your answer</p>
                    <p className="text-sm text-ink-2 mt-1 whitespace-pre-wrap">{studentAnswerText(q, a)}</p>
                    {correct && (
                      <>
                        <p className="text-xs text-ink-3 mt-3">Correct answer</p>
                        <p className="text-sm text-emerald-700 mt-1">{correct}</p>
                      </>
                    )}
                    {a?.feedback && <p className="text-sm text-ink-3 mt-3 italic">{a.feedback}</p>}
                    {q.explanation && <p className="text-xs text-ink-3 mt-3">{q.explanation}</p>}
                    <p className="text-[10px] uppercase tracking-widest text-ink-4 mt-4">
                      {a?.marks_awarded ?? 0} / {q.marks} pts
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10">
              <CalibrationChart courseId={attempt.course_id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
