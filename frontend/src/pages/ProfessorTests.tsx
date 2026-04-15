import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  FileText, Plus, Sparkles, Clock, CheckCircle, AlertCircle,
  Eye, Trash2, Play, BarChart3, ChevronRight, ChevronLeft,
  BookOpen, Brain, Target, X
} from 'lucide-react';
import { testsApi, documentsApi, graphsApi } from '../api';

export default function ProfessorTests() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { token } = useAuthStore();

  const [tests, setTests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTest, setPreviewTest] = useState(null);
  const [createStep, setCreateStep] = useState(1); // 1: details, 2: select content, 3: generate
  const [documents, setDocuments] = useState([]);
  const [graphNodes, setGraphNodes] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestId, setGeneratedTestId] = useState(null);

  const [newTest, setNewTest] = useState({
    title: '',
    description: '',
    duration_minutes: 60,
    passing_percentage: 40,
    test_type: 'assignment',
    question_count: 10,
    question_types: ['mcq', 'true_false', 'short_answer'],
    selected_documents: [],
    selected_topics: []
  });

  useEffect(() => {
    if (token && courseId) {
      loadTests();
      loadCourseData();
    } else if (!token) {
      // Token not available - redirect to login
      console.warn('No token available, redirecting to login');
      navigate('/login/professor');
    }
  }, [courseId, token]);

  const loadTests = async () => {
    if (!token) return;

    try {
      const res = await testsApi.getByCourse(courseId || '');
      setTests(res.data.tests || []);
    } catch (err: any) {
      console.error('Failed to load tests:', err);
      // If 401, token may be expired - clear auth and redirect
      if (err.response?.status === 401) {
        console.warn('Token expired, clearing auth');
        useAuthStore.getState().logout();
        navigate('/login/professor');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadCourseData = async () => {
    if (!token) return;

    try {
      // Load documents
      const docsRes = await documentsApi.list(courseId || '');
      setDocuments(docsRes.data || []);

      // Load graph nodes (topics)
      const graphRes = await graphsApi.getByCourse(courseId || '');
      // Graph endpoint returns array of graphs, get nodes from first one
      if (graphRes.data && graphRes.data.length > 0 && graphRes.data[0].nodes) {
        setGraphNodes(graphRes.data[0].nodes);
      }
    } catch (err: any) {
      console.error('Failed to load course data:', err);
      // If 401, token may be expired
      if (err.response?.status === 401) {
        console.warn('Token expired, clearing auth');
        useAuthStore.getState().logout();
        navigate('/login/professor');
      }
    }
  };

  const resetModal = () => {
    setShowCreateModal(false);
    setCreateStep(1);
    setGeneratedTestId(null);
    setNewTest({
      title: '',
      description: '',
      duration_minutes: 60,
      passing_percentage: 40,
      test_type: 'assignment',
      question_count: 10,
      question_types: ['mcq', 'true_false', 'short_answer'],
      selected_documents: [],
      selected_topics: []
    });
  };

  const toggleDocument = (docId) => {
    setNewTest(prev => ({
      ...prev,
      selected_documents: prev.selected_documents.includes(docId)
        ? prev.selected_documents.filter(id => id !== docId)
        : [...prev.selected_documents, docId]
    }));
  };

  const toggleTopic = (topicId) => {
    setNewTest(prev => ({
      ...prev,
      selected_topics: prev.selected_topics.includes(topicId)
        ? prev.selected_topics.filter(id => id !== topicId)
        : [...prev.selected_topics, topicId]
    }));
  };

  const toggleQuestionType = (type) => {
    setNewTest(prev => ({
      ...prev,
      question_types: prev.question_types.includes(type)
        ? prev.question_types.filter(t => t !== type)
        : [...prev.question_types, type]
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
        test_type: newTest.test_type
      });

      console.log('Test creation response:', res.data);

      // Extract test ID from response
      const testId = res.data.test?.id || res.data.test_id;
      if (!testId) {
        console.error('No test ID in response:', res.data);
        alert('Failed to create test: No test ID returned');
        return;
      }

      setGeneratedTestId(testId);
      setCreateStep(2);
    } catch (err: any) {
      console.error('Failed to create test:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to create test';
      alert(errorMessage);

      if (err.response?.status === 401) {
        useAuthStore.getState().logout();
        navigate('/login/professor');
      }
    }
  };

  const handleGenerateQuestions = async () => {
    if (!token || !generatedTestId) {
      console.error('Missing token or test ID:', { token: !!token, generatedTestId });
      alert('Test ID is missing. Please create the test again.');
      return;
    }

    try {
      setIsGenerating(true);

      // Build document context
      const selectedDocs = documents.filter(d => newTest.selected_documents.includes(d.id));
      const docContext = selectedDocs.length > 0
        ? `Focus on these documents:\n${selectedDocs.map(d => `- ${d.filename}`).join('\n')}`
        : 'Use all available course materials.';

      // Build topics context
      const selectedTopics = graphNodes.filter(n => newTest.selected_topics.includes(n.id));
      const topicsList = selectedTopics.length > 0
        ? selectedTopics.map(t => t.label)
        : graphNodes.map(n => n.label);

      console.log('Generating questions for test:', generatedTestId);

      await testsApi.generateQuestions(generatedTestId, {
        course_id: courseId,
        question_count: newTest.question_count,
        question_types: newTest.question_types,
        document_context: docContext,
        topics_filter: topicsList
      });

      setCreateStep(3);
      loadTests();
    } catch (err: any) {
      console.error('Failed to generate questions:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to generate questions';
      alert(errorMessage);

      if (err.response?.status === 401) {
        useAuthStore.getState().logout();
        navigate('/login/professor');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreviewTest = async (testId) => {
    try {
      console.log('🔍 Previewing test:', testId);

      // Fetch specific test with full details
      const res = await testsApi.get(testId);

      console.log('✅ Test data received:', {
        id: res.data.test?.id,
        title: res.data.test?.title,
        questionCount: res.data.test?.questions?.length,
        questions: res.data.test?.questions
      });

      setPreviewTest(res.data.test);
      setShowPreviewModal(true);
    } catch (err) {
      console.error('❌ Failed to preview test:', err);
      alert('Failed to load test details');
    }
  };

  const handlePublishTest = async (testId) => {
    try {
      await testsApi.publish(testId);
      loadTests();
    } catch (err) {
      console.error('Failed to publish test:', err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'bg-yellow-500/20 text-yellow-400';
      case 'published': return 'bg-green-500/20 text-green-400';
      case 'completed': return 'bg-blue-500/20 text-blue-400';
      default: return 'bg-white/10 text-white/40';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-white/40">Loading tests...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="text-white/30 hover:text-white/60 text-sm mb-4 transition-colors"
          >
            ← Back to Course
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white mb-2">Tests & Assessments</h1>
              <p className="text-white/40 text-sm">Create, manage, and grade tests for your students</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-3 rounded-xl font-semibold transition-all"
            >
              <Plus className="w-5 h-5" />
              Create Test
            </button>
          </div>
        </div>
      </div>

      {/* Tests List */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {tests.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-white/10 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white/60 mb-2">No Tests Yet</h3>
            <p className="text-white/30 mb-6">Create your first test with AI-assisted question generation</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white px-6 py-3 rounded-xl font-semibold transition-all"
            >
              <Sparkles className="w-5 h-5" />
              Create Your First Test
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {tests.map((test) => (
              <div
                key={test.id}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">{test.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(test.status)}`}>
                        {test.status.toUpperCase()}
                      </span>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                        {test.test_type}
                      </span>
                    </div>
                    <p className="text-sm text-white/40">{test.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm text-white/30 mb-4">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {test.duration_minutes} min
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    {test.question_count || test.questions?.length || 0} questions
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4" />
                    {test.total_marks || 0} marks
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      console.log('🔍 Preview button clicked, test:', test);
                      handlePreviewTest(test.id);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm transition-all"
                  >
                    <Eye className="w-4 h-4" />
                    Preview
                  </button>

                  {test.status === 'draft' && (test.question_count || test.questions?.length || 0) === 0 && (
                    <button
                      onClick={() => {
                        console.log(' Generate questions clicked, test.id:', test.id);
                        handleGenerateQuestions(test.id);
                      }}
                      disabled={isGenerating}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg text-sm transition-all disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      AI Generate Questions
                    </button>
                  )}

                  {test.status === 'draft' && (test.question_count || test.questions?.length || 0) > 0 && (
                    <button
                      onClick={() => handlePublishTest(test.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg text-sm transition-all"
                    >
                      <Play className="w-4 h-4" />
                      Publish Test
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Preview Modal */}
      {showPreviewModal && previewTest && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#1A1A1A] border-b border-white/[0.06] px-8 py-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-white">Test Preview</h2>
                <p className="text-sm text-white/40 mt-1">{previewTest.title}</p>
              </div>
              <button onClick={() => { setShowPreviewModal(false); setPreviewTest(null); }} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            {/* Test Info */}
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-white/30 mb-1">Duration</p>
                  <p className="text-lg font-semibold text-white">{previewTest.duration_minutes} min</p>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-white/30 mb-1">Questions</p>
                  <p className="text-lg font-semibold text-white">{previewTest.questions?.length || 0}</p>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                  <p className="text-xs text-white/30 mb-1">Total Marks</p>
                  <p className="text-lg font-semibold text-white">{previewTest.total_marks || 0}</p>
                </div>
              </div>

              {/* Questions */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Questions ({previewTest.questions?.length || 0})</h3>
                {previewTest.questions?.length === 0 ? (
                  <p className="text-white/30 text-center py-8">No questions generated yet</p>
                ) : (
                  <div className="space-y-4">
                    {previewTest.questions?.map((q, idx) => (
                      <div key={q.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6">
                        <div className="flex items-start gap-3 mb-3">
                          <span className="flex-shrink-0 w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center text-sm font-bold">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <p className="text-white font-medium mb-2">{q.question_text}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">{q.type.toUpperCase()}</span>
                              <span className="px-2 py-1 bg-white/5 text-white/40 rounded">{q.difficulty}</span>
                              <span className="text-white/30">{q.marks} marks</span>
                              {q.topic && <span className="text-white/30">• {q.topic}</span>}
                            </div>
                          </div>
                        </div>

                        {/* MCQ Options */}
                        {q.type === 'mcq' && q.options && (
                          <div className="mt-3 space-y-2 ml-11">
                            {q.options.map(opt => (
                              <div key={opt.id} className={`flex items-center gap-3 px-4 py-2 rounded-lg ${opt.is_correct ? 'bg-green-500/10 border border-green-500/30' : 'bg-white/[0.02]'}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${opt.is_correct ? 'border-green-400 bg-green-400' : 'border-white/20'}`}>
                                  {opt.is_correct && <CheckCircle className="w-3 h-3 text-white" />}
                                </div>
                                <span className={`text-sm ${opt.is_correct ? 'text-green-300' : 'text-white/60'}`}>{opt.text}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* True/False */}
                        {q.type === 'true_false' && (
                          <div className="mt-3 ml-11 flex gap-2">
                            <span className={`px-4 py-2 rounded-lg text-sm ${q.correct_answer === true ? 'bg-green-500/20 text-green-300' : 'bg-white/5 text-white/40'}`}>
                              True
                            </span>
                            <span className={`px-4 py-2 rounded-lg text-sm ${q.correct_answer === false ? 'bg-green-500/20 text-green-300' : 'bg-white/5 text-white/40'}`}>
                              False
                            </span>
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="mt-3 ml-11 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                            <p className="text-xs text-blue-300/60 mb-1">Explanation</p>
                            <p className="text-sm text-white/60">{q.explanation}</p>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#1A1A1A] border-b border-white/[0.06] px-8 py-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-semibold text-white">Create New Test</h2>
                <div className="flex items-center gap-2 mt-2">
                  {[1, 2, 3].map(step => (
                    <div key={step} className="flex items-center gap-2">
                       <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                        step <= createStep ? 'bg-[var(--accent)] text-white' : 'bg-white/10 text-white/30'
                      }`}>
                        {step}
                      </div>
                      {step < 3 && <div className={`w-8 h-0.5 ${step < createStep ? 'bg-[var(--accent)]' : 'bg-white/10'}`} />}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={resetModal} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            {/* Step 1: Basic Details */}
            {createStep === 1 && (
              <div className="p-8 space-y-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Test Details
                </h3>

                <div>
                  <label className="block text-sm text-white/40 mb-2">Test Title *</label>
                  <input
                    type="text"
                    value={newTest.title}
                    onChange={(e) => setNewTest({...newTest, title: e.target.value})}
                    placeholder="e.g., Midterm Exam - SQL Fundamentals"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-white/40 mb-2">Description</label>
                  <textarea
                    value={newTest.description}
                    onChange={(e) => setNewTest({...newTest, description: e.target.value})}
                    placeholder="What topics will this test cover?"
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-white/40 mb-2">Duration (min)</label>
                    <input
                      type="number"
                      value={newTest.duration_minutes}
                      onChange={(e) => setNewTest({...newTest, duration_minutes: parseInt(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/40 mb-2">Passing %</label>
                    <input
                      type="number"
                      value={newTest.passing_percentage}
                      onChange={(e) => setNewTest({...newTest, passing_percentage: parseInt(e.target.value)})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/40 mb-2">Type</label>
                    <div className="relative">
                      <select
                        value={newTest.test_type}
                        onChange={(e) => setNewTest({...newTest, test_type: e.target.value})}
                        className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-sm text-white focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
                      >
                        <option value="assignment" className="bg-[#1A1A1A] text-white">Assignment</option>
                        <option value="quiz" className="bg-[#1A1A1A] text-white">Quiz</option>
                        <option value="exam" className="bg-[#1A1A1A] text-white">Exam</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                        <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={resetModal}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateTest}
                    disabled={!newTest.title}
                    className="flex-1 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    Next: Select Content
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Select Documents & Topics */}
            {createStep === 2 && (
              <div className="p-8 space-y-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-400" />
                  Select Content for Questions
                </h3>
                <p className="text-sm text-white/40">Choose which documents and topics the AI should focus on when generating questions. Leave empty to use everything.</p>

                {/* Documents Selection */}
                <div>
                  <label className="block text-sm text-white/40 mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Documents ({documents.length})
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {documents.filter(d => d.status === 'ready').length === 0 ? (
                      <p className="text-sm text-white/20 py-4 text-center">No processed documents available</p>
                    ) : (
                      documents.filter(d => d.status === 'ready').map(doc => (
                        <button
                          key={doc.id}
                          onClick={() => toggleDocument(doc.id)}
                          className={`w-full p-3 rounded-lg border text-left transition-all flex items-center gap-3 ${
                            newTest.selected_documents.includes(doc.id)
                              ? 'bg-blue-500/20 border-blue-500/40'
                              : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            newTest.selected_documents.includes(doc.id) ? 'border-blue-400 bg-blue-400' : 'border-white/20'
                          }`}>
                            {newTest.selected_documents.includes(doc.id) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{doc.filename}</p>
                            <p className="text-xs text-white/30">{doc.chunk_count || 0} chunks</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Topics Selection */}
                <div>
                  <label className="block text-sm text-white/40 mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Topics ({graphNodes.length})
                  </label>
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                    {graphNodes.length === 0 ? (
                      <p className="text-sm text-white/20 py-4 text-center w-full">No topics available. Generate a knowledge graph first.</p>
                    ) : (
                      graphNodes.map(node => (
                        <button
                          key={node.id}
                          onClick={() => toggleTopic(node.id)}
                          className={`px-4 py-2 rounded-full text-sm border transition-all ${
                            newTest.selected_topics.includes(node.id)
                              ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                              : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:bg-white/[0.04]'
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
                  <label className="block text-sm text-white/40 mb-3">Question Settings</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-white/30 mb-1">Question Count</label>
                      <input
                        type="number"
                        value={newTest.question_count}
                        onChange={(e) => setNewTest({...newTest, question_count: parseInt(e.target.value)})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/30 mb-1">Question Types</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {[
                          { id: 'mcq', label: 'MCQ' },
                          { id: 'true_false', label: 'True/False' },
                          { id: 'short_answer', label: 'Short Answer' }
                        ].map(type => (
                          <button
                            key={type.id}
                            onClick={() => toggleQuestionType(type.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                              newTest.question_types.includes(type.id)
                                ? 'bg-green-500/20 border-green-500/40 text-green-300'
                                : 'bg-white/5 border-white/10 text-white/40'
                            }`}
                          >
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => setCreateStep(1)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleGenerateQuestions}
                    disabled={isGenerating}
                    className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Sparkles className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
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
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Questions Generated!</h3>
                <p className="text-white/40 mb-8">Your test has been created with AI-generated questions. Review and publish when ready.</p>

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={resetModal}
                    className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      resetModal();
                      navigate(`/tests/${generatedTestId}`);
                    }}
                    className="px-8 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-semibold transition-all"
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
