import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  FileText,
  Plus,
  Sparkles,
  Clock,
  CheckCircle,
  Eye,
  Play,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Brain,
  Target,
  X,
} from "lucide-react";
import { testsApi, documentsApi, graphsApi } from "../api";

export default function ProfessorTests() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { token, role } = useAuthStore();

  const [tests, setTests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTest, setPreviewTest] = useState<any>(null);
  const [createStep, setCreateStep] = useState(1); // 1: details, 2: select content, 3: generate
  const [documents, setDocuments] = useState<any[]>([]);
  const [graphNodes, setGraphNodes] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestId, setGeneratedTestId] = useState<any>(null);

  const [newTest, setNewTest] = useState<any>({
    title: "",
    description: "",
    duration_minutes: 60,
    passing_percentage: 40,
    test_type: "assignment",
    question_count: 10,
    question_types: ["mcq", "true_false", "short_answer"],
    selected_documents: [] as any[],
    selected_topics: [] as any[],
  });

  useEffect(() => {
    if (token && courseId) {
      loadTests();
      loadCourseData();
    } else if (!token) {
      // Token not available - redirect to login
      console.warn("No token available, redirecting to login");
      navigate(role === "student" ? "/login/student" : "/login/professor");
    }
  }, [courseId, token]);

  const loadTests = async () => {
    if (!token) return;

    try {
      const res = await testsApi.getByCourse(courseId || "");
      setTests(res.data.tests || []);
    } catch (err: any) {
      console.error("Failed to load tests:", err);
      // If 401, token may be expired - clear auth and redirect
      if (err.response?.status === 401) {
        console.warn("Token expired, clearing auth");
        useAuthStore.getState().logout();
        navigate(role === "student" ? "/login/student" : "/login/professor");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadCourseData = async () => {
    if (!token) return;

    try {
      // Load documents
      const docsRes = await documentsApi.list(courseId || "");
      setDocuments(docsRes.data || []);

      // Load graph nodes (topics)
      const graphRes = await graphsApi.getByCourse(courseId || "");
      // Graph endpoint returns array of graphs, get nodes from first one
      if (graphRes.data && graphRes.data.length > 0 && graphRes.data[0].nodes) {
        setGraphNodes(graphRes.data[0].nodes);
      }
    } catch (err: any) {
      console.error("Failed to load course data:", err);
      // If 401, token may be expired
      if (err.response?.status === 401) {
        console.warn("Token expired, clearing auth");
        useAuthStore.getState().logout();
        navigate(role === "student" ? "/login/student" : "/login/professor");
      }
    }
  };

  const resetModal = () => {
    setShowCreateModal(false);
    setCreateStep(1);
    setGeneratedTestId(null);
    setNewTest({
      title: "",
      description: "",
      duration_minutes: 60,
      passing_percentage: 40,
      test_type: "assignment",
      question_count: 10,
      question_types: ["mcq", "true_false", "short_answer"],
      selected_documents: [],
      selected_topics: [],
    });
  };

  const toggleDocument = (docId: string) => {
    setNewTest((prev: any) => ({
      ...prev,
      selected_documents: prev.selected_documents.includes(docId)
        ? prev.selected_documents.filter((id: string) => id !== docId)
        : [...prev.selected_documents, docId],
    }));
  };

  const toggleTopic = (topicId: string) => {
    setNewTest((prev: any) => ({
      ...prev,
      selected_topics: prev.selected_topics.includes(topicId)
        ? prev.selected_topics.filter((id: string) => id !== topicId)
        : [...prev.selected_topics, topicId],
    }));
  };

  const toggleQuestionType = (type: string) => {
    setNewTest((prev: any) => ({
      ...prev,
      question_types: prev.question_types.includes(type)
        ? prev.question_types.filter((t: string) => t !== type)
        : [...prev.question_types, type],
    }));
  };

  const handleCreateTest = async () => {
    if (!token) return;

    try {
      const res = await testsApi.create({
        course_id: courseId,
        title: newTest.title,
        description: newTest.description,
        duration_minutes: newTest.duration_minutes,
        passing_percentage: newTest.passing_percentage,
        test_type: newTest.test_type,
      });

      console.log("Test creation response:", res.data);

      // Extract test ID from response
      const testId = res.data.test?.id || res.data.test_id;
      if (!testId) {
        console.error("No test ID in response:", res.data);
        alert("Failed to create test: No test ID returned");
        return;
      }

      setGeneratedTestId(testId);
      setCreateStep(2);
    } catch (err: any) {
      console.error("Failed to create test:", err);
      const errorMessage =
        err.response?.data?.detail || err.message || "Failed to create test";
      alert(errorMessage);

      if (err.response?.status === 401) {
        useAuthStore.getState().logout();
        navigate(role === "student" ? "/login/student" : "/login/professor");
      }
    }
  };

  const handleGenerateQuestions = async (testId?: string) => {
    const idToGenerate = testId || generatedTestId;
    if (!token || !idToGenerate) {
      console.error("Missing token or test ID:", {
        token: !!token,
        idToGenerate,
      });
      alert("Test ID is missing. Please create the test again.");
      return;
    }

    try {
      setIsGenerating(true);

      // Build document context
      const selectedDocs = documents.filter((d) =>
        newTest.selected_documents.includes(d.id),
      );
      const docContext =
        selectedDocs.length > 0
          ? `Focus on these documents:\n${selectedDocs.map((d) => `- ${d.filename}`).join("\n")}`
          : "Use all available course materials.";

      // Build topics context
      const selectedTopics = graphNodes.filter((n) =>
        newTest.selected_topics.includes(n.id),
      );
      const topicsList =
        selectedTopics.length > 0
          ? selectedTopics.map((t) => t.label)
          : graphNodes.map((n) => n.label);

      console.log("Generating questions for test:", idToGenerate);

      await testsApi.generateQuestions(idToGenerate, {
        course_id: courseId,
        question_count: newTest.question_count,
        question_types: newTest.question_types,
        document_context: docContext,
        topics_filter: topicsList,
      });

      setCreateStep(3);
      loadTests();
    } catch (err: any) {
      console.error("Failed to generate questions:", err);
      const errorMessage =
        err.response?.data?.detail ||
        err.message ||
        "Failed to generate questions";
      alert(errorMessage);

      if (err.response?.status === 401) {
        useAuthStore.getState().logout();
        navigate(role === "student" ? "/login/student" : "/login/professor");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreviewTest = async (testId: string) => {
    try {
      console.log("🔍 Previewing test:", testId);

      // Fetch specific test with full details
      const res = await testsApi.get(testId);

      console.log("✅ Test data received:", {
        id: res.data.test?.id,
        title: res.data.test?.title,
        questionCount: res.data.test?.questions?.length,
        questions: res.data.test?.questions,
      });

      setPreviewTest(res.data.test);
      setShowPreviewModal(true);
    } catch (err) {
      console.error("❌ Failed to preview test:", err);
      alert("Failed to load test details");
    }
  };

  const handlePublishTest = async (testId: string) => {
    try {
      await testsApi.publish(testId);
      loadTests();
    } catch (err) {
      console.error("Failed to publish test:", err);
    }
  };

  const getStatusBadge = (status: string) => {
      switch (status) {
        case "draft":
          return "bg-amber-100 text-amber-800 border-2 border-amber-500";
        case "published":
          return "bg-emerald-100 text-emerald-800 border-2 border-emerald-500";
        case "completed":
          return "bg-blue-100 text-blue-800 border-2 border-blue-500";
        default:
          return "bg-gray-100 text-gray-800 border-2 border-gray-400";
      }
    };

    const getStatusBorder = (status: string) => {
      switch (status) {
        case "draft":
          return "border-l-[8px] border-l-amber-500";
        case "published":
          return "border-l-[8px] border-l-emerald-500";
        case "completed":
          return "border-l-[8px] border-l-blue-500";
        default:
          return "border-l-[8px] border-l-gray-400";
      }
    };

    if (isLoading) {
      return (
        <div className="min-h-screen bg-[#FCFCFC] flex items-center justify-center font-['Outfit']">
          <div className="text-[#0A0A0A]/40 font-bold text-lg">
            Loading tests...
          </div>
        </div>
      );
    }

    const displayedTests =
      role === "professor"
        ? tests
        : tests.filter((t: any) => t.status === "published");

    return (
      <div className="min-h-screen bg-[#FCFCFC] text-[#0A0A0A]">
        {/* Header */}
        <div className="border-b-4 border-[#0A0A0A] bg-[#FFFFFF] shadow-[0_4px_0_rgba(0,0,0,0.05)]">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <button
              onClick={() =>
                navigate(
                  role === "professor"
                    ? `/professor/courses/${courseId}`
                    : `/student/courses/${courseId}`,
                )
              }
              className="text-[#0A0A0A]/70 hover:text-black mb-6 transition-colors flex items-center gap-2 text-sm font-extrabold font-['Outfit'] border-2 border-[#0A0A0A] px-4 py-1.5 rounded-full inline-flex shadow-[2px_2px_0_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0"
            >
              ← Back to Course
            </button>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1
                  className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mb-2 font-['Outfit'] tracking-tight"
                  style={{ letterSpacing: "-0.5px" }}
                >
                  Tests & Assessments
                </h1>
                <p className="text-[#0A0A0A]/60 text-[15px] font-medium font-['Inter']">
                  {role === "professor"
                    ? "Create, manage, and grade tests for your students"
                    : "View and complete tests assigned by your professor"}
                </p>
              </div>
              {role === "professor" && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 text-white px-6 py-3 rounded-full font-extrabold border-2 border-[#0A0A0A] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 shadow-[4px_4px_0_rgba(0,0,0,1)]"
                  style={{
                    background: "#FF4D5B",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  <Plus className="w-5 h-5 stroke-[3px]" />
                  Create Test
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tests List */}
        <div className="max-w-6xl mx-auto px-6 py-10">
          {displayedTests.length === 0 ? (
            <div className="text-center py-16 bg-[#FFFFFF] border-4 border-[#0A0A0A] rounded-2xl shadow-[6px_6px_0_rgba(0,0,0,1)]">
              <FileText className="w-16 h-16 text-[#0A0A0A]/20 mx-auto mb-4" />
              <h3 className="text-xl font-extrabold text-[#0A0A0A] mb-2 font-['Outfit']">
                No Tests Available
              </h3>
              <p className="text-[#0A0A0A]/50 font-medium mb-6 px-4">
                {role === "professor"
                  ? "Create your first test with AI-assisted question generation"
                  : "No tests have been published for this course yet."}
              </p>
              {role === "professor" && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 bg-[#FF4D5B] text-white px-6 py-3 border-2 border-[#0A0A0A] rounded-full font-extrabold shadow-[4px_4px_0_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all font-['Outfit']"
                >
                  <Sparkles className="w-5 h-5 fill-white" />
                  Create Your First Test
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {displayedTests.map((test) => (
                <div
                  key={test.id}
                  className={`rounded-2xl p-6 transition-all border-4 border-[#0A0A0A] shadow-[6px_6px_0_rgba(0,0,0,1)] bg-white hover:-translate-y-1 hover:shadow-[10px_10px_0_rgba(0,0,0,1)] ${getStatusBorder(test.status)}`}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <h3 className="text-xl font-extrabold text-[#0A0A0A] tracking-tight truncate font-['Outfit']">
                          {test.title}
                        </h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${getStatusBadge(test.status)}`}
                        >
                          {test.status}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-gray-100 text-gray-800 border-2 border-[#0A0A0A]/60 uppercase">
                          {test.test_type}
                        </span>
                      </div>
                      <p className="text-[14px] text-[#0A0A0A]/60 leading-relaxed font-medium font-['Inter']">
                        {test.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#0A0A0A]/70 mb-6 font-bold font-['Inter']">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#FF4D5B] stroke-[2.5]" />
                      {test.duration_minutes} min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-[#FF4D5B] stroke-[2.5]" />
                      {test.question_count || test.questions?.length || 0}{" "}
                      questions
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-[#FF4D5B] stroke-[2.5]" />
                      {test.total_marks || 0} marks
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t-2 border-[#0A0A0A]">
                    {role === "student" ? (
                      <button
                        onClick={() => navigate(`/tests/${test.id}`)}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 text-white rounded-xl text-[15px] font-extrabold border-2 border-[#0A0A0A] shadow-[4px_4px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                        style={{
                          background: "#FF4D5B",
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      >
                        <Play className="w-4 h-4 fill-white" />
                        Start Test
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            console.log(
                              "🔍 Preview button clicked, test:",
                              test,
                            );
                            handlePreviewTest(test.id);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-black border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all font-['Outfit']"
                        >
                          <Eye className="w-4 h-4 stroke-[2.5]" />
                          Preview
                        </button>

                        {test.status === "draft" &&
                          (test.question_count ||
                            test.questions?.length ||
                            0) === 0 && (
                            <button
                              onClick={() => {
                                console.log(
                                  " Generate questions clicked, test.id:",
                                  test.id,
                                );
                                handleGenerateQuestions(test.id);
                              }}
                              disabled={isGenerating}
                              className="flex items-center gap-2 px-4 py-2 bg-[#a855f7] hover:bg-[#9333ea] text-white border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all disabled:opacity-50 font-['Outfit']"
                            >
                              <Sparkles className="w-4 h-4 fill-white" />
                              AI Generate Questions
                            </button>
                          )}

                        {test.status === "draft" &&
                          (test.question_count || test.questions?.length || 0) >
                            0 && (
                            <button
                              onClick={() => handlePublishTest(test.id)}
                              className="flex items-center gap-2 px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all font-['Outfit']"
                            >
                              <Play className="w-4 h-4 fill-white" />
                              Publish Test
                            </button>
                          )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Preview Modal */}
        {showPreviewModal && previewTest && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#FCFCFC] border-4 border-[#0A0A0A] rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_#000] animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="sticky top-0 bg-[#FFFFFF] border-b-4 border-[#0A0A0A] px-8 py-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#0A0A0A] font-['Outfit']">
                    Test Preview
                  </h2>
                  <p className="text-sm font-bold text-[#0A0A0A]/50 mt-1 font-['Inter']">
                    {previewTest.title}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewTest(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full border-2 border-black/10 transition-colors"
                >
                  <X className="w-5 h-5 text-black stroke-[2.5]" />
                </button>
              </div>

              {/* Test Info */}
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
                    <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit'] uppercase">
                      Duration
                    </p>
                    <p className="text-lg font-extrabold text-[#0A0A0A] font-['Outfit']">
                      {previewTest.duration_minutes} min
                    </p>
                  </div>
                  <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
                    <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit'] uppercase">
                      Questions
                    </p>
                    <p className="text-lg font-extrabold text-[#0A0A0A] font-['Outfit']">
                      {previewTest.questions?.length || 0}
                    </p>
                  </div>
                  <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
                    <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit'] uppercase">
                      Total Marks
                    </p>
                    <p className="text-lg font-extrabold text-[#0A0A0A] font-['Outfit']">
                      {previewTest.total_marks || 0}
                    </p>
                  </div>
                </div>

                {/* Questions */}
                <div>
                  <h3 className="text-xl font-extrabold text-[#0A0A0A] mb-6 font-['Outfit']">
                    Questions ({previewTest.questions?.length || 0})
                  </h3>
                  {previewTest.questions?.length === 0 ? (
                    <p className="text-[#0A0A0A]/40 text-center py-10 font-bold font-['Outfit']">
                      No questions generated yet.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {previewTest.questions?.map((q: any, idx: number) => (
                        <div
                          key={q.id}
                          className="bg-white border-3 border-[#0A0A0A] rounded-2xl p-6 shadow-[5px_5px_0_rgba(0,0,0,0.95)]"
                        >
                          <div className="flex items-start gap-4 mb-4">
                            <span className="flex-shrink-0 w-8 h-8 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center text-sm font-extrabold shadow-[2px_2px_0_rgba(0,0,0,1)]">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#0A0A0A] font-extrabold text-base mb-3 font-['Outfit'] leading-snug">
                                {q.question_text}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs font-bold font-['Inter']">
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 rounded">
                                  {q.type.toUpperCase()}
                                </span>
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-300 rounded">
                                  {q.difficulty}
                                </span>
                                <span className="text-[#0A0A0A]/50">
                                  {q.marks} marks
                                </span>
                                {q.topic && (
                                  <span className="text-[#0A0A0A]/40">
                                    • {q.topic}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* MCQ Options */}
                          {q.type === "mcq" && q.options && (
                            <div className="mt-4 space-y-2 ml-0 sm:ml-12">
                              {q.options.map((opt: any) => (
                                <div
                                  key={opt.id}
                                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all ${
                                    opt.is_correct
                                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-[2px_2px_0_#059669]"
                                      : "bg-white border-gray-200 text-[#0A0A0A]"
                                  }`}
                                >
                                  <div
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                      opt.is_correct
                                        ? "border-emerald-500 bg-emerald-500"
                                        : "border-gray-300"
                                    }`}
                                  >
                                    {opt.is_correct && (
                                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                                    )}
                                  </div>
                                  <span className="text-sm font-['Inter']">
                                    {opt.text}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* True/False */}
                          {q.type === "true_false" && (
                            <div className="mt-4 ml-0 sm:ml-12 flex gap-3">
                              <span
                                className={`px-4 py-2 rounded-xl border-2 text-sm font-extrabold transition-all ${
                                  q.correct_answer === true
                                    ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[2px_2px_0_#059669]"
                                    : "bg-white border-gray-200 text-[#0A0A0A]/40"
                                }`}
                              >
                                True
                              </span>
                              <span
                                className={`px-4 py-2 rounded-xl border-2 text-sm font-extrabold transition-all ${
                                  q.correct_answer === false
                                    ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[2px_2px_0_#059669]"
                                    : "bg-white border-gray-200 text-[#0A0A0A]/40"
                                }`}
                              >
                                False
                              </span>
                            </div>
                          )}

                          {/* Explanation */}
                          {q.explanation && (
                            <div className="mt-4 ml-0 sm:ml-12 p-3 bg-blue-50 border-2 border-blue-500/30 rounded-xl">
                              <p className="text-[11px] font-extrabold text-blue-900/60 uppercase mb-0.5 font-['Outfit']">
                                Explanation
                              </p>
                              <p className="text-sm font-medium text-blue-950 font-['Inter']">
                                {q.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Test Wizard Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#FCFCFC] border-4 border-[#0A0A0A] rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_#000] animate-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="sticky top-0 bg-[#FFFFFF] border-b-4 border-[#0A0A0A] px-8 py-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#0A0A0A] font-['Outfit']">
                    Create New Test
                  </h2>
                  <div className="flex items-center gap-2 mt-3 font-['Outfit']">
                    {[1, 2, 3].map((step) => (
                      <div key={step} className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 border-black shadow-[1.5px_1.5px_0_#000] ${
                            step <= createStep
                              ? "bg-[#FF4D5B] text-white"
                              : "bg-gray-100 text-gray-400 border-gray-300 shadow-none"
                          }`}
                        >
                          {step}
                        </div>
                        {step < 3 && (
                          <div
                            className={`w-8 h-0.5 ${step < createStep ? "bg-[#FF4D5B]" : "bg-gray-200"}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={resetModal}
                  className="p-2 hover:bg-gray-100 rounded-full border-2 border-black/10 transition-colors"
                >
                  <X className="w-5 h-5 text-black stroke-[2.5]" />
                </button>
              </div>

              {/* Step 1: Basic Details */}
              {createStep === 1 && (
                <div className="p-8 space-y-6">
                  <h3 className="text-lg font-extrabold text-[#0A0A0A] flex items-center gap-2 font-['Outfit']">
                    <FileText className="w-5 h-5 text-[#FF4D5B]" />
                    Test Details
                  </h3>

                  <div>
                    <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">
                      Test Title *
                    </label>
                    <input
                      type="text"
                      value={newTest.title}
                      onChange={(e) =>
                        setNewTest({ ...newTest, title: e.target.value })
                      }
                      placeholder="e.g., Midterm Exam - SQL Fundamentals"
                      className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] placeholder:text-black/35 focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">
                      Description
                    </label>
                    <textarea
                      value={newTest.description}
                      onChange={(e) =>
                        setNewTest({ ...newTest, description: e.target.value })
                      }
                      placeholder="What topics will this test cover?"
                      rows={3}
                      className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] placeholder:text-black/35 focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] resize-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        value={newTest.duration_minutes}
                        onChange={(e) =>
                          setNewTest({
                            ...newTest,
                            duration_minutes: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">
                        Passing %
                      </label>
                      <input
                        type="number"
                        value={newTest.passing_percentage}
                        onChange={(e) =>
                          setNewTest({
                            ...newTest,
                            passing_percentage: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">
                        Type
                      </label>
                      <div className="relative">
                        <select
                          value={newTest.test_type}
                          onChange={(e) =>
                            setNewTest({
                              ...newTest,
                              test_type: e.target.value,
                            })
                          }
                          className="w-full appearance-none bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 pr-10 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] transition-all cursor-pointer font-bold"
                        >
                          <option value="assignment">Assignment</option>
                          <option value="quiz">Quiz</option>
                          <option value="exam">Exam</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <svg
                            className="w-4 h-4 text-black"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2.5}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6 border-t-2 border-[#0A0A0A] font-['Outfit']">
                    <button
                      onClick={resetModal}
                      className="flex-1 py-3 bg-white hover:bg-gray-50 text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTest}
                      disabled={!newTest.title}
                      className="flex-1 py-3 disabled:opacity-50 text-white rounded-xl font-extrabold border-2 border-[#0A0A0A] shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                      style={{ background: "#FF4D5B" }}
                    >
                      Next: Select Content
                      <ChevronRight className="w-4 h-4 stroke-[3px]" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Select Documents & Topics */}
              {createStep === 2 && (
                <div className="p-8 space-y-6">
                  <h3 className="text-lg font-extrabold text-[#0A0A0A] flex items-center gap-2 font-['Outfit']">
                    <Target className="w-5 h-5 text-[#FF4D5B]" />
                    Select Content for Questions
                  </h3>
                  <p className="text-sm font-medium text-[#0A0A0A]/55 font-['Inter']">
                    Choose which documents and topics the AI should focus on
                    when generating questions. Leave empty to use everything.
                  </p>

                  {/* Documents Selection */}
                  <div>
                    <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-3 flex items-center gap-2 font-['Outfit']">
                      <BookOpen className="w-4 h-4" />
                      Documents ({documents.length})
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {documents.filter((d) => d.status === "ready").length ===
                      0 ? (
                        <p className="text-sm font-bold text-[#0A0A0A]/30 py-4 text-center">
                          No processed documents available.
                        </p>
                      ) : (
                        documents
                          .filter((d) => d.status === "ready")
                          .map((doc) => (
                            <button
                              key={doc.id}
                              onClick={() => toggleDocument(doc.id)}
                              className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${
                                newTest.selected_documents.includes(doc.id)
                                  ? "bg-blue-50 border-blue-500 shadow-[2px_2px_0_#3b82f6]"
                                  : "bg-white border-[#0A0A0A] hover:bg-gray-50"
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                  newTest.selected_documents.includes(doc.id)
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-[#0A0A0A]"
                                }`}
                              >
                                {newTest.selected_documents.includes(
                                  doc.id,
                                ) && (
                                  <CheckCircle className="w-3.5 h-3.5 text-white" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-extrabold text-[#0A0A0A] truncate font-['Outfit']">
                                  {doc.filename}
                                </p>
                                <p className="text-xs font-bold text-[#0A0A0A]/40 font-['Inter']">
                                  {doc.chunk_count || 0} chunks
                                </p>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Topics Selection */}
                  <div>
                    <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-3 flex items-center gap-2 font-['Outfit']">
                      <Brain className="w-4 h-4" />
                      Topics ({graphNodes.length})
                    </label>
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                      {graphNodes.length === 0 ? (
                        <p className="text-sm font-bold text-[#0A0A0A]/30 py-4 text-center w-full font-['Outfit']">
                          No topics available. Generate a knowledge graph first.
                        </p>
                      ) : (
                        graphNodes.map((node) => (
                          <button
                            key={node.id}
                            onClick={() => toggleTopic(node.id)}
                            className={`px-4 py-2 rounded-full text-sm font-extrabold border-2 transition-all ${
                              newTest.selected_topics.includes(node.id)
                                ? "bg-purple-50 border-purple-500 text-purple-950 shadow-[2px_2px_0_#9333ea]"
                                : "bg-white border-[#0A0A0A] text-[#0A0A0A]/60 hover:bg-gray-50"
                            }`}
                          >
                            {node.label}
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Question Settings */}
                  <div>
                    <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-3 font-['Outfit']">
                      Question Settings
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit']">
                          Question Count
                        </label>
                        <input
                          type="number"
                          value={newTest.question_count}
                          onChange={(e) =>
                            setNewTest({
                              ...newTest,
                              question_count: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-2.5 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit']">
                          Question Types
                        </label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {[
                            { id: "mcq", label: "MCQ" },
                            { id: "true_false", label: "True/False" },
                            { id: "short_answer", label: "Short Answer" },
                          ].map((type) => (
                            <button
                              key={type.id}
                              onClick={() => toggleQuestionType(type.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border-2 transition-all ${
                                newTest.question_types.includes(type.id)
                                  ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[2px_2px_0_#059669]"
                                  : "bg-white border-[#0A0A0A] text-[#0A0A0A]/40 hover:bg-gray-50"
                              }`}
                            >
                              {type.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-6 border-t-2 border-[#0A0A0A] font-['Outfit']">
                    <button
                      onClick={() => setCreateStep(1)}
                      className="flex-1 py-3 bg-white hover:bg-gray-50 text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                    >
                      <ChevronLeft className="w-4 h-4 stroke-[3px]" />
                      Back
                    </button>
                    <button
                      onClick={() => handleGenerateQuestions()}
                      disabled={isGenerating}
                      className="flex-1 py-3 bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-50 text-white rounded-xl font-extrabold border-2 border-[#0A0A0A] shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                    >
                      {isGenerating ? (
                        <>
                          <Sparkles className="w-4 h-4 animate-spin fill-white" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 fill-white" />
                          Generate Questions with AI
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Success */}
              {createStep === 3 && (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-emerald-100 border-3 border-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
                    <CheckCircle className="w-8 h-8 text-emerald-600 stroke-[3px]" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-[#0A0A0A] mb-2 font-['Outfit']">
                    Questions Generated!
                  </h3>
                  <p className="text-[#0A0A0A]/50 font-bold mb-8 font-['Outfit']">
                    Your test has been created with AI-generated questions.
                    Review and publish when ready.
                  </p>

                  <div className="flex gap-3 justify-center font-['Outfit']">
                    <button
                      onClick={resetModal}
                      className="px-8 py-3 bg-white hover:bg-gray-50 text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        resetModal();
                        navigate(`/tests/${generatedTestId}`);
                      }}
                      className="px-8 py-3 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                    >
                      View Test
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
}
