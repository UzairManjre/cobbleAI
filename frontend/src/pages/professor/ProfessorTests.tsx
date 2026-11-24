import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { ClipboardCheck, FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { testsApi, documentsApi, graphsApi } from "../../api";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
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

function Summary({ label, value, tone = "text-ink", onClick }: { label: string; value: number; tone?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className={`block text-2xl font-light tabular-nums ${tone}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-ink-4">{label}</span>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="text-left p-5 rounded-2xl bg-surface border border-line hover:border-line-strong transition-colors">{body}</button>
  ) : (
    <div className="p-5 rounded-2xl bg-surface border border-line">{body}</div>
  );
}

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
      <div className="min-h-[60vh] w-full bg-canvas flex items-center justify-center">
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

  return (
    <div className="w-full bg-canvas text-ink px-8 lg:px-12 py-8">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="flex flex-col gap-6">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-outfit font-light tracking-tight">Tests & assessments</h2>
              <p className="text-sm text-ink-3 mt-3 max-w-xl">
                {isProfessor
                  ? "The AI writes questions from your course materials. You review them, publish, and check the AI's grades."
                  : "Tests your instructor has published for this course."}
              </p>
            </div>
            {isProfessor && (
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => navigate(`/courses/${courseId}/review`)}>
                  <ClipboardCheck size={16} /> Review AI grades
                  {toReview > 0 && <span className="ml-1 px-1.5 rounded-md bg-amber-500/20 text-amber-700 text-[11px] tabular-nums">{toReview}</span>}
                </Button>
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} /> Create test
                </Button>
              </div>
            )}
          </header>
        </div>

        {isProfessor && tests.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Summary label="Tests" value={tests.length} />
            <Summary label="Published" value={published} tone="text-emerald-700" />
            <Summary label="Drafts" value={drafts} tone={drafts ? "text-amber-700" : "text-ink"} />
            <Summary label="AI grades to review" value={toReview} tone={toReview ? "text-amber-700" : "text-ink"}
              onClick={toReview ? () => navigate(`/courses/${courseId}/review`) : undefined} />
          </div>
        )}

        {isProfessor && tests.length > 0 && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-line w-fit" role="tablist">
            {([["all", "All", tests.length], ["draft", "Drafts", drafts], ["published", "Published", published]] as const).map(([id, label, count]) => (
              <button key={id} role="tab" aria-selected={filter === id} onClick={() => setFilter(id)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === id ? "bg-accent text-white" : "text-ink-3 hover:text-ink"}`}>
                {label} <span className={filter === id ? "text-ink/50" : "text-ink-4"}>{count}</span>
              </button>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <Card className="p-10 md:p-14">
            <div className="max-w-xl mx-auto text-center">
              <div className="w-14 h-14 rounded-2xl bg-sunken border border-line flex items-center justify-center mx-auto mb-5">
                <FileText className="w-6 h-6 text-ink-3" />
              </div>
              <h2 className="text-xl font-outfit font-medium">{isProfessor ? "No tests yet" : "No tests published yet"}</h2>
              <p className="text-sm text-ink-3 mt-2">
                {isProfessor
                  ? "Create a test and the AI drafts the questions from this course's materials."
                  : "When your instructor publishes a test, it appears here."}
              </p>

              {isProfessor && (
                <>
                  <ol className="grid sm:grid-cols-3 gap-3 mt-8 text-left">
                    {[
                      ["Set the details", "Title, type, time limit and pass mark."],
                      ["Choose the content", "All materials, or just some files and concepts."],
                      ["Review and publish", "Check each question, then release it to students."],
                    ].map(([title, text], i) => (
                      <li key={title} className="p-4 rounded-xl border border-line bg-surface">
                        <span className="text-[11px] text-ink-4 tabular-nums">Step {i + 1}</span>
                        <span className="block text-sm text-ink mt-1">{title}</span>
                        <span className="block text-xs text-ink-3 mt-1">{text}</span>
                      </li>
                    ))}
                  </ol>
                  {readyDocs === 0 ? (
                    <p className="mt-8 text-xs text-amber-700">
                      This course has no processed files yet. Questions are written from them, so{" "}
                      <button onClick={() => navigate(courseRoute)} className="underline hover:text-amber-700">upload materials first</button>.
                    </p>
                  ) : (
                    <Button variant="primary" className="mt-8" onClick={() => setShowCreateModal(true)}>
                      <Sparkles size={16} /> Create your first test
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        ) : shown.length === 0 ? (
          <p className="text-sm text-ink-3 py-10 text-center">No {filter === "draft" ? "drafts" : "published tests"}.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {shown.map(test => (
              <TestCard
                key={test.id}
                test={test}
                role={role}
                isGenerating={!!generating[test.id]}
                onPreview={openPreview}
                onGenerate={id => generateQuestions(id, DEFAULT_GENERATION).catch(() => undefined)}
                onPublish={publish}
                onReleaseResults={releaseResults}
              />
            ))}
          </div>
        )}
      </div>

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
