import { CheckCircle2, ClipboardCheck, Clock, Eye, EyeOff, FileText, Loader2, Play, Send, Sparkles, Target } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { pillDark, pillLine } from "../ui/glass";
import { ART_PALETTES, type ArtPalette } from "../ui/artPalettes";

/** Deep bottom left, light glow top right: the same direction as the page gradient. */
const coverBg = (p: ArtPalette) =>
  `radial-gradient(90% 120% at 100% 0%, ${p.light}cc 0%, ${p.light}00 60%), linear-gradient(135deg, ${p.deep} 0%, ${p.mid} 100%)`;
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

/** Each kind of test has its own cover colour, so a row of cards reads at a glance. */
const TYPE: Record<string, { label: string; palette: ArtPalette }> = {
  exam: { label: "Exam", palette: ART_PALETTES.slate },
  assignment: { label: "Assignment", palette: ART_PALETTES.lagoon },
  quiz: { label: "Quiz", palette: ART_PALETTES.sea },
  mock_test: { label: "Practice", palette: ART_PALETTES.mist },
};

export function TestCard({ test, role, isGenerating, onPreview, onGenerate, onPublish, onReleaseResults }: TestCardProps) {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const questions = test.question_count || 0;
  const isProfessor = role === "professor";
  const draft = test.status === "draft";
  const resultsVisible = test.show_results_immediately || test.results_released;
  const type = TYPE[test.test_type] ?? { label: test.test_type, palette: ART_PALETTES.petrol };
  const toReview = test.answers_to_review || 0;

  return (
    <article className="w-full flex flex-col overflow-hidden rounded-[22px] bg-white/85 backdrop-blur-xl border border-white/70 shadow-[0_1px_2px_rgba(14,52,69,0.04),0_12px_32px_-18px_rgba(14,52,69,0.25)]">
      {/* Cover: type colour, status and title */}
      <div className="relative h-[124px] overflow-hidden" style={{ background: coverBg(type.palette) }}>
        {/* Dot matrix, densest top right and fading out toward the title */}
        <div className="absolute inset-0" aria-hidden style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.55) 1.1px, transparent 1.4px)',
          backgroundSize: '7px 7px',
          maskImage: 'radial-gradient(120% 140% at 100% 0%, black 0%, rgba(0,0,0,0.5) 40%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(120% 140% at 100% 0%, black 0%, rgba(0,0,0,0.5) 40%, transparent 75%)',
        }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" aria-hidden />
        <div className="absolute inset-x-4 top-3.5 flex items-center justify-between gap-2">
          <span className="h-6 px-2.5 inline-flex items-center rounded-full bg-white/15 border border-white/25 backdrop-blur text-[11px] text-white">{type.label}</span>
          <span className={`h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full text-[11px] font-medium ${draft ? "bg-clay-wash text-clay" : "bg-white text-accent-strong"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${draft ? "bg-clay-bar" : "bg-accent-300"}`} />
            {draft ? "Draft" : "Live"}
          </span>
        </div>
        <h3 className="absolute inset-x-4 bottom-3 font-display text-[1.2rem] leading-tight tracking-[-0.02em] text-white line-clamp-2">{test.title}</h3>
      </div>

      <div className="flex-1 flex flex-col p-4">
        {test.description && <p className="text-sm text-ink-3 line-clamp-1">{test.description}</p>}

        {/* The facts, on one line */}
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5"><Clock size={13} className="text-ink-4" />{test.duration_minutes} min</span>
          <span className="inline-flex items-center gap-1.5"><FileText size={13} className="text-ink-4" />{questions} {questions === 1 ? "question" : "questions"} · {test.total_marks || 0} marks</span>
          <span className="inline-flex items-center gap-1.5"><Target size={13} className="text-ink-4" />Pass {Math.round(test.passing_percentage)}%</span>
        </div>

        {/* Where this test is */}
        {isProfessor && (
          <div className="mt-3">
            {draft ? (
              <DraftSteps questions={questions} generating={isGenerating} />
            ) : (
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <Fact value={test.submissions ?? 0} label={test.submissions === 1 ? "submission" : "submissions"} />
                <Fact value={toReview} label="to review" tone={toReview ? "clay" : undefined}
                  onClick={toReview && courseId ? () => navigate(`/courses/${courseId}/review`) : undefined} />
                <div className={`rounded-xl px-2 py-2 ${resultsVisible ? "bg-accent-wash text-accent" : "bg-[#f1f5f7] text-ink-3"}`}>
                  {resultsVisible ? <CheckCircle2 size={16} className="mx-auto" /> : <EyeOff size={16} className="mx-auto" />}
                  <span className="block text-[11px] mt-1">{resultsVisible ? "Results out" : "Results hidden"}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-3" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!isProfessor ? (
            <button type="button" onClick={() => navigate(`/tests/${test.id}`)} className={`${pillDark} w-full`}>
              <Play className="w-4 h-4" /> Start test
            </button>
          ) : (
            <>
              {draft && questions === 0 && (
                <button type="button" className={pillDark} onClick={() => onGenerate(test.id)} disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {isGenerating ? "Writing questions…" : "Generate questions"}
                </button>
              )}
              {draft && questions > 0 && (
                <button type="button" className={pillDark} onClick={() => onPublish(test.id)}><Play className="w-3.5 h-3.5" /> Publish</button>
              )}
              {!draft && test.test_type === "assignment" && courseId && (
                <button type="button" className={pillDark} onClick={() => navigate(`/courses/${courseId}/tests/${test.id}/grading`)}>
                  <ClipboardCheck className="w-3.5 h-3.5" /> Grade
                </button>
              )}
              {!draft && onReleaseResults && !resultsVisible && (
                <button type="button" className={pillDark} onClick={() => onReleaseResults(test.id)}><Send className="w-3.5 h-3.5" /> Release results</button>
              )}
              {questions > 0 && (
                <button type="button" className={pillLine} onClick={() => onPreview(test.id)}>
                  <Eye className="w-3.5 h-3.5" /> {draft ? "Review questions" : "Preview"}
                </button>
              )}
              {test.created_at && <span className="ml-auto text-[11px] text-ink-4">{timeAgo(test.created_at)}</span>}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function Fact({ value, label, tone, onClick }: { value: number; label: string; tone?: "clay"; onClick?: () => void }) {
  const cls = `rounded-xl px-2 py-2 ${tone === "clay" ? "bg-clay-wash text-clay" : "bg-[#f1f5f7] text-accent-strong"}`;
  const body = (
    <>
      <span className="block font-display text-lg leading-none tabular">{value}</span>
      <span className={`block text-[11px] mt-1 ${tone === "clay" ? "" : "text-ink-3"}`}>{label}</span>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} hover:bg-clay-hover transition-colors cursor-pointer`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

/** Questions → review → publish, with the current step lit. */
function DraftSteps({ questions, generating }: { questions: number; generating: boolean }) {
  const at = questions > 0 ? 1 : 0;
  const steps = ["Questions", "Review", "Publish"];
  return (
    <div className="rounded-xl bg-[#f1f5f7] px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 flex items-center gap-1.5 min-w-0">
            <span className={`grid place-items-center h-5 w-5 shrink-0 rounded-full text-[10px] tabular ${
              i < at ? "bg-accent-strong text-white" : i === at ? "bg-clay-bar text-white" : "bg-white text-ink-4 border border-[#dbe7ec]"}`}>
              {i < at ? "✓" : i + 1}
            </span>
            <span className={`text-[11px] truncate ${i === at ? "text-clay font-medium" : "text-ink-3"}`}>{s}</span>
            {i < steps.length - 1 && <span className={`flex-1 h-px ${i < at ? "bg-accent-300" : "bg-[#dbe7ec]"}`} />}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-3">
        {generating ? "The AI is writing questions from your materials…" : questions ? "Check the questions, then publish." : "Generate questions from your course materials."}
      </p>
    </div>
  );
}
