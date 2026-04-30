import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  BookOpen, CheckCircle, Clock, Target, Brain, Code, MessageSquare,
  Lightbulb, FileText, ChevronRight, ChevronDown, Play, Award,
  TrendingUp, RefreshCw, AlertCircle, Sparkles, X
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
    easy: 'bg-green-500/20 text-green-400 border-green-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    hard: 'bg-red-500/20 text-red-400 border-red-500/30'
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${colors[difficulty as keyof typeof colors]}`}>
      {difficulty.toUpperCase()}
    </span>
  );
};

export default function StudyPlanView() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { token } = useAuthStore();

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

      console.log('StudyPlan - API Response:', res.data);
      console.log('StudyPlan - Plan data:', res.data.study_plan);

      if (res.data.study_plan) {
        console.log('Setting plan with topics:', res.data.study_plan.topics?.length);
        setPlan(res.data.study_plan);
        setProgress(res.data.progress);
      } else {
        console.log('No matching plan found. Available plan course_id:', res.data.study_plan?.course_id);
        setPlan(null);
        setProgress(null);
      }
    } catch (err: any) {
      console.error('Failed to load plan:', err);
      // Don't show error for 404 (no plan exists yet)
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
        setError('No knowledge graph found for this course. Please create one first.');
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
      setIsGeneratingTopicPlan(true);
      const res = await studyPlansApi.generateTopic(nodeId, courseId);
      setTopicPlan(res.data.topic_plan);
      setShowTopicPlanModal(true);
    } catch (err) {
      console.error('Failed to generate topic plan:', err);
    } finally {
      setIsGeneratingTopicPlan(false);
    }
  };

  const handleLoadTopicPlan = async (nodeId: string) => {
    if (!token || !courseId) return;

    try {
      const res = await studyPlansApi.getTopic(nodeId, courseId);
      if (res.data.topic_plan) {
        setTopicPlan(res.data.topic_plan);
        setShowTopicPlanModal(true);
      } else {
        handleGenerateTopicPlan(nodeId);
      }
    } catch (err) {
      handleGenerateTopicPlan(nodeId);
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
      <div className="min-h-screen bg-[#0A0A0A] p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-3xl font-semibold text-white mb-3">No Study Plan Yet</h1>
            <p className="text-white/40 mb-8 max-w-md mx-auto">
              Generate a personalized study plan based on your course materials and knowledge graph.
              Get structured learning with practical exercises for each topic.
            </p>
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white px-8 py-3 rounded-xl font-semibold transition-all"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating Plan...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Generate Study Plan
                </>
              )}
            </button>
            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => navigate(`/course/${courseId}`)}
              className="mt-4 text-white/30 hover:text-white/60 text-sm transition-colors"
            >
              ← Back to Course
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || isGenerating) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-4" />
          <p className="text-white/40">Loading study plan...</p>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const exerciseProgress = getExerciseProgress();
  const progressPercentage = getProgressPercentage();

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <button
            onClick={() => navigate(`/course/${courseId}`)}
            className="text-white/30 hover:text-white/60 text-sm mb-4 transition-colors"
          >
            ← Back to Course
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white mb-2">{plan.title}</h1>
              <p className="text-white/40 text-sm">{plan.description}</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowRegenerateConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-xl text-sm font-medium transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate
              </button>
              <div className="text-right">
                <div className="text-2xl font-bold text-[var(--accent)]">{progressPercentage}%</div>
                <div className="text-xs text-white/30">Complete</div>
              </div>
            </div>
          </div>

          {/* Progress bars */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-white/[0.03] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-white/40">Topics</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {progress?.completed_topics?.length || 0} / {plan.total_topics}
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-xs text-white/40">Exercises</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {exerciseProgress.completed} / {exerciseProgress.total}
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-white/40">Est. Duration</span>
              </div>
              <div className="text-lg font-semibold text-white">
                {plan.estimated_duration_hours} hours
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-2 bg-white/[0.05] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--accent)] to-rose-500 transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Topics List */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-4">
          {plan.topics.map((topic) => {
            const isCompleted = isTopicCompleted(topic.node_id);
            const isExpanded = expandedTopic === topic.id;
            const exerciseCount = topic.exercises.length;
            const completedExercises = topic.exercises.filter(e => isExerciseCompleted(e.id)).length;

            return (
              <div
                key={topic.id}
                className={`rounded-xl border transition-all ${
                  isCompleted
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-white/[0.02] border-white/[0.06]'
                }`}
              >
                {/* Topic Header */}
                <button
                  onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                  className="w-full px-6 py-4 flex items-center gap-4"
                >
                  {/* Order & Status */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isCompleted ? 'bg-green-500/20' : 'bg-blue-500/10'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <span className="text-sm font-bold text-blue-400">{topic.order}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">{topic.node_label}</h3>
                      <DifficultyBadge difficulty={topic.difficulty} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/30">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {topic.estimated_time_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        {exerciseCount} exercises
                      </span>
                      {completedExercises > 0 && (
                        <span className="text-green-400">
                          ✓ {completedExercises} done
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-white/30" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-white/30" />
                  )}
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-white/[0.06] pt-4 space-y-6">
                    {/* Description */}
                    {topic.node_description && (
                      <p className="text-sm text-white/50">{topic.node_description}</p>
                    )}

                    {/* Learning Objectives */}
                    {topic.learning_objectives?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                          Learning Objectives
                        </h4>
                        <ul className="space-y-1.5">
                          {topic.learning_objectives.map((obj, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-white/60">
                              <Target className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Key Concepts */}
                    {topic.key_concepts?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                          Key Concepts
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {topic.key_concepts.map((concept, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-purple-500/10 text-purple-300 rounded-full text-xs"
                            >
                              {concept}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Document References */}
                    {topic.document_references?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
                          Related Documents
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {topic.document_references.map((doc, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-white/5 text-white/50 rounded-full text-xs flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              {doc}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Deep Dive Study Plan Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => handleLoadTopicPlan(topic.node_id)}
                        disabled={isGeneratingTopicPlan && topicPlanNodeId === topic.node_id}
                        className="w-full py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/20 text-purple-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isGeneratingTopicPlan && topicPlanNodeId === topic.node_id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generating Deep Dive Plan...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate Deep Dive Study Plan for This Topic
                          </>
                        )}
                      </button>
                    </div>

                    {/* Exercises */}
                    {topic.exercises?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-white/40 uppercase tracking-wider mb-3">
                          Exercises ({topic.exercises.length})
                        </h4>
                        <div className="space-y-3">
                          {topic.exercises.map((exercise) => {
                            const exCompleted = isExerciseCompleted(exercise.id);
                            const exExpanded = expandedExercise === exercise.id;

                            return (
                              <div
                                key={exercise.id}
                                className={`rounded-lg border overflow-hidden transition-all ${
                                  exCompleted
                                    ? 'bg-green-500/5 border-green-500/20'
                                    : 'bg-white/[0.02] border-white/[0.06]'
                                }`}
                              >
                                <button
                                  onClick={() => setExpandedExercise(exExpanded ? null : exercise.id)}
                                  className="w-full px-4 py-3 flex items-center gap-3"
                                >
                                  <div className={`p-1.5 rounded-md ${
                                    exCompleted ? 'bg-green-500/20' : 'bg-blue-500/10'
                                  }`}>
                                    <ExerciseIcon type={exercise.type} />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-white">{exercise.title}</span>
                                      <DifficultyBadge difficulty={exercise.difficulty} />
                                    </div>
                                    <span className="text-xs text-white/30">
                                      {exercise.type} • {exercise.estimated_time_minutes} min
                                    </span>
                                  </div>
                                  {exCompleted ? (
                                    <CheckCircle className="w-5 h-5 text-green-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-white/30" />
                                  )}
                                </button>

                                {exExpanded && (
                                  <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-3">
                                    <p className="text-sm text-white/60">{exercise.description}</p>
                                    
                                    {/* Hints */}
                                    {exercise.hints?.length > 0 && (
                                      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-1.5 text-yellow-400 text-xs font-medium mb-1">
                                          <Lightbulb className="w-3.5 h-3.5" />
                                          Hints
                                        </div>
                                        <ul className="space-y-1">
                                          {exercise.hints.map((hint, idx) => (
                                            <li key={idx} className="text-xs text-yellow-300/70">
                                              • {hint}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Solution */}
                                    {exercise.solution && (
                                      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                                        <div className="text-xs font-medium text-white/40 mb-2">Solution</div>
                                        <div className="text-sm text-white/60">
                                          <ReactMarkdown>{exercise.solution}</ReactMarkdown>
                                        </div>
                                      </div>
                                    )}

                                    {/* Complete Button */}
                                    <button
                                      onClick={() => handleCompleteExercise(exercise.id)}
                                      disabled={exCompleted}
                                      className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                                        exCompleted
                                          ? 'bg-green-500/20 text-green-400 cursor-default'
                                          : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                                      }`}
                                    >
                                      {exCompleted ? '✓ Completed' : 'Mark as Complete'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Complete Topic Button */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => navigate(`/course/${courseId}/study?node=${topic.node_id}`)}
                        className="flex-1 py-3 rounded-xl text-sm font-medium bg-white/5 text-white/60 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                      >
                        <Brain className="w-4 h-4" />
                        Practice in Study Mode
                      </button>
                      <button
                        onClick={() => handleCompleteTopic(topic.node_id)}
                        disabled={isCompleted}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                          isCompleted
                            ? 'bg-green-500/20 text-green-400 cursor-default'
                            : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Topic Completed
                          </>
                        ) : (
                          <>
                            <Award className="w-4 h-4" />
                            Mark as Complete
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-2xl p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <RefreshCw className="w-12 h-12 text-yellow-400 mx-auto mb-4 animate-spin" style={{ animationDuration: '3s' }} />
              <h3 className="text-xl font-bold text-white mb-2">Regenerate Study Plan?</h3>
              <p className="text-white/40 text-sm">
                This will delete your current plan and all progress, then generate a new one.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  handleGeneratePlan();
                }}
                className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-medium transition-all"
              >
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Deep Dive Plan Modal */}
      {showTopicPlanModal && topicPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1A1A1A] border border-white/[0.06] rounded-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#1A1A1A] border-b border-white/[0.06] px-8 py-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{topicPlan.title}</h2>
                <p className="text-sm text-white/40 mt-1">{topicPlan.description}</p>
              </div>
              <button
                onClick={() => setShowTopicPlanModal(false)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white/40" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              {/* Learning Path */}
              {topicPlan.learning_path?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    Learning Path
                  </h3>
                  <div className="space-y-3">
                    {topicPlan.learning_path.map((step: any) => (
                      <div key={step.step} className="flex gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-blue-400">{step.step}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-white">{step.title}</h4>
                            <span className="text-xs text-white/30">{step.estimated_minutes} min</span>
                          </div>
                          <p className="text-sm text-white/50">{step.content}</p>
                          {step.document_references?.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {step.document_references.map((doc: string, idx: number) => (
                                <span key={idx} className="px-2 py-0.5 bg-white/5 text-white/40 rounded text-xs">
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
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-400" />
                    Exercises
                  </h3>
                  <div className="space-y-3">
                    {topicPlan.exercises.map((ex: any, idx: number) => (
                      <div key={idx} className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <ExerciseIcon type={ex.type} />
                          <h4 className="font-medium text-white">{ex.title}</h4>
                          <DifficultyBadge difficulty={ex.difficulty} />
                        </div>
                        <p className="text-sm text-white/50 mb-2">{ex.description}</p>
                        {ex.hints?.length > 0 && (
                          <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                            <p className="text-xs text-yellow-400 font-medium mb-1">Hints:</p>
                            {ex.hints.map((h: string, i: number) => (
                              <p key={i} className="text-xs text-yellow-300/70">• {h}</p>
                            ))}
                          </div>
                        )}
                        {ex.solution && (
                          <div className="mt-2 p-2 bg-white/[0.03] rounded-lg">
                            <p className="text-xs text-white/40 mb-1">Solution:</p>
                            <p className="text-sm text-white/60">{ex.solution}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Self Check Questions */}
              {topicPlan.self_check_questions?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-green-400" />
                    Self-Check Questions
                  </h3>
                  <div className="space-y-3">
                    {topicPlan.self_check_questions.map((q: any, idx: number) => (
                      <details key={idx} className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                        <summary className="text-sm text-white cursor-pointer font-medium">{q.question}</summary>
                        <div className="mt-3 pl-4 border-l-2 border-green-500/30">
                          <p className="text-sm text-white/60"><strong>Answer:</strong> {q.answer}</p>
                          {q.explanation && <p className="text-xs text-white/40 mt-1">{q.explanation}</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Topics */}
              {topicPlan.related_topics?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider mb-3">Related Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {topicPlan.related_topics.map((t: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setShowTopicPlanModal(false);
                          navigate(`/course/${courseId}/study?node=${t.node_id}`);
                        }}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-full text-xs transition-all"
                      >
                        {t.label} ({t.relation})
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
