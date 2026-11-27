import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { testsApi, documentsApi, graphsApi } from "../../api";
import { panel, pillDark, pillLine, rise } from "../../components/ui/glass";
import { TestCard } from "../../components/tests/TestCard";
import { PreviewTestModal, type PreviewTest } from "../../components/tests/PreviewTestModal";
import { CreateTestWizard } from "../../components/tests/CreateTestWizard";
import type { NewTestDraft, TestSourceDocument, TestSummary, TestTopic } from "../../types/tests";
import { apiErrorDetail } from "../../utils/apiError";

type Filter = "all" | "draft" | "published";
type GenerationRequest = Pick<NewTestDraft, "question_count" | "question_types" | "selected_documents" | "selected_topics">;

const DEFAULT_GENERATION: GenerationRequest = {
  question_count: 10,
  question_types: ["mcq", "true_false", "short_answer"],
  selected_documents: [],
  selected_topics: [],
};

export default function ProfessorTests() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { token, role } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);
  const isProfessor = role === "professor";

  const [tests, setTests] = useState<TestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewTest, setPreviewTest] = useState<PreviewTest | null>(null);
  const [documents, setDocuments] = useState<TestSourceDocument[]>([]);
  const [graphNodes, setGraphNodes] = useState<TestTopic[]>([]);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  const courseRoute = isProfessor ? `/courses/${courseId}` : `/courses/${courseId}`;
  const handleAuthError = (err: unknown) => {
    if ((err as { response?: { status?: number } })?.response?.status === 401) {
      useAuthStore.getState().logout();
      navigate("/signin");
    }
  };

  const loadTests = async () => {
    try {
      const res = await testsApi.getByCourse(courseId || "");
      // The endpoint returns a bare array; accept the older { tests } shape too
      setTests(Array.isArray(res.data) ? res.data : res.data.tests || []);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCourseData = async () => {
    try {
      const docsRes = await documentsApi.list(courseId || "");
      setDocuments(docsRes.data || []);
      const graphRes = await graphsApi.getByCourse(courseId || "");
      if (graphRes.data?.length && graphRes.data[0].nodes) setGraphNodes(graphRes.data[0].nodes);
    } catch (err) {
      handleAuthError(err);
    }
  };

  useEffect(() => {
    if (token && courseId) {
      loadTests();
      loadCourseData();
    } else if (!token) {
      navigate("/signin");
    }
  }, [courseId, token]);

  const openPreview = async (testId: string) => {
    try {
      const res = await testsApi.get(testId);
      setPreviewTest(res.data.test);
    } catch {
      addToast("Could not load the test", "error");
    }
  };

  const publish = async (testId: string) => {
    try {
      await testsApi.publish(testId);
      addToast("Test published. Students can take it now.", "success");
      loadTests();
    } catch (err) {
      addToast(apiErrorDetail(err, "Could not publish the test"), "error");
    }
  };

  const releaseResults = async (testId: string) => {
    try {
      const { data } = await testsApi.releaseResults(testId);
      addToast(
        `Results released for ${data.released} attempt${data.released === 1 ? "" : "s"}` +
          (data.waiting_for_review ? `; ${data.waiting_for_review} follow once you review their AI grades` : ""),
        "success",
      );
      loadTests();
    } catch (err) {
      addToast(apiErrorDetail(err, "Could not release results"), "error");
    }
  };

  const createTest = async (draft: NewTestDraft): Promise<string | null> => {
    try {
      const res = await testsApi.create({
        course_id: courseId,
        title: draft.title.trim(),
        description: draft.description,
        duration_minutes: draft.duration_minutes,
        passing_percentage: draft.passing_percentage,
        test_type: draft.test_type,
        show_results_immediately: draft.show_results_immediately,
      });
      loadTests();
      return res.data.test?.id || res.data.test_id || null;
    } catch (err) {
      addToast(apiErrorDetail(err, "Could not create the test"), "error");
      return null;
    }
  };

  const generateQuestions = async (testId: string, request: GenerationRequest) => {
    setGenerating(prev => ({ ...prev, [testId]: true }));
    try {
      const chosenDocs = documents.filter(d => request.selected_documents.includes(d.id));
      const docContext = chosenDocs.length
        ? `Focus on these documents:\n${chosenDocs.map(d => `- ${d.filename}`).join("\n")}`
        : "Use all available course materials.";
      const chosenTopics = graphNodes.filter(n => request.selected_topics.includes(n.id));
      await testsApi.generateQuestions(testId, {
        course_id: courseId,
        question_count: request.question_count,
        question_types: request.question_types,
        document_context: docContext,
        topics_filter: (chosenTopics.length ? chosenTopics : graphNodes).map(t => t.label),
      });
      loadTests();
    } catch (err) {
      addToast(apiErrorDetail(err, "Could not generate questions"), "error");
      throw err;
    } finally {
      setGenerating(prev => ({ ...prev, [testId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-3" />
      </div>
    );
  }

  const visible = (isProfessor ? tests : tests.filter(t => t.status === "published"))
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")); // newest first
  const drafts = tests.filter(t => t.status === "draft").length;
  const published = tests.filter(t => t.status === "published").length;
  const toReview = tests.reduce((sum, t) => sum + (t.answers_to_review || 0), 0);
  const shown = filter === "all" ? visible : visible.filter(t => t.status === filter);
  const readyDocs = documents.filter(d => d.status === "ready").length;
  const readyToPublish = tests.filter(t => t.status === "draft" && (t.question_count || 0) > 0).length;
  const needQuestions = tests.filter(t => t.status === "draft" && !(t.question_count || 0)).length;
  const unreleased = tests.filter(t => t.status === "published" && !t.show_results_immediately && !t.results_released && (t.submissions || 0) > 0).length;
  const todos = [
    toReview && { key: "review", n: toReview, label: `AI ${toReview === 1 ? "grade" : "grades"} to check`, onClick: () => navigate(`/courses/${courseId}/review`) },
    readyToPublish && { key: "publish", n: readyToPublish, label: `${readyToPublish === 1 ? "draft" : "drafts"} ready to publish`, onClick: () => setFilter("draft") },
    needQuestions && { key: "questions", n: needQuestions, label: `${needQuestions === 1 ? "draft needs" : "drafts need"} questions`, onClick: () => setFilter("draft") },
    unreleased && { key: "release", n: unreleased, label: `${unreleased === 1 ? "test has" : "tests have"} results to release`, onClick: () => setFilter("published") },
  ].filter(Boolean) as { key: string; n: number; label: string; onClick: () => void }[];

  return (
    <div className="mt-8 sm:mt-10 space-y-4 text-ink">
      {/* Toolbar: what this tab is, the counts, and the two main actions */}
      <section style={rise(1)} className={`${panel} p-5`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[1.35rem] tracking-[-0.02em] text-accent-strong">Tests & assessments</h2>
            <p className="text-xs text-ink-3 mt-1 max-w-xl">
              {isProfessor
                ? "The AI writes questions from your course materials. You review them, publish, and check the AI's grades."
                : "Tests your instructor has published for this course."}
            </p>
          </div>
          {isProfessor && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => navigate(`/courses/${courseId}/review`)} className={pillLine}>
                <ClipboardCheck size={14} /> Review AI grades
              </button>
              <button type="button" onClick={() => setShowCreateModal(true)} className={pillDark}><Plus size={14} /> Create test</button>
            </div>
          )}
        </div>

        {isProfessor && tests.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#e2eaeb] flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* What needs the professor, instead of bare counts */}
            <div className="flex flex-wrap gap-2 min-w-0">
              {todos.length === 0 ? (
                <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-accent-wash text-accent text-xs">
                  <CheckCircle2 size={14} /> Nothing waiting on you
                </span>
              ) : todos.map(t => (
                <button key={t.key} type="button" onClick={t.onClick}
                  className="inline-flex items-center gap-2 h-9 pl-1.5 pr-3.5 rounded-full bg-clay-wash hover:bg-clay-hover text-xs text-clay transition-colors cursor-pointer max-w-full">
                  <span className="grid place-items-center h-6 min-w-6 px-1.5 rounded-full bg-clay-bar text-white text-[11px] tabular">{t.n}</span>
                  <span className="truncate">{t.label}</span>
                  <ArrowRight size={13} className="shrink-0 opacity-60" />
                </button>
              ))}
            </div>
            <div className="inline-flex p-1 rounded-full bg-[#f1f5f7] self-start md:self-auto" role="tablist">
              {([["all", "All", tests.length], ["draft", "Drafts", drafts], ["published", "Published", published]] as const).map(([id, label, count]) => (
                <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                  className={`h-8 px-4 rounded-full text-xs transition-colors cursor-pointer ${filter === id ? "bg-accent-strong text-white" : "text-ink-3 hover:text-accent-strong"}`}>
                  {label} <span className={filter === id ? "text-white/60" : "text-ink-4"}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {visible.length === 0 ? (
        <section style={rise(2)} className={`${panel} p-8 md:p-12`}>
          <div className="max-w-2xl mx-auto text-center">
            <span className="grid place-items-center h-12 w-12 rounded-2xl bg-accent-wash text-accent mx-auto"><FileText size={20} /></span>
            <h2 className="mt-4 font-display text-xl tracking-[-0.02em] text-accent-strong">{isProfessor ? "No tests yet" : "No tests published yet"}</h2>
            <p className="text-sm text-ink-3 mt-1.5">
              {isProfessor
                ? "Create a test and the AI drafts the questions from this course's materials."
                : "When your instructor publishes a test, it appears here."}
            </p>
            {isProfessor && (
              <>
                <ol className="grid sm:grid-cols-3 gap-2 mt-6 text-left">
                  {[
                    ["Set the details", "Title, type, time limit and pass mark."],
                    ["Choose the content", "All materials, or just some files and concepts."],
                    ["Review and publish", "Check each question, then release it to students."],
                  ].map(([title, text], i) => (
                    <li key={title} className="p-4 rounded-2xl bg-[#f1f5f7]">
                      <span className="grid place-items-center h-6 w-6 rounded-full bg-accent-strong text-white text-[11px] tabular">{i + 1}</span>
                      <span className="block text-sm text-accent-strong mt-2">{title}</span>
                      <span className="block text-xs text-ink-3 mt-1">{text}</span>
                    </li>
                  ))}
                </ol>
                {readyDocs === 0 ? (
                  <p className="mt-6 text-xs text-clay">
                    This course has no processed files yet. Questions are written from them, so{" "}
                    <button onClick={() => navigate(courseRoute)} className="underline">upload materials first</button>.
                  </p>
                ) : (
                  <button type="button" className={`${pillDark} mt-6`} onClick={() => setShowCreateModal(true)}>
                    <Sparkles size={14} /> Create your first test
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      ) : shown.length === 0 ? (
        <p className={`${panel} p-8 text-sm text-ink-3 text-center`}>No {filter === "draft" ? "drafts" : "published tests"}.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 [&>*]:min-w-0">
          {shown.map((test, i) => (
            <div key={test.id} style={rise(2 + i)} className="flex">
              <TestCard
                test={test}
                role={role}
                isGenerating={!!generating[test.id]}
                onPreview={openPreview}
                onGenerate={id => generateQuestions(id, DEFAULT_GENERATION).catch(() => undefined)}
                onPublish={publish}
                onReleaseResults={releaseResults}
              />
            </div>
          ))}
        </div>
      )}
      {previewTest && (
        <PreviewTestModal previewTest={previewTest} onClose={() => setPreviewTest(null)} editable={isProfessor} />
      )}

      {showCreateModal && (
        <CreateTestWizard
          courseId={courseId || ""}
          documents={documents}
          graphNodes={graphNodes}
          onClose={() => setShowCreateModal(false)}
          onCreateTest={createTest}
          onGenerateQuestions={generateQuestions}
          onViewTest={id => { setShowCreateModal(false); openPreview(id); }}
        />
      )}
    </div>
  );
}
