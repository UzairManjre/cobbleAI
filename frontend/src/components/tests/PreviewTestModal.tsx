import { CheckCircle2, X } from "lucide-react";
import { QuestionGradingMeta } from "./QuestionGradingMeta";

interface PreviewOption {
  id: string;
  text: string;
  is_correct?: boolean;
}

interface PreviewQuestion {
  id: string;
  type: string;
  question_text: string;
  difficulty?: string;
  marks?: number;
  topic?: string | null;
  cognitive_level?: string | null;
  rubric?: string[] | null;
  options?: PreviewOption[];
  correct_answer?: boolean | string | null;
  explanation?: string | null;
}

export interface PreviewTest {
  id: string;
  title: string;
  duration_minutes: number;
  total_marks?: number;
  questions?: PreviewQuestion[];
}

interface PreviewTestModalProps {
  previewTest: PreviewTest;
  onClose: () => void;
  /** Show the Bloom-level and rubric editor (professors) */
  editable?: boolean;
}

const TYPE_LABEL: Record<string, string> = { mcq: "Multiple choice", true_false: "True / false", short_answer: "Short answer", essay: "Essay", code: "Code" };

export function PreviewTestModal({ previewTest, onClose, editable = false }: PreviewTestModalProps) {
  if (!previewTest) return null;
  const questions = previewTest.questions || [];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Test preview">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="px-7 py-5 border-b border-[#1A1A1A] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[#666666]">{editable ? "Review questions" : "Preview"}</p>
            <h2 className="text-xl font-outfit font-medium text-white mt-1 truncate">{previewTest.title}</h2>
            <p className="text-xs text-[#888888] mt-1">
              {questions.length} question{questions.length === 1 ? "" : "s"} · {previewTest.total_marks || 0} marks · {previewTest.duration_minutes} min
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-[#888888] hover:text-white hover:bg-[#111111]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {questions.length === 0 ? (
            <p className="text-sm text-[#888888] text-center py-12">No questions yet. Generate them from the test card.</p>
          ) : (
            <ol className="space-y-4">
              {questions.map((q, idx) => (
                <li key={q.id} className="p-5 rounded-xl border border-[#1A1A1A] bg-[#0D0D0D]">
                  <div className="flex items-start gap-4">
                    <span className="w-7 h-7 rounded-lg bg-[#151515] border border-[#262626] flex items-center justify-center text-xs text-white shrink-0 tabular-nums">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-relaxed">{q.question_text}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded-md border border-purple-500/25 bg-purple-500/10 text-purple-300">{TYPE_LABEL[q.type] || q.type}</span>
                        {q.difficulty && <span className="px-2 py-0.5 rounded-md border border-[#262626] bg-[#111111] text-[#AAAAAA]">{q.difficulty}</span>}
                        <span className="text-[#888888]">{q.marks ?? 0} marks</span>
                        {q.topic && <span className="text-[#666666]">· {q.topic}</span>}
                        {!editable && q.cognitive_level && <span className="text-[#666666]">· {q.cognitive_level}</span>}
                      </div>

                      {q.type === "mcq" && q.options && (
                        <div className="mt-4 space-y-1.5">
                          {q.options.map(opt => (
                            <div key={opt.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm ${
                              opt.is_correct ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-[#1A1A1A] text-[#CCCCCC]"
                            }`}>
                              {opt.is_correct
                                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                : <span className="w-4 h-4 rounded-full border border-[#444444] shrink-0" />}
                              {opt.text}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === "true_false" && (
                        <div className="mt-4 flex gap-2">
                          {[true, false].map(value => (
                            <span key={String(value)} className={`px-3 py-1.5 rounded-lg border text-sm ${
                              q.correct_answer === value ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100" : "border-[#1A1A1A] text-[#666666]"
                            }`}>
                              {value ? "True" : "False"}
                            </span>
                          ))}
                        </div>
                      )}

                      {q.explanation && (
                        <div className="mt-4 p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                          <p className="text-[10px] uppercase tracking-widest text-blue-300/80 mb-1">Explanation</p>
                          <p className="text-sm text-[#CCCCCC] leading-relaxed">{q.explanation}</p>
                        </div>
                      )}

                      {editable && <QuestionGradingMeta testId={previewTest.id} question={q} />}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
