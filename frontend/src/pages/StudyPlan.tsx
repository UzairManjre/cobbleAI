import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  BookOpen, CheckCircle, Clock, Target, Brain, Code, MessageSquare,
  Lightbulb, FileText, ChevronDown, Award,
  RefreshCw, AlertCircle, Sparkles, X, ArrowLeft
} from 'lucide-react';
import { studyPlansApi, coursesApi } from '../api';
import ReactMarkdown from 'react-markdown';

interface Exercise {
  id: string;
  type: 'code' | 'quiz' | 'hands-on' | 'reading' | 'reflection';
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  solution?: string;
  hints: string[];
  estimated_time_minutes: number;
}

interface TopicPlan {
  id: string;
  order: number;
  node_id: string;
  node_label: string;
  node_description?: string;
  estimated_time_minutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  prerequisites: string[];
  learning_objectives: string[];
  key_concepts: string[];
  exercises: Exercise[];
  document_references: string[];
  notes?: string;
}

interface StudyPlan {
  id: string;
  course_id: string;
  graph_id: string;
  title: string;
  description: string;
  total_topics: number;
  estimated_duration_hours: number;
  topics: TopicPlan[];
  status: 'draft' | 'active' | 'completed' | 'archived';
  created_at: string;
}

interface StudyProgress {
  id: string;
  study_plan_id: string;
  completed_topics: string[];
  completed_exercises: string[];
  time_spent_minutes: number;
  current_topic_index: number;
}

const ExerciseIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'code': return <Code className="w-4 h-4" />;
    case 'quiz': return <MessageSquare className="w-4 h-4" />;
    case 'hands-on': return <Lightbulb className="w-4 h-4" />;
    case 'reading': return <FileText className="w-4 h-4" />;
    case 'reflection': return <Brain className="w-4 h-4" />;
    default: return <BookOpen className="w-4 h-4" />;
  }
};

const DifficultyBadge = ({ difficulty }: { difficulty: string }) => {
  const colors = {
    easy: 'bg-emerald-100 text-emerald-800 border-emerald-400',
    medium: 'bg-amber-100 text-amber-800 border-amber-400',
    hard: 'bg-red-100 text-red-800 border-red-400'
  };
  return (
    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase border-2 tracking-wide ${colors[difficulty as keyof typeof colors]}`}>
      {difficulty}
    </span>
  );
};

export default function StudyPlanView() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { token, role } = useAuthStore();

  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [progress, setProgress] = useState<StudyProgress | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [topicPlanNodeId, setTopicPlanNodeId] = useState<string | null>(null);
  const [topicPlan, setTopicPlan] = useState<any>(null);
  const [isGeneratingTopicPlan, setIsGeneratingTopicPlan] = useState(false);
  const [showTopicPlanModal, setShowTopicPlanModal] = useState(false);

  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  useEffect(() => {
    loadPlan();
  }, [courseId]);

  const loadPlan = async () => {
    if (!token || !courseId) return;

    try {
      setIsLoading(true);
      setError(null);
      const res = await studyPlansApi.getActive(courseId);

      if (res.data.study_plan) {
        setPlan(res.data.study_plan);
        setProgress(res.data.progress);
      } else {
        setPlan(null);
        setProgress(null);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError(err.response?.data?.detail || 'Failed to load study plan');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!token || !courseId) return;

    try {
      setIsGenerating(true);
      setError(null);

      // First get the course to find its graph
      const courseRes = await coursesApi.get(courseId);

      const graphId = courseRes.data.graph_id;
      if (!graphId) {
        setError('No knowledge graph found for this course. Please generate one from Course Detail.');
        return;
      }

      // Check if plan exists - if so, regenerate; otherwise generate
      const existingRes = await studyPlansApi.getActive(courseId);

      const endpoint = existingRes.data.study_plan ? 'regenerate' : 'generate';

      const res = await (endpoint === 'regenerate' 
        ? studyPlansApi.regenerate(courseId, graphId)
        : studyPlansApi.generate(courseId, graphId));

      setPlan(res.data.study_plan);
      setProgress(res.data.progress);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate study plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteTopic = async (nodeId: string) => {
    if (!token || !plan) return;

    try {
      const res = await studyPlansApi.completeTopic(plan.id, nodeId);
      setProgress(res.data.progress);
    } catch (err) {
      console.error('Failed to complete topic:', err);
    }
  };

  const handleCompleteExercise = async (exerciseId: string) => {
    if (!token || !plan) return;

    try {
      const res = await studyPlansApi.completeExercise(plan.id, exerciseId);
      setProgress(res.data.progress);
    } catch (err) {
      console.error('Failed to complete exercise:', err);
    }
  };

  const handleGenerateTopicPlan = async (nodeId: string) => {
    if (!token || !courseId) return;

    try {
      setTopicPlanNodeId(nodeId);
      setIsGeneratingTopicPlan(true);
      const res = await studyPlansApi.generateTopic(nodeId, courseId);
      setTopicPlan(res.data.topic_plan);
      setShowTopicPlanModal(true);
    } catch (err) {
      console.error('Failed to generate topic plan:', err);
    } finally {
      setIsGeneratingTopicPlan(false);
      setTopicPlanNodeId(null);
    }
  };

  const handleLoadTopicPlan = async (nodeId: string) => {
    if (!token || !courseId) return;

    try {
      setTopicPlanNodeId(nodeId);
      const res = await studyPlansApi.getTopic(nodeId, courseId);
      if (res.data.topic_plan) {
        setTopicPlan(res.data.topic_plan);
        setShowTopicPlanModal(true);
      } else {
        await handleGenerateTopicPlan(nodeId);
      }
    } catch (err) {
      await handleGenerateTopicPlan(nodeId);
    } finally {
      setTopicPlanNodeId(null);
    }
  };

  const isTopicCompleted = (nodeId: string) => {
    return progress?.completed_topics?.includes(nodeId) || false;
  };

  const isExerciseCompleted = (exerciseId: string) => {
    return progress?.completed_exercises?.includes(exerciseId) || false;
  };

  const getProgressPercentage = () => {
    if (!plan || !progress || plan.total_topics === 0) return 0;
    return Math.round((progress.completed_topics?.length || 0) / plan.total_topics * 100);
  };

  const getExerciseProgress = () => {
    if (!plan || !progress) return { completed: 0, total: 0 };
    const total = plan.topics.reduce((sum, t) => sum + t.exercises.length, 0);
    return {
      completed: progress.completed_exercises?.length || 0,
      total
    };
  };

  // No plan view
  if (!plan && !isLoading) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] p-8">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(`/${role}/courses/${courseId}`)}
            className="mb-8 px-5 py-2.5 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-[1px_1px_0_#0A0A0A] transition-all inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft size={16} className="stroke-[3px]" /> Back to Course
          </button>
          
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-16 text-center shadow-[8px_8px_0_#0A0A0A]">
            <div className="w-24 h-24 bg-blue-100 border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mx-auto mb-8 shadow-[4px_4px_0_#0A0A0A]">
              <FileText className="w-12 h-12 text-[#0A0A0A]" />
            </div>
            <h1 className="text-4xl font-black text-[#0A0A0A] mb-4">No Study Plan Yet</h1>
            <p className="text-[#0A0A0A]/60 font-bold text-lg mb-10 max-w-lg mx-auto font-['Inter']">
              Generate a personalized study plan based on your course materials and knowledge graph. Get structured learning with practical exercises for each topic.
            </p>
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="inline-flex items-center justify-center gap-2 bg-[#FF4D5B] hover:bg-[#ff3344] disabled:opacity-50 text-white px-8 py-4 border-[3px] border-[#0A0A0A] rounded-xl font-black text-lg transition-all shadow-[6px_6px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[8px_8px_0_#0A0A0A] active:translate-y-0 active:shadow-[2px_2px_0_#0A0A0A]"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  Generating Plan...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" />
                  Generate Study Plan
                </>
              )}
            </button>
            {error && (
              <div className="mt-8 p-4 bg-red-50 border-2 border-red-500 rounded-xl text-left shadow-[4px_4px_0_#EF4444]">
                <div className="flex items-center gap-2 text-red-600 font-bold">
                  <AlertCircle className="w-5 h-5 stroke-[3px]" />
                  <span>{error}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || isGenerating) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-[#FF4D5B] animate-spin mx-auto mb-4 stroke-[3px]" />
          <p className="text-[#0A0A0A]/60 font-black text-xl tracking-wider">LOADING STUDY PLAN...</p>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const exerciseProgress = getExerciseProgress();
  const progressPercentage = getProgressPercentage();

  return (
    <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] selection:bg-[#FF4D5B] selection:text-white">
      {/* Header */}
      <div className="bg-white border-b-[3px] border-[#0A0A0A] sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <button
            onClick={() => navigate(`/${role}/courses/${courseId}`)}
            className="mb-6 px-4 py-2 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none transition-all inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft size={16} className="stroke-[3px]" /> Back to Course
          </button>
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-4xl font-black text-[#0A0A0A] mb-3 tracking-tight">{plan.title}</h1>
              <p className="text-[#0A0A0A]/60 font-bold text-lg font-['Inter'] max-w-2xl">{plan.description}</p>
            </div>
            
            <div className="flex flex-col items-end gap-4 shrink-0 min-w-[200px]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowRegenerateConfirm(true)}
                  className="px-4 py-2 bg-white hover:bg-gray-50 border-2 border-[#0A0A0A] text-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4 stroke-[3px]" /> Regenerate
                </button>
              </div>
              
              <div className="text-right bg-white border-[3px] border-[#0A0A0A] rounded-xl p-4 shadow-[4px_4px_0_#0A0A0A] w-full">
                <div className="text-4xl font-black text-[#FF4D5B] mb-1">{progressPercentage}%</div>
                <div className="text-sm font-extrabold text-[#0A0A0A]/50 uppercase tracking-widest">Complete</div>
                {/* Progress bar */}
                <div className="mt-3 h-3 bg-gray-100 border-2 border-[#0A0A0A] rounded-full overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-[#FF4D5B] border-r-2 border-[#0A0A0A] transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Progress Stats */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-5 shadow-[4px_4px_0_#0A0A0A] flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 border-2 border-[#0A0A0A] rounded-xl flex items-center justify-center">
                <Target className="w-6 h-6 text-blue-600 stroke-[2.5px]" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-[#0A0A0A]/50 uppercase">Topics</span>
                <span className="block text-2xl font-black text-[#0A0A0A]">
                  {progress?.completed_topics?.length || 0} / {plan.total_topics}
                </span>
              </div>
            </div>
            
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-5 shadow-[4px_4px_0_#0A0A0A] flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 border-2 border-[#0A0A0A] rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-600 stroke-[2.5px]" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-[#0A0A0A]/50 uppercase">Exercises</span>
                <span className="block text-2xl font-black text-[#0A0A0A]">
                  {exerciseProgress.completed} / {exerciseProgress.total}
                </span>
              </div>
            </div>
            
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-5 shadow-[4px_4px_0_#0A0A0A] flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 border-2 border-[#0A0A0A] rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-purple-600 stroke-[2.5px]" />
              </div>
              <div>
                <span className="block text-sm font-extrabold text-[#0A0A0A]/50 uppercase">Est. Duration</span>
                <span className="block text-2xl font-black text-[#0A0A0A]">
                  {plan.estimated_duration_hours} hrs
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Topics List */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-extrabold text-[#0A0A0A] mb-6 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#FF4D5B] stroke-[2.5px]" /> Learning Path
        </h2>
        
        <div className="space-y-6">
          {plan.topics.map((topic) => {
            const isCompleted = isTopicCompleted(topic.node_id);
            const isExpanded = expandedTopic === topic.id;
            const exerciseCount = topic.exercises.length;
            const completedExercises = topic.exercises.filter(e => isExerciseCompleted(e.id)).length;

            return (
              <div
                key={topic.id}
                className={`bg-white border-[3px] border-[#0A0A0A] rounded-2xl transition-all ${
                  isCompleted
                    ? 'shadow-[4px_4px_0_#10B981] hover:shadow-[6px_6px_0_#10B981]'
                    : 'shadow-[6px_6px_0_#0A0A0A] hover:shadow-[8px_8px_0_#0A0A0A]'
                }`}
              >
                {/* Topic Header */}
                <button
                  onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                  className="w-full px-6 py-5 flex items-center gap-5 focus:outline-none"
                >
                  {/* Order & Status */}
                  <div className={`w-12 h-12 rounded-xl border-2 border-[#0A0A0A] flex items-center justify-center shrink-0 shadow-[2px_2px_0_#0A0A0A] ${
                    isCompleted ? 'bg-emerald-400 text-white' : 'bg-[#FFD166] text-[#0A0A0A]'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6 stroke-[3px]" />
                    ) : (
                      <span className="text-xl font-black">{topic.order}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <h3 className={`font-black text-xl ${isCompleted ? 'text-emerald-900' : 'text-[#0A0A0A]'}`}>{topic.node_label}</h3>
                      <DifficultyBadge difficulty={topic.difficulty} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-[#0A0A0A]/60">
                      <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md border border-[#0A0A0A]/10">
                        <Clock className="w-4 h-4 stroke-[2.5px]" />
                        {topic.estimated_time_minutes} min
                      </span>
                      <span className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md border border-[#0A0A0A]/10">
                        <Target className="w-4 h-4 stroke-[2.5px]" />
                        {exerciseCount} exercises
                      </span>
                      {completedExercises > 0 && (
                        <span className="text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                          ✓ {completedExercises} done
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className={`w-10 h-10 rounded-full border-2 border-[#0A0A0A] flex items-center justify-center transition-transform ${isExpanded ? 'rotate-180 bg-gray-100' : 'bg-white'}`}>
                    <ChevronDown className="w-5 h-5 text-[#0A0A0A] stroke-[3px]" />
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t-[3px] border-[#0A0A0A] pt-6 space-y-8 bg-gray-50/50 rounded-b-xl">
                    {/* Description */}
                    {topic.node_description && (
                      <p className="text-[#0A0A0A]/80 font-medium font-['Inter'] text-lg border-l-4 border-[#FF4D5B] pl-4">{topic.node_description}</p>
                    )}

                    {/* Learning Objectives */}
                    {topic.learning_objectives?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-extrabold text-[#0A0A0A] uppercase tracking-wider mb-3">
                          Learning Objectives
                        </h4>
                        <ul className="space-y-2">
                          {topic.learning_objectives.map((obj, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-[#0A0A0A]/70 font-bold font-['Inter']">
                              <div className="w-5 h-5 rounded-full bg-[#06D6A0] border-2 border-[#0A0A0A] flex-shrink-0 mt-0.5" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Key Concepts & References Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {topic.key_concepts?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-extrabold text-[#0A0A0A] uppercase tracking-wider mb-3">
                            Key Concepts
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {topic.key_concepts.map((concept, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1.5 bg-purple-100 text-purple-900 border-2 border-purple-300 rounded-lg text-sm font-extrabold shadow-[2px_2px_0_#D8B4FE]"
                              >
                                {concept}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {topic.document_references?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-extrabold text-[#0A0A0A] uppercase tracking-wider mb-3">
                            Related Documents
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {topic.document_references.map((doc, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1.5 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-lg text-sm font-extrabold flex items-center gap-1.5 shadow-[2px_2px_0_#0A0A0A]"
                              >
                                <FileText className="w-4 h-4 stroke-[2.5px]" />
                                {doc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Deep Dive Study Plan Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => handleLoadTopicPlan(topic.node_id)}
                        disabled={isGeneratingTopicPlan && topicPlanNodeId === topic.node_id}
                        className="w-full py-4 bg-gradient-to-r from-[#118AB2] to-[#073B4C] hover:from-[#0F7A9D] hover:to-[#052834] text-white border-2 border-[#0A0A0A] rounded-xl font-black shadow-[4px_4px_0_#0A0A0A] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 text-lg disabled:opacity-70"
                      >
                        {isGeneratingTopicPlan && topicPlanNodeId === topic.node_id ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin stroke-[3px]" />
                            Generating Deep Dive Plan...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5 stroke-[2.5px]" />
                            Generate Deep Dive Plan for This Topic
                          </>
                        )}
                      </button>
                    </div>

                    {/* Exercises */}
                    {topic.exercises?.length > 0 && (
                      <div className="pt-4 border-t-2 border-[#0A0A0A]/10">
                        <h4 className="text-xl font-extrabold text-[#0A0A0A] mb-4 flex items-center gap-2">
                          <Code className="w-6 h-6 stroke-[3px] text-[#FFD166]" />
                          Exercises ({topic.exercises.length})
                        </h4>
                        <div className="space-y-4">
                          {topic.exercises.map((exercise) => {
                            const exCompleted = isExerciseCompleted(exercise.id);
                            const exExpanded = expandedExercise === exercise.id;

                            return (
                              <div
                                key={exercise.id}
                                className={`bg-white border-2 border-[#0A0A0A] rounded-xl overflow-hidden transition-all ${
                                  exCompleted
                                    ? 'shadow-[3px_3px_0_#10B981]'
                                    : 'shadow-[4px_4px_0_#0A0A0A]'
                                }`}
                              >
                                <button
                                  onClick={() => setExpandedExercise(exExpanded ? null : exercise.id)}
                                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 focus:outline-none"
                                >
                                  <div className={`p-2 border-2 border-[#0A0A0A] rounded-lg shadow-[2px_2px_0_#0A0A0A] ${
                                    exCompleted ? 'bg-[#06D6A0] text-[#0A0A0A]' : 'bg-[#118AB2] text-white'
                                  }`}>
                                    <ExerciseIcon type={exercise.type} />
                                  </div>
                                  
                                  <div className="flex-1 text-left">
                                    <div className="flex items-center gap-3 mb-1">
                                      <span className="font-extrabold text-lg text-[#0A0A0A] line-clamp-1">{exercise.title}</span>
                                      <DifficultyBadge difficulty={exercise.difficulty} />
                                    </div>
                                    <div className="flex items-center gap-3 text-sm font-bold text-[#0A0A0A]/60 uppercase tracking-wider">
                                      <span>{exercise.type}</span>
                                      <span>•</span>
                                      <span>{exercise.estimated_time_minutes} min</span>
                                    </div>
                                  </div>
                                  
                                  {exCompleted ? (
                                    <div className="bg-[#06D6A0] p-1 rounded-full border-2 border-[#0A0A0A]">
                                      <CheckCircle className="w-5 h-5 text-[#0A0A0A] stroke-[3px]" />
                                    </div>
                                  ) : (
                                    <ChevronDown className={`w-6 h-6 text-[#0A0A0A] stroke-[3px] transition-transform ${exExpanded ? 'rotate-180' : ''}`} />
                                  )}
                                </button>

                                {exExpanded && (
                                  <div className="px-5 pb-5 border-t-2 border-[#0A0A0A] pt-4 bg-gray-50">
                                    <p className="text-[#0A0A0A]/80 font-medium font-['Inter'] mb-6 bg-white p-4 rounded-xl border border-[#0A0A0A]/20">{exercise.description}</p>
                                    
                                    {/* Hints */}
                                    {exercise.hints?.length > 0 && (
                                      <div className="bg-[#FFD166]/20 border-2 border-[#FFD166] rounded-xl p-4 mb-4">
                                        <div className="flex items-center gap-2 text-[#0A0A0A] font-extrabold mb-2 uppercase text-sm">
                                          <Lightbulb className="w-4 h-4 stroke-[3px]" /> Hints
                                        </div>
                                        <ul className="space-y-1.5 pl-2">
                                          {exercise.hints.map((hint, idx) => (
                                            <li key={idx} className="text-[#0A0A0A]/70 font-bold text-sm flex gap-2">
                                              <span className="text-[#FFD166]">•</span> {hint}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Solution */}
                                    {exercise.solution && (
                                      <div className="bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl p-4 mb-6 shadow-[4px_4px_0_#0A0A0A]">
                                        <div className="text-sm font-extrabold text-[#06D6A0] mb-2 uppercase tracking-wider">Solution</div>
                                        <div className="text-sm font-['Inter'] prose max-w-none prose-pre:bg-gray-100 prose-pre:border-2 prose-pre:border-[#0A0A0A] prose-pre:rounded-xl">
                                          <ReactMarkdown>{exercise.solution}</ReactMarkdown>
                                        </div>
                                      </div>
                                    )}

                                    {/* Complete Button */}
                                    <button
                                      onClick={() => handleCompleteExercise(exercise.id)}
                                      disabled={exCompleted}
                                      className={`w-full py-3 border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#0A0A0A] transition-all flex justify-center items-center gap-2 ${
                                        exCompleted
                                          ? 'bg-[#06D6A0] text-[#0A0A0A] active:translate-y-0 cursor-default'
                                          : 'bg-white text-[#0A0A0A] hover:bg-gray-100 active:translate-y-1 active:shadow-none'
                                      }`}
                                    >
                                      {exCompleted ? (
                                        <>
                                          <CheckCircle className="w-5 h-5 stroke-[3px]" /> Completed
                                        </>
                                      ) : 'Mark as Complete'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Complete Topic Action Row */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t-2 border-[#0A0A0A]/10">
                      <button
                        onClick={() => navigate(`/${role}/courses/${courseId}/study?node=${topic.node_id}`)}
                        className="flex-1 py-4 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
                      >
                        <Brain className="w-5 h-5 stroke-[2.5px]" /> Practice in Study Mode
                      </button>
                      <button
                        onClick={() => handleCompleteTopic(topic.node_id)}
                        disabled={isCompleted}
                        className={`flex-1 py-4 border-2 border-[#0A0A0A] rounded-xl font-extrabold transition-all flex items-center justify-center gap-2 ${
                          isCompleted
                            ? 'bg-[#06D6A0] text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] cursor-default opacity-80'
                            : 'bg-[#FF4D5B] text-white shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-[2px_2px_0_#0A0A0A]'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle className="w-5 h-5 stroke-[3px]" /> Topic Completed
                          </>
                        ) : (
                          <>
                            <Award className="w-5 h-5 stroke-[2.5px]" /> Mark Topic Complete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-['Outfit']">
          <div className="bg-[#FCFCFC] border-[3px] border-[#0A0A0A] rounded-2xl p-8 max-w-md w-full shadow-[12px_12px_0_#0A0A0A] animate-in zoom-in-95 duration-200">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-amber-100 border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mx-auto mb-6 shadow-[4px_4px_0_#0A0A0A]">
                <RefreshCw className="w-10 h-10 text-amber-500 stroke-[3px]" />
              </div>
              <h3 className="text-2xl font-black text-[#0A0A0A] mb-3">Regenerate Plan?</h3>
              <p className="text-[#0A0A0A]/70 font-bold font-['Inter']">
                This will delete your current plan and all progress, then generate a new one based on the latest knowledge graph.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="flex-1 py-3.5 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#0A0A0A] active:translate-y-1 active:shadow-none transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  handleGeneratePlan();
                }}
                className="flex-1 py-3.5 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[4px_4px_0_#0A0A0A] active:translate-y-1 active:shadow-none transition-all"
              >
                Yes, Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Deep Dive Plan Modal */}
      {showTopicPlanModal && topicPlan && (
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-['Outfit']">
          <div className="bg-[#FCFCFC] border-[3px] border-[#0A0A0A] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-[12px_12px_0_#0A0A0A] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-white border-b-[3px] border-[#0A0A0A] px-8 py-6 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div>
                <h2 className="text-2xl font-black text-[#0A0A0A]">{topicPlan.title}</h2>
                <p className="text-sm font-bold text-[#0A0A0A]/60 mt-1">{topicPlan.description}</p>
              </div>
              <button
                onClick={() => setShowTopicPlanModal(false)}
                className="p-2 bg-white border-2 border-[#0A0A0A] rounded-lg shadow-[2px_2px_0_#0A0A0A] hover:bg-red-50 active:translate-y-0.5 active:shadow-none transition-all"
              >
                <X className="w-6 h-6 text-[#0A0A0A] stroke-[3px]" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-10">
              {/* Learning Path */}
              {topicPlan.learning_path?.length > 0 && (
                <div>
                  <h3 className="text-xl font-black text-[#0A0A0A] uppercase tracking-wide mb-6 flex items-center gap-3">
                    <Target className="w-6 h-6 text-[#118AB2] stroke-[3px]" />
                    Learning Path
                  </h3>
                  <div className="space-y-4">
                    {topicPlan.learning_path.map((step: any) => (
                      <div key={step.step} className="flex gap-5 p-6 bg-white border-2 border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A]">
                        <div className="w-12 h-12 bg-[#118AB2] text-white border-2 border-[#0A0A0A] rounded-xl flex items-center justify-center shrink-0 shadow-[2px_2px_0_#0A0A0A]">
                          <span className="text-xl font-black">{step.step}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-extrabold text-[#0A0A0A] text-lg">{step.title}</h4>
                            <span className="bg-gray-100 px-2 py-1 rounded-md border border-[#0A0A0A]/20 text-xs font-bold text-[#0A0A0A]">
                              {step.estimated_minutes} min
                            </span>
                          </div>
                          <p className="text-[15px] text-[#0A0A0A]/70 font-['Inter'] mb-3">{step.content}</p>
                          {step.document_references?.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#0A0A0A]/10">
                              {step.document_references.map((doc: string, idx: number) => (
                                <span key={idx} className="px-2 py-1 bg-white border border-[#0A0A0A] text-[#0A0A0A] rounded text-xs font-bold shadow-[1px_1px_0_#0A0A0A]">
                                  📄 {doc}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exercises */}
              {topicPlan.exercises?.length > 0 && (
                <div>
                  <h3 className="text-xl font-black text-[#0A0A0A] uppercase tracking-wide mb-6 flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-[#FF4D5B] stroke-[3px]" />
                    Practice Exercises
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {topicPlan.exercises.map((ex: any, idx: number) => (
                      <div key={idx} className="p-6 bg-white border-2 border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] flex flex-col h-full">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-lg shadow-[2px_2px_0_#0A0A0A]">
                            <ExerciseIcon type={ex.type} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-extrabold text-[#0A0A0A] text-lg leading-tight">{ex.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <DifficultyBadge difficulty={ex.difficulty} />
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-[#0A0A0A]/70 font-['Inter'] mb-6 flex-grow">{ex.description}</p>
                        
                        <div className="space-y-4 mt-auto">
                          {ex.hints?.length > 0 && (
                            <div className="p-3 bg-[#FFD166]/20 border-2 border-[#FFD166] rounded-xl">
                              <p className="text-xs text-[#0A0A0A] font-extrabold uppercase mb-1 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3 stroke-[3px]" /> Hints
                              </p>
                              <ul className="pl-2 space-y-1">
                                {ex.hints.map((h: string, i: number) => (
                                  <li key={i} className="text-xs font-bold text-[#0A0A0A]/70">• {h}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {ex.solution && (
                            <details className="group bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl shadow-[2px_2px_0_#0A0A0A] cursor-pointer">
                              <summary className="p-3 font-extrabold text-sm uppercase tracking-wide flex justify-between items-center outline-none bg-gray-50 rounded-xl">
                                View Solution
                                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="p-4 border-t-2 border-[#0A0A0A] text-sm font-['Inter'] prose max-w-none prose-pre:bg-gray-100 prose-pre:border-2 prose-pre:border-[#0A0A0A] prose-pre:rounded-xl">
                                <ReactMarkdown>{ex.solution}</ReactMarkdown>
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Self Check Questions */}
              {topicPlan.self_check_questions?.length > 0 && (
                <div>
                  <h3 className="text-xl font-black text-[#0A0A0A] uppercase tracking-wide mb-6 flex items-center gap-3">
                    <Brain className="w-6 h-6 text-[#06D6A0] stroke-[3px]" />
                    Self-Check Questions
                  </h3>
                  <div className="space-y-4">
                    {topicPlan.self_check_questions.map((q: any, idx: number) => (
                      <details key={idx} className="group p-5 bg-white border-2 border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] cursor-pointer">
                        <summary className="text-[#0A0A0A] font-extrabold text-lg flex justify-between items-center outline-none">
                          {q.question}
                          <ChevronDown className="w-5 h-5 transition-transform group-open:rotate-180 shrink-0" />
                        </summary>
                        <div className="mt-4 pt-4 border-t-2 border-[#0A0A0A]/10 bg-emerald-50 rounded-lg p-4 border-l-4 border-l-[#06D6A0]">
                          <p className="text-[#0A0A0A] font-bold font-['Inter']"><span className="text-[#06D6A0] font-black uppercase">Answer:</span> {q.answer}</p>
                          {q.explanation && <p className="text-[#0A0A0A]/70 text-sm font-medium mt-2">{q.explanation}</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Topics */}
              {topicPlan.related_topics?.length > 0 && (
                <div className="pt-6 border-t-2 border-[#0A0A0A]/10">
                  <h3 className="text-sm font-extrabold text-[#0A0A0A] uppercase tracking-wider mb-4">Jump to Related Topics</h3>
                  <div className="flex flex-wrap gap-3">
                    {topicPlan.related_topics.map((t: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setShowTopicPlanModal(false);
                          navigate(`/${role}/courses/${courseId}/study?node=${t.node_id}`);
                        }}
                        className="px-4 py-2 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold text-sm shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
                      >
                        {t.label} <span className="text-[#0A0A0A]/40 font-medium">({t.relation})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
