import { Check, X } from "lucide-react";
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

const TYPE_LABEL: Record<string, string> = { mcq: "Multiple choice", true_false: "True or false", short_answer: "Short answer", essay: "Essay", code: "Code" };
const chip = "h-6 px-2.5 inline-flex items-center rounded-full text-[11px]";

/** The right answer: white with a teal outline and a tick. The others: plain. */
const Choice = ({ right, children }: { right: boolean; children: React.ReactNode }) => (
  <div className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm ${right ? "bg-white text-accent-strong shadow-[inset_0_0_0_1.5px_#2a6f87]" : "bg-white/60 text-ink-3"}`}>
    {right
      ? <span className="grid place-items-center h-5 w-5 rounded-full bg-[#1b566b] text-white shrink-0"><Check size={12} strokeWidth={3} /></span>
      : <span className="h-5 w-5 rounded-full border border-[#c3d8e0] shrink-0" />}
    <span className="min-w-0">{children}</span>
    {right && <span className="ml-auto text-[11px] text-[#1b566b] shrink-0">Correct</span>}
  </div>
);

export function PreviewTestModal({ previewTest, onClose, editable = false }: PreviewTestModalProps) {
  if (!previewTest) return null;
  const questions = previewTest.questions || [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-[#0e3445]/40 backdrop-blur-[3px]" onClick={onClose}
      role="dialog" aria-modal="true" aria-label={editable ? "Review questions" : "Test preview"}>
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[24px] bg-white shadow-[0_30px_80px_-30px_rgba(14,52,69,0.55)]" onClick={e => e.stopPropagation()}>
        <div className="px-7 pt-6 pb-4 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-ink-3">{editable ? "Review the questions before you publish" : "Preview"}</p>
            <h2 className="font-display text-[1.6rem] tracking-[-0.02em] text-accent-strong mt-0.5 truncate">{previewTest.title}</h2>
            <p className="text-xs text-ink-3 mt-1 tabular">
              {questions.length} question{questions.length === 1 ? "" : "s"} · {previewTest.total_marks || 0} marks · {previewTest.duration_minutes} min
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid place-items-center h-10 w-10 rounded-full bg-[#f1f5f7] text-ink-3 hover:text-accent-strong hover:bg-[#e6eef2] transition-colors cursor-pointer">
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 pb-7">
          {questions.length === 0 ? (
            <p className="rounded-2xl bg-[#f1f5f7] text-sm text-ink-3 text-center py-12">No questions yet. Generate them from the test card.</p>
          ) : (
            <ol className="space-y-3">
              {questions.map((q, idx) => (
                <li key={q.id} className="rounded-2xl bg-[#f1f5f7] p-5">
                  <div className="flex items-start gap-4">
                    <span className="grid place-items-center h-8 w-8 rounded-full bg-[#0e3445] text-white text-xs font-semibold shrink-0 tabular">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-accent-strong leading-snug">{q.question_text}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className={`${chip} bg-white text-accent-strong`}>{TYPE_LABEL[q.type] || q.type}</span>
                        {q.difficulty && <span className={`${chip} bg-white text-ink-3 capitalize`}>{q.difficulty}</span>}
                        <span className="text-[11px] text-ink-3 tabular ml-1">{q.marks ?? 0} {q.marks === 1 ? "mark" : "marks"}</span>
                        {q.topic && <span className="text-[11px] text-ink-4">· {q.topic}</span>}
                        {!editable && q.cognitive_level && <span className="text-[11px] text-ink-4 capitalize">· {q.cognitive_level}</span>}
                      </div>

                      {q.type === "mcq" && q.options && (
                        <div className="mt-4 space-y-1.5">
                          {q.options.map(opt => <Choice key={opt.id} right={!!opt.is_correct}>{opt.text}</Choice>)}
                        </div>
                      )}

                      {q.type === "true_false" && (
                        <div className="mt-4 grid grid-cols-2 gap-1.5 max-w-sm">
                          {[true, false].map(value => <Choice key={String(value)} right={q.correct_answer === value}>{value ? "True" : "False"}</Choice>)}
                        </div>
                      )}

                      {q.explanation && (
                        <p className="mt-4 text-sm text-ink-2 leading-relaxed border-l-2 border-[#8fbccb] pl-3">
                          <span className="text-ink-3">Why: </span>{q.explanation}
                        </p>
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
