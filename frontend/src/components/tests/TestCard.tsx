import { BarChart3, CheckCircle2, ClipboardCheck, Clock, Eye, FileText, Loader2, Play, Send, Sparkles, Target } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import type { TestSummary } from "../../types/tests";
import { timeAgo } from "../../utils/buildProgress";

interface TestCardProps {
  test: TestSummary;
  role: string | null;
  isGenerating: boolean;
  onPreview: (testId: string) => void;
  onGenerate: (testId: string) => void;
  onPublish: (testId: string) => void;
  onReleaseResults?: (testId: string) => void;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-500/10 text-amber-700 border-amber-500/25",
  published: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
  completed: "bg-accent/10 text-accent border-accent/25",
};

const TYPE_LABEL: Record<string, string> = { assignment: "Assignment", quiz: "Quiz", exam: "Exam", mock_test: "Practice" };

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-surface border border-line">
      <Icon className="w-3.5 h-3.5 text-ink-4 mb-2" />
      <span className="block text-sm text-ink tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-ink-4">{label}</span>
    </div>
  );
}

export function TestCard({ test, role, isGenerating, onPreview, onGenerate, onPublish, onReleaseResults }: TestCardProps) {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const questions = test.question_count || 0;
  const isProfessor = role === "professor";
  const resultsVisible = test.show_results_immediately || test.results_released;

  return (
    <Card className="p-6 flex flex-col hover:border-line transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[test.status] || "bg-sunken text-ink-3 border-line"}`}>
            {test.status}
          </span>
          <span className="px-2 py-0.5 rounded-md border border-line bg-sunken text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {TYPE_LABEL[test.test_type] || test.test_type}
          </span>
        </div>
        {test.created_at && <span className="text-[11px] text-ink-4">Created {timeAgo(test.created_at)}</span>}
      </div>

      <h3 className="mt-4 text-lg font-outfit font-medium text-ink leading-snug line-clamp-2">{test.title}</h3>
      <p className="mt-1 text-sm text-ink-3 line-clamp-2">{test.description || "No description."}</p>

      <div className="grid grid-cols-4 gap-2 mt-5">
        <Stat icon={Clock} label="Minutes" value={String(test.duration_minutes)} />
        <Stat icon={FileText} label="Questions" value={String(questions)} />
        <Stat icon={BarChart3} label="Marks" value={String(test.total_marks || 0)} />
        <Stat icon={Target} label="To pass" value={`${Math.round(test.passing_percentage)}%`} />
      </div>

      {isProfessor && test.status === "draft" && questions === 0 && (
        <p className="mt-4 text-xs text-ink-3">
          {isGenerating
            ? "The local AI model is writing questions from your course materials. This can take a few minutes."
            : "No questions yet. Generate them from your course materials, review them, then publish."}
        </p>
      )}

      {isProfessor && test.status === "published" && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-ink-3">{test.submissions ?? 0} submission{test.submissions === 1 ? "" : "s"}</span>
          {!!test.answers_to_review && courseId && (
            <button onClick={() => navigate(`/courses/${courseId}/review`)} className="text-amber-700 hover:text-amber-700">
              {test.answers_to_review} AI grade{test.answers_to_review === 1 ? "" : "s"} to review
            </button>
          )}
          <span className={resultsVisible ? "text-emerald-700 flex items-center gap-1" : "text-ink-3"}>
            {resultsVisible ? <><CheckCircle2 className="w-3.5 h-3.5" /> Results visible to students</> : "Results hidden until you release them"}
          </span>
        </div>
      )}

      {/* Pushes the actions to the bottom so cards in a row line up */}
      <div className="flex-1 min-h-5" />
      <div className="pt-4 border-t border-line flex flex-wrap items-center gap-2">
        {!isProfessor ? (
          <Button onClick={() => navigate(`/tests/${test.id}`)} variant="primary" className="w-full">
            <Play className="w-4 h-4" /> Start test
          </Button>
        ) : (
          <>
            {questions > 0 && (
              <Button size="sm" variant="outline" onClick={() => onPreview(test.id)}>
                <Eye className="w-3.5 h-3.5" /> {test.status === "draft" ? "Review questions" : "Preview"}
              </Button>
            )}

            {test.status === "draft" && questions === 0 && (
              <Button size="sm" variant="primary" onClick={() => onGenerate(test.id)} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {isGenerating ? "Writing questions..." : "Generate questions"}
              </Button>
            )}

            {test.status === "draft" && questions > 0 && (
              <Button size="sm" variant="primary" onClick={() => onPublish(test.id)}>
                <Play className="w-3.5 h-3.5" /> Publish
              </Button>
            )}

            {test.status === "published" && test.test_type === "assignment" && courseId && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/courses/${courseId}/tests/${test.id}/grading`)}>
                <ClipboardCheck className="w-3.5 h-3.5" /> Grade submissions
              </Button>
            )}

            {test.status === "published" && onReleaseResults && !resultsVisible && (
              <Button size="sm" variant="outline" onClick={() => onReleaseResults(test.id)}>
                <Send className="w-3.5 h-3.5" /> Release results
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
