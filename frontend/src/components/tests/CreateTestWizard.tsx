import { useMemo, useState } from "react";
import { BookOpen, Brain, Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, Search, Sparkles, X } from "lucide-react";
import { Button } from "../ui/Button";
import type { NewTestDraft, QuestionType, TestSourceDocument, TestTopic, TestType } from "../../types/tests";

interface CreateTestWizardProps {
  courseId: string;
  documents: TestSourceDocument[];
  graphNodes: TestTopic[];
  onClose: () => void;
  onCreateTest: (testData: NewTestDraft) => Promise<string | null>; // returns the testId
  onGenerateQuestions: (testId: string, testData: NewTestDraft) => Promise<void>;
  onViewTest: (testId: string) => void;
}

const STEPS = ["Details", "Content", "Done"];
const TEST_TYPES: { id: TestType; label: string; hint: string }[] = [
  { id: "assignment", label: "Assignment", hint: "Graded, with written answers" },
  { id: "quiz", label: "Quiz", hint: "Short check of understanding" },
  { id: "exam", label: "Exam", hint: "Formal, timed assessment" },
];
const QUESTION_TYPES: { id: QuestionType; label: string }[] = [
  { id: "mcq", label: "Multiple choice" },
  { id: "true_false", label: "True / false" },
  { id: "short_answer", label: "Short answer" },
];

const inputClass = "w-full bg-[#f1f5f7] border border-transparent rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-[#2a6f87] focus:bg-white transition-colors";
const labelClass = "block text-xs font-medium text-ink-3 mb-2";

export function CreateTestWizard({ documents, graphNodes, onClose, onCreateTest, onGenerateQuestions, onViewTest }: CreateTestWizardProps) {
  const [step, setStep] = useState(1); // 1: details, 2: content, 3: done
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [testId, setTestId] = useState<string | null>(null);
  const [topicQuery, setTopicQuery] = useState("");
  const [draft, setDraft] = useState<NewTestDraft>({
    title: "",
    description: "",
    duration_minutes: 60,
    passing_percentage: 40,
    test_type: "assignment",
    show_results_immediately: false,
    question_count: 10,
    question_types: ["mcq", "true_false", "short_answer"],
    selected_documents: [],
    selected_topics: [],
  });
  const update = (patch: Partial<NewTestDraft>) => setDraft(prev => ({ ...prev, ...patch }));
  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

  const readyDocs = documents.filter(d => d.status === "ready");
  const topics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    return q ? graphNodes.filter(n => n.label.toLowerCase().includes(q)) : graphNodes;
  }, [graphNodes, topicQuery]);

  const createDraft = async () => {
    // The draft already exists when the professor came back from step 2
    if (testId) return setStep(2);
    setIsCreating(true);
    try {
      const id = await onCreateTest(draft);
      if (id) {
        setTestId(id);
        setStep(2);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const generate = async () => {
    if (!testId) return;
    setIsGenerating(true);
    try {
      await onGenerateQuestions(testId, draft);
      setStep(3);
    } catch {
      // The page shows the error; the draft stays so the professor can try again
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0e3445]/40 backdrop-blur-[3px] flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Create a test">
      <div className="bg-white rounded-[24px] max-w-3xl w-full max-h-[90vh] flex flex-col shadow-[0_30px_80px_-30px_rgba(14,52,69,0.55)]">
        {/* Header and steps */}
        <div className="px-7 pt-6 pb-4 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="font-display text-[1.6rem] tracking-[-0.02em] text-accent-strong">Create a test</h2>
            <ol className="flex items-center gap-2 mt-3">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < step;
                return (
                  <li key={label} className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold border ${
                      done ? "bg-[#dbe7ec] border-transparent text-[#1b566b]" : n === step ? "bg-[#0e3445] text-white border-[#0e3445]" : "border-[#c3d8e0] text-ink-4"
                    }`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : n}
                    </span>
                    <span className={`text-xs ${n === step ? "text-accent-strong" : "text-ink-4"}`}>{label}</span>
                    {n < STEPS.length && <span className="w-6 h-px bg-[#dbe7ec]" />}
                  </li>
                );
              })}
            </ol>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid place-items-center h-10 w-10 rounded-full bg-[#f1f5f7] text-ink-3 hover:text-accent-strong hover:bg-[#e6eef2] transition-colors cursor-pointer">
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className={labelClass} htmlFor="test-title">Title</label>
                <input id="test-title" autoFocus value={draft.title} onChange={e => update({ title: e.target.value })}
                  placeholder="e.g. Week 3 quiz: Pandas data cleaning" className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="test-description">Description <span className="text-ink-4">(optional)</span></label>
                <textarea id="test-description" value={draft.description} onChange={e => update({ description: e.target.value })} rows={2}
                  placeholder="What the test covers, and anything students should know" className={`${inputClass} resize-none`} />
              </div>

              <div>
                <span className={labelClass}>Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {TEST_TYPES.map(t => (
                    <button key={t.id} type="button" onClick={() => update({ test_type: t.id })}
                      className={`text-left p-3 rounded-xl border transition-colors ${draft.test_type === t.id ? "border-[#2a6f87] bg-[#ecf3f6]" : "border-[#dbe7ec] bg-white hover:border-[#8fbccb]"}`}>
                      <span className="block text-sm text-ink">{t.label}</span>
                      <span className="block text-[11px] text-ink-3 mt-0.5">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} htmlFor="test-duration">Time limit (minutes)</label>
                  <input id="test-duration" type="number" min={5} value={draft.duration_minutes}
                    onChange={e => update({ duration_minutes: parseInt(e.target.value) || 0 })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="test-pass">Pass mark (%)</label>
                  <input id="test-pass" type="number" min={0} max={100} value={draft.passing_percentage}
                    onChange={e => update({ passing_percentage: parseInt(e.target.value) || 0 })} className={inputClass} />
                </div>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-[#dbe7ec] bg-white cursor-pointer">
                <input type="checkbox" checked={draft.show_results_immediately}
                  onChange={e => update({ show_results_immediately: e.target.checked })} className="mt-0.5 w-4 h-4 accent-white" />
                <span className="text-sm text-ink">
                  Show results right after submission
                  <span className="block text-xs text-ink-3 mt-0.5">
                    Otherwise students see their score when you release results. AI grades you haven't reviewed yet are held back either way.
                  </span>
                </span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-ink-3">
                The AI writes questions from your course materials. Narrow it down, or leave everything unselected to use all of them.
              </p>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><BookOpen className="w-3.5 h-3.5" /> Files</span>
                  <span className="text-[11px] text-ink-4">
                    {draft.selected_documents.length ? `${draft.selected_documents.length} selected` : `All ${readyDocs.length}`}
                  </span>
                </div>
                {readyDocs.length === 0 ? (
                  <p className="text-sm text-ink-3 py-4 text-center border border-dashed border-[#c3d8e0] rounded-xl">No processed files yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {readyDocs.map(doc => {
                      const on = draft.selected_documents.includes(doc.id);
                      return (
                        <button key={doc.id} type="button" onClick={() => update({ selected_documents: toggle(draft.selected_documents, doc.id) })}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${on ? "border-[#2a6f87] bg-[#ecf3f6]" : "border-[#dbe7ec] bg-white hover:border-[#8fbccb]"}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-[#0e3445] border-[#0e3445]" : "border-[#c3d8e0]"}`}>
                            {on && <Check className="w-3 h-3 text-ink" />}
                          </span>
                          <FileText className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                          <span className="text-xs text-ink truncate">{doc.filename}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {graphNodes.length > 0 && (
                <section>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3"><Brain className="w-3.5 h-3.5" /> Concepts</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-ink-4">
                        {draft.selected_topics.length ? `${draft.selected_topics.length} of ${graphNodes.length} selected` : `All ${graphNodes.length}`}
                      </span>
                      {draft.selected_topics.length > 0 && (
                        <button type="button" onClick={() => update({ selected_topics: [] })} className="text-ink-3 hover:text-ink">Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-ink-4 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={topicQuery} onChange={e => setTopicQuery(e.target.value)} placeholder="Filter concepts"
                      className={`${inputClass} pl-8 py-2 text-xs`} aria-label="Filter concepts" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {topics.map(node => {
                      const on = draft.selected_topics.includes(node.id);
                      return (
                        <button key={node.id} type="button" onClick={() => update({ selected_topics: toggle(draft.selected_topics, node.id) })}
                          className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${on ? "bg-[#0e3445] text-white border-[#0e3445]" : "text-ink-2 border-[#dbe7ec] bg-white hover:border-[#8fbccb]"}`}>
                          {node.label}
                        </button>
                      );
                    })}
                    {topics.length === 0 && <p className="text-xs text-ink-4 py-2">No concept matches “{topicQuery}”.</p>}
                  </div>
                </section>
              )}

              <section className="grid sm:grid-cols-[160px_1fr] gap-4">
                <div>
                  <label className={labelClass} htmlFor="test-count">Questions</label>
                  <input id="test-count" type="number" min={1} max={50} value={draft.question_count}
                    onChange={e => update({ question_count: parseInt(e.target.value) || 0 })} className={inputClass} />
                </div>
                <div>
                  <span className={labelClass}>Question types</span>
                  <div className="flex flex-wrap gap-2">
                    {QUESTION_TYPES.map(t => {
                      const on = draft.question_types.includes(t.id);
                      return (
                        <button key={t.id} type="button" onClick={() => update({ question_types: toggle(draft.question_types, t.id) })}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border transition-colors ${on ? "bg-[#0e3445] text-white border-[#0e3445]" : "text-ink-2 border-[#dbe7ec] bg-white hover:border-[#8fbccb]"}`}>
                          {on && <Check className="w-3 h-3" />} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {isGenerating && (
                <p className="flex items-center gap-2 text-xs text-ink-3 p-3 rounded-xl bg-[#f1f5f7]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Writing {draft.question_count} questions with the local AI model. This can take a few minutes; keep this window open.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-[#dbe7ec] flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-[#1b566b]" />
              </div>
              <h3 className="font-display text-xl tracking-[-0.02em] text-accent-strong">Questions ready for review</h3>
              <p className="text-sm text-ink-3 mt-2 max-w-sm mx-auto">
                The test is saved as a draft. Check the questions, set Bloom levels or rubrics where needed, then publish it from the test list.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-7 py-4 bg-[#f6f9fa] rounded-b-[24px] flex items-center justify-between gap-3 shrink-0">
          {step === 1 && (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={createDraft} disabled={!draft.title.trim() || isCreating}>
                {isCreating && <Loader2 className="w-4 h-4 animate-spin" />} Next: choose content <ChevronRight className="w-4 h-4" />
              </Button>
            </>
          )}
          {step === 2 && (
            <>
              <Button variant="ghost" onClick={() => setStep(1)} disabled={isGenerating}><ChevronLeft className="w-4 h-4" /> Back</Button>
              <Button variant="primary" onClick={generate} disabled={isGenerating || draft.question_types.length === 0 || draft.question_count < 1}>
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isGenerating ? "Writing questions..." : `Generate ${draft.question_count} questions`}
              </Button>
            </>
          )}
          {step === 3 && (
            <>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button variant="primary" onClick={() => testId && onViewTest(testId)}>Review questions</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
