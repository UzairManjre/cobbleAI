import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { FileText, Plus, Sparkles } from "lucide-react";
import { testsApi, documentsApi, graphsApi } from "../../api";

import { TestCard } from "../../components/tests/TestCard";
import { PreviewTestModal } from "../../components/tests/PreviewTestModal";
import { CreateTestWizard } from "../../components/tests/CreateTestWizard";

export default function ProfessorTests() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { token, role } = useAuthStore();
  const addToast = useToastStore((state) => state.addToast);

  const [tests, setTests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  
  const [previewTest, setPreviewTest] = useState<any>(null);
  
  const [documents, setDocuments] = useState<any[]>([]);
  const [graphNodes, setGraphNodes] = useState<any[]>([]);
  const [isGeneratingMap, setIsGeneratingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (token && courseId) {
      loadTests();
      loadCourseData();
    } else if (!token) {
      navigate(role === "student" ? "/login/student" : "/login/professor");
    }
  }, [courseId, token]);

  const loadTests = async () => {
    if (!token) return;
    try {
      const res = await testsApi.getByCourse(courseId || "");
      setTests(res.data.tests || []);
    } catch (err: any) {
      if (err.response?.status === 401) {
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
      const docsRes = await documentsApi.list(courseId || "");
      setDocuments(docsRes.data || []);
      const graphRes = await graphsApi.getByCourse(courseId || "");
      if (graphRes.data && graphRes.data.length > 0 && graphRes.data[0].nodes) {
        setGraphNodes(graphRes.data[0].nodes);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        useAuthStore.getState().logout();
        navigate(role === "student" ? "/login/student" : "/login/professor");
      }
    }
  };

  const handlePreviewTest = async (testId: string) => {
    try {
      const res = await testsApi.get(testId);
      setPreviewTest(res.data.test);
      setShowPreviewModal(true);
    } catch (err) {
      addToast("Failed to load test details", "error");
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

  const handleCreateTestSubmit = async (newTest: any) => {
    try {
      const res = await testsApi.create({
        course_id: courseId,
        title: newTest.title,
        description: newTest.description,
        duration_minutes: newTest.duration_minutes,
        passing_percentage: newTest.passing_percentage,
        test_type: newTest.test_type,
      });
      return res.data.test?.id || res.data.test_id;
    } catch (err: any) {
      addToast(err.response?.data?.detail || "Failed to create test", "error");
      return null;
    }
  };

  const handleGenerateQuestionsSubmit = async (testId: string, newTest: any) => {
    try {
      setIsGeneratingMap(prev => ({ ...prev, [testId]: true }));
      const selectedDocs = documents.filter((d) => newTest.selected_documents.includes(d.id));
      const docContext = selectedDocs.length > 0 ? `Focus on these documents:\n${selectedDocs.map((d) => `- ${d.filename}`).join("\n")}` : "Use all available course materials.";
      const selectedTopics = graphNodes.filter((n) => newTest.selected_topics.includes(n.id));
      const topicsList = selectedTopics.length > 0 ? selectedTopics.map((t) => t.label) : graphNodes.map((n) => n.label);

      await testsApi.generateQuestions(testId, {
        course_id: courseId,
        question_count: newTest.question_count,
        question_types: newTest.question_types,
        document_context: docContext,
        topics_filter: topicsList,
      });
      loadTests();
    } catch (err: any) {
      addToast(err.response?.data?.detail || "Failed to generate questions", "error");
    } finally {
      setIsGeneratingMap(prev => ({ ...prev, [testId]: false }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] flex items-center justify-center font-['Outfit']">
        <div className="text-[#0A0A0A]/40 font-bold text-lg">Loading tests...</div>
      </div>
    );
  }

  const displayedTests = role === "professor" ? tests : tests.filter((t: any) => t.status === "published");

  return (
    <div className="min-h-screen bg-[#FCFCFC] text-[#0A0A0A]">
      <div className="border-b-4 border-[#0A0A0A] bg-[#FFFFFF] shadow-[0_4px_0_rgba(0,0,0,0.05)]">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate(role === "professor" ? `/professor/courses/${courseId}` : `/student/courses/${courseId}`)}
            className="text-[#0A0A0A]/70 hover:text-black mb-6 transition-colors flex items-center gap-2 text-sm font-extrabold font-['Outfit'] border-2 border-[#0A0A0A] px-4 py-1.5 rounded-full shadow-[2px_2px_0_rgba(0,0,0,1)] hover:-translate-x-0.5 hover:-translate-y-0.5"
          >
            ← Back to Course
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mb-2 font-['Outfit'] tracking-tight" style={{ letterSpacing: "-0.5px" }}>
                Tests & Assessments
              </h1>
              <p className="text-[#0A0A0A]/60 text-[15px] font-medium font-['Inter']">
                {role === "professor" ? "Create, manage, and grade tests for your students" : "View and complete tests assigned by your professor"}
              </p>
            </div>
            {role === "professor" && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 text-white px-6 py-3 rounded-full font-extrabold border-2 border-[#0A0A0A] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 shadow-[4px_4px_0_rgba(0,0,0,1)]"
                style={{ background: "#FF4D5B", fontFamily: "'Outfit', sans-serif" }}
              >
                <Plus className="w-5 h-5 stroke-[3px]" />
                Create Test
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {displayedTests.length === 0 ? (
          <div className="text-center py-16 bg-[#FFFFFF] border-4 border-[#0A0A0A] rounded-2xl shadow-[6px_6px_0_rgba(0,0,0,1)]">
            <FileText className="w-16 h-16 text-[#0A0A0A]/20 mx-auto mb-4" />
            <h3 className="text-xl font-extrabold text-[#0A0A0A] mb-2 font-['Outfit']">No Tests Available</h3>
            <p className="text-[#0A0A0A]/50 font-medium mb-6 px-4">
              {role === "professor" ? "Create your first test with AI-assisted question generation" : "No tests have been published for this course yet."}
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
              <TestCard
                key={test.id}
                test={test}
                role={role}
                isGenerating={!!isGeneratingMap[test.id]}
                onPreview={handlePreviewTest}
                onGenerate={(id) => handleGenerateQuestionsSubmit(id, {
                    question_count: 10,
                    question_types: ["mcq", "true_false", "short_answer"],
                    selected_documents: [],
                    selected_topics: []
                })}
                onPublish={handlePublishTest}
              />
            ))}
          </div>
        )}
      </div>

      {showPreviewModal && previewTest && (
        <PreviewTestModal
          previewTest={previewTest}
          onClose={() => setShowPreviewModal(false)}
        />
      )}

      {showCreateModal && (
        <CreateTestWizard
          courseId={courseId || ""}
          documents={documents}
          graphNodes={graphNodes}
          onClose={() => setShowCreateModal(false)}
          onCreateTest={handleCreateTestSubmit}
          onGenerateQuestions={handleGenerateQuestionsSubmit}
          onViewTest={(id) => navigate(`/tests/${id}`)}
        />
      )}
    </div>
  );
}
