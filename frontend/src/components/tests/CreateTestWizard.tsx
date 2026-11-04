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

const inputClass = "w-full bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#555555] focus:outline-none focus:border-[#444444]";
const labelClass = "block text-xs font-medium text-[#AAAAAA] mb-2";

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Create a test">
      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header and steps */}
        <div className="px-7 py-5 border-b border-[#1A1A1A] flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-xl font-outfit font-medium text-white">Create a test</h2>
            <ol className="flex items-center gap-2 mt-3">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < step;
                return (
                  <li key={label} className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold border ${
                      done ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : n === step ? "bg-white text-black border-white" : "border-[#2A2A2A] text-[#666666]"
                    }`}>
                      {done ? <Check className="w-3.5 h-3.5" /> : n}
                    </span>
                    <span className={`text-xs ${n === step ? "text-white" : "text-[#666666]"}`}>{label}</span>
                    {n < STEPS.length && <span className="w-6 h-px bg-[#2A2A2A]" />}
                  </li>
                );
              })}
            </ol>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-[#888888] hover:text-white hover:bg-[#111111]">
            <X className="w-5 h-5" />
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
                <label className={labelClass} htmlFor="test-description">Description <span className="text-[#555555]">(optional)</span></label>
                <textarea id="test-description" value={draft.description} onChange={e => update({ description: e.target.value })} rows={2}
                  placeholder="What the test covers, and anything students should know" className={`${inputClass} resize-none`} />
              </div>

              <div>
                <span className={labelClass}>Type</span>
                <div className="grid grid-cols-3 gap-2">
                  {TEST_TYPES.map(t => (
                    <button key={t.id} type="button" onClick={() => update({ test_type: t.id })}
                      className={`text-left p-3 rounded-xl border transition-colors ${draft.test_type === t.id ? "border-white bg-[#151515]" : "border-[#1A1A1A] bg-[#0D0D0D] hover:border-[#333333]"}`}>
                      <span className="block text-sm text-white">{t.label}</span>
                      <span className="block text-[11px] text-[#777777] mt-0.5">{t.hint}</span>
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

              <label className="flex items-start gap-3 p-4 rounded-xl border border-[#1A1A1A] bg-[#0D0D0D] cursor-pointer">
                <input type="checkbox" checked={draft.show_results_immediately}
                  onChange={e => update({ show_results_immediately: e.target.checked })} className="mt-0.5 w-4 h-4 accent-white" />
                <span className="text-sm text-white">
                  Show results right after submission
                  <span className="block text-xs text-[#888888] mt-0.5">
                    Otherwise students see their score when you release results. AI grades you haven't reviewed yet are held back either way.
                  </span>
                </span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-sm text-[#888888]">
                The AI writes questions from your course materials. Narrow it down, or leave everything unselected to use all of them.
              </p>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[#AAAAAA]"><BookOpen className="w-3.5 h-3.5" /> Files</span>
                  <span className="text-[11px] text-[#666666]">
                    {draft.selected_documents.length ? `${draft.selected_documents.length} selected` : `All ${readyDocs.length}`}
                  </span>
                </div>
                {readyDocs.length === 0 ? (
                  <p className="text-sm text-[#888888] py-4 text-center border border-dashed border-[#1A1A1A] rounded-xl">No processed files yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {readyDocs.map(doc => {
                      const on = draft.selected_documents.includes(doc.id);
                      return (
                        <button key={doc.id} type="button" onClick={() => update({ selected_documents: toggle(draft.selected_documents, doc.id) })}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${on ? "border-white bg-[#151515]" : "border-[#1A1A1A] bg-[#0D0D0D] hover:border-[#333333]"}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-white border-white" : "border-[#444444]"}`}>
                            {on && <Check className="w-3 h-3 text-black" />}
                          </span>
                          <FileText className="w-3.5 h-3.5 text-[#666666] shrink-0" />
                          <span className="text-xs text-white truncate">{doc.filename}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {graphNodes.length > 0 && (
                <section>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-[#AAAAAA]"><Brain className="w-3.5 h-3.5" /> Concepts</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-[#666666]">
                        {draft.selected_topics.length ? `${draft.selected_topics.length} of ${graphNodes.length} selected` : `All ${graphNodes.length}`}
                      </span>
                      {draft.selected_topics.length > 0 && (
                        <button type="button" onClick={() => update({ selected_topics: [] })} className="text-[#AAAAAA] hover:text-white">Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 text-[#555555] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={topicQuery} onChange={e => setTopicQuery(e.target.value)} placeholder="Filter concepts"
                      className={`${inputClass} pl-8 py-2 text-xs`} aria-label="Filter concepts" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {topics.map(node => {
                      const on = draft.selected_topics.includes(node.id);
                      return (
                        <button key={node.id} type="button" onClick={() => update({ selected_topics: toggle(draft.selected_topics, node.id) })}
                          className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${on ? "bg-white text-black border-white" : "text-[#CCCCCC] border-[#1A1A1A] bg-[#0D0D0D] hover:border-[#333333]"}`}>
                          {node.label}
                        </button>
                      );
                    })}
                    {topics.length === 0 && <p className="text-xs text-[#666666] py-2">No concept matches “{topicQuery}”.</p>}
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
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border transition-colors ${on ? "bg-white text-black border-white" : "text-[#CCCCCC] border-[#1A1A1A] bg-[#0D0D0D] hover:border-[#333333]"}`}>
                          {on && <Check className="w-3 h-3" />} {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {isGenerating && (
                <p className="flex items-center gap-2 text-xs text-[#AAAAAA] p-3 rounded-xl border border-[#1A1A1A] bg-[#0D0D0D]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Writing {draft.question_count} questions with the local AI model. This can take a few minutes; keep this window open.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-outfit font-medium text-white">Questions ready for review</h3>
              <p className="text-sm text-[#888888] mt-2 max-w-sm mx-auto">
                The test is saved as a draft. Check the questions, set Bloom levels or rubrics where needed, then publish it from the test list.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-7 py-4 border-t border-[#1A1A1A] flex items-center justify-between gap-3 shrink-0">
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
