import { apiErrorDetail } from '../../utils/apiError';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  BookOpen, CheckCircle, Clock, Target, Brain, Code, MessageSquare,
  Lightbulb, FileText, ChevronDown, Award,
  RefreshCw, AlertCircle, Sparkles, X
} from 'lucide-react';
import { studyPlansApi, coursesApi } from '../../api';
import ReactMarkdown from 'react-markdown';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

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
    easy: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    medium: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    hard: 'bg-red-500/10 text-red-600 border-red-500/30'
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border tracking-wider ${colors[difficulty as keyof typeof colors]}`}>
      {difficulty}
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

      if (res.data.study_plan) {
        setPlan(res.data.study_plan);
        setProgress(res.data.progress);
      } else {
        setPlan(null);
        setProgress(null);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        setError(apiErrorDetail(err, 'Failed to load study plan'));
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

      const courseRes = await coursesApi.get(courseId);

      const graphId = courseRes.data.graph_id;
      if (!graphId) {
        setError('No knowledge graph found for this course. Please generate one from Course Detail.');
        return;
      }

      const existingRes = await studyPlansApi.getActive(courseId);
      const endpoint = existingRes.data.study_plan ? 'regenerate' : 'generate';

      const res = await (endpoint === 'regenerate' 
        ? studyPlansApi.regenerate(courseId, graphId)
        : studyPlansApi.generate(courseId, graphId));

      setPlan(res.data.study_plan);
      setProgress(res.data.progress);
    } catch (err: any) {
      setError(apiErrorDetail(err, 'Failed to generate study plan'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCompleteTopic = async (nodeId: string) => {
    if (!token || !plan) return;

    try {
      const res = await studyPlansApi.completeTopic(courseId!, nodeId);
      setProgress(res.data.progress);
    } catch (err) {
      console.error('Failed to complete topic:', err);
    }
  };

  const handleCompleteExercise = async (exerciseId: string) => {
    if (!token || !plan) return;

    try {
      const res = await studyPlansApi.completeExercise(courseId!, exerciseId);
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
      <div className="min-h-screen bg-canvas text-ink p-8">
        <div className="max-w-3xl mx-auto">
          
          <Card className="p-12 text-center">
            <div className="w-20 h-20 bg-sunken border border-line rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-ink-3" />
            </div>
            <h1 className="text-3xl font-light text-ink mb-3">No Study Plan Yet</h1>
            <p className="text-ink-3 font-medium text-base mb-8 max-w-lg mx-auto leading-relaxed">
              Generate a personalized study plan based on your course materials and knowledge graph. Get structured learning with practical exercises for each topic.
            </p>
            <Button
              onClick={handleGeneratePlan}
              disabled={isGenerating}
              variant="primary"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating Plan...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Study Plan
                </>
              )}
            </Button>
            {error && (
              <div className="mt-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-left">
                <div className="flex items-center gap-2 text-red-600 font-medium">
                  <AlertCircle className="w-5 h-5" />
                  <span>{error}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || isGenerating) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-ink animate-spin mx-auto mb-4" />
          <p className="text-ink-3 font-medium text-sm tracking-widest uppercase">LOADING STUDY PLAN...</p>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const exerciseProgress = getExerciseProgress();
  const progressPercentage = getProgressPercentage();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Header */}
      <div className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-6 py-8">
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl font-light text-ink mb-2 tracking-tight">{plan.title}</h1>
              <p className="text-ink-3 font-medium text-base max-w-2xl leading-relaxed">{plan.description}</p>
            </div>
            
            <div className="flex flex-col items-end gap-4 shrink-0 min-w-[200px]">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => setShowRegenerateConfirm(true)}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </Button>
              </div>
              
              <Card className="text-right p-4 w-full bg-sunken">
                <div className="text-3xl font-light text-ink mb-1">{progressPercentage}%</div>
                <div className="text-xs font-semibold text-ink-3 uppercase tracking-widest">Complete</div>
                {/* Progress bar */}
                <div className="mt-3 h-2 bg-sunken-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </Card>
            </div>
          </div>

          {/* Progress Stats */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 flex items-center gap-4 bg-sunken">
              <div className="w-10 h-10 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center text-accent">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs font-semibold text-ink-3 uppercase tracking-widest">Topics</span>
                <span className="block text-xl font-light text-ink">
                  {progress?.completed_topics?.length || 0} / {plan.total_topics}
                </span>
              </div>
            </Card>
            
            <Card className="p-5 flex items-center gap-4 bg-sunken">
              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-700">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs font-semibold text-ink-3 uppercase tracking-widest">Exercises</span>
                <span className="block text-xl font-light text-ink">
                  {exerciseProgress.completed} / {exerciseProgress.total}
                </span>
              </div>
            </Card>
            
            <Card className="p-5 flex items-center gap-4 bg-sunken">
              <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center text-violet-700">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="block text-xs font-semibold text-ink-3 uppercase tracking-widest">Est. Duration</span>
                <span className="block text-xl font-light text-ink">
                  {plan.estimated_duration_hours} hrs
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Topics List */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-xl font-medium text-ink mb-6 flex items-center gap-2 tracking-tight">
          <BookOpen className="w-5 h-5 text-ink" /> Learning Path
        </h2>
        
        <div className="space-y-4">
          {plan.topics.map((topic) => {
            const isCompleted = isTopicCompleted(topic.node_id);
            const isExpanded = expandedTopic === topic.id;
            const exerciseCount = topic.exercises.length;
            const completedExercises = topic.exercises.filter(e => isExerciseCompleted(e.id)).length;

            return (
              <Card
                key={topic.id}
                className={`transition-all ${
                  isCompleted ? 'border-emerald-500/30' : 'border-line hover:border-line-strong'
                }`}
              >
                {/* Topic Header */}
                <button
                  onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                  className="w-full px-6 py-5 flex items-center gap-5 focus:outline-none"
                >
                  {/* Order & Status */}
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                    isCompleted ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-700' : 'bg-sunken border-line text-ink'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-semibold">{topic.order}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <h3 className={`font-medium text-lg ${isCompleted ? 'text-emerald-700' : 'text-ink'}`}>{topic.node_label}</h3>
                      <DifficultyBadge difficulty={topic.difficulty} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-3">
                      <span className="flex items-center gap-1.5 bg-sunken px-2.5 py-1 rounded-md border border-line">
                        <Clock className="w-3.5 h-3.5" />
                        {topic.estimated_time_minutes} min
                      </span>
                      <span className="flex items-center gap-1.5 bg-sunken px-2.5 py-1 rounded-md border border-line">
                        <Target className="w-3.5 h-3.5" />
                        {exerciseCount} exercises
                      </span>
                      {completedExercises > 0 && (
                        <span className="text-emerald-700 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                          ✓ {completedExercises} done
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand Icon */}
                  <div className={`w-8 h-8 rounded-full border border-line flex items-center justify-center transition-transform ${isExpanded ? 'rotate-180 bg-sunken-2' : 'bg-sunken'}`}>
                    <ChevronDown className="w-4 h-4 text-ink-3" />
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-line pt-6 space-y-6 bg-surface rounded-b-2xl">
                    {/* Description */}
                    {topic.node_description && (
                      <p className="text-ink-3 font-normal text-base border-l-2 border-ink/20 pl-4 leading-relaxed">{topic.node_description}</p>
                    )}

                    {/* Learning Objectives */}
                    {topic.learning_objectives?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3">
                          Learning Objectives
                        </h4>
                        <ul className="space-y-2">
                          {topic.learning_objectives.map((obj, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-sm text-ink-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 mt-2" />
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
                          <h4 className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3">
                            Key Concepts
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {topic.key_concepts.map((concept, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 bg-purple-500/10 text-violet-700 border border-purple-500/20 rounded-lg text-xs font-medium"
                              >
                                {concept}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {topic.document_references?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3">
                            Related Documents
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {topic.document_references.map((doc, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 bg-sunken text-ink-3 border border-line rounded-lg text-xs font-medium flex items-center gap-1.5"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {doc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Deep Dive Study Plan Button */}
                    <div className="pt-2">
                      <Button
                        onClick={() => handleLoadTopicPlan(topic.node_id)}
                        disabled={isGeneratingTopicPlan && topicPlanNodeId === topic.node_id}
                        variant="outline"
                        className="w-full"
                      >
                        {isGeneratingTopicPlan && topicPlanNodeId === topic.node_id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Generating Deep Dive Plan...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate Deep Dive Plan for This Topic
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Exercises */}
                    {topic.exercises?.length > 0 && (
                      <div className="pt-4 border-t border-line">
                        <h4 className="text-base font-medium text-ink mb-4 flex items-center gap-2">
                          <Code className="w-5 h-5 text-ink-3" />
                          Exercises ({topic.exercises.length})
                        </h4>
                        <div className="space-y-3">
                          {topic.exercises.map((exercise) => {
                            const exCompleted = isExerciseCompleted(exercise.id);
                            const exExpanded = expandedExercise === exercise.id;

                            return (
                              <div
                                key={exercise.id}
                                className={`bg-surface border rounded-xl overflow-hidden transition-all ${
                                  exCompleted ? 'border-emerald-500/30' : 'border-line'
                                }`}
                              >
                                <button
                                  onClick={() => setExpandedExercise(exExpanded ? null : exercise.id)}
                                  className="w-full px-4 py-3.5 flex items-center gap-4 hover:bg-sunken focus:outline-none"
                                >
                                  <div className={`p-1.5 border rounded-lg ${
                                    exCompleted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' : 'bg-sunken border-line text-ink'
                                  }`}>
                                    <ExerciseIcon type={exercise.type} />
                                  </div>
                                  
                                  <div className="flex-1 text-left">
                                    <div className="flex items-center gap-3 mb-1">
                                      <span className="font-medium text-sm text-ink line-clamp-1">{exercise.title}</span>
                                      <DifficultyBadge difficulty={exercise.difficulty} />
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-ink-3 uppercase tracking-wider">
                                      <span>{exercise.type}</span>
                                      <span>•</span>
                                      <span>{exercise.estimated_time_minutes} min</span>
                                    </div>
                                  </div>
                                  
                                  {exCompleted ? (
                                    <div className="text-emerald-700">
                                      <CheckCircle className="w-5 h-5" />
                                    </div>
                                  ) : (
                                    <ChevronDown className={`w-5 h-5 text-ink-3 transition-transform ${exExpanded ? 'rotate-180' : ''}`} />
                                  )}
                                </button>

                                {exExpanded && (
                                  <div className="px-4 pb-4 border-t border-line pt-4 bg-surface">
                                    <p className="text-ink-3 text-sm mb-4 bg-surface p-4 rounded-xl border border-line leading-relaxed">{exercise.description}</p>
                                    
                                    {/* Hints */}
                                    {exercise.hints?.length > 0 && (
                                      <div className="bg-sunken border border-line rounded-xl p-4 mb-4">
                                        <div className="flex items-center gap-2 text-ink-3 font-semibold mb-2 uppercase text-xs tracking-widest">
                                          <Lightbulb className="w-3.5 h-3.5" /> Hints
                                        </div>
                                        <ul className="space-y-1 pl-2">
                                          {exercise.hints.map((hint, idx) => (
                                            <li key={idx} className="text-ink-2 text-xs flex gap-2">
                                              <span className="text-ink-3">•</span> {hint}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Solution */}
                                    {exercise.solution && (
                                      <div className="bg-surface text-ink border border-line rounded-xl p-4 mb-4">
                                        <div className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-widest">Solution</div>
                                        <div className="text-sm prose prose-invert max-w-none">
                                          <ReactMarkdown>{exercise.solution}</ReactMarkdown>
                                        </div>
                                      </div>
                                    )}

                                    {/* Complete Button */}
                                    <Button
                                      onClick={() => handleCompleteExercise(exercise.id)}
                                      disabled={exCompleted}
                                      variant={exCompleted ? 'outline' : 'primary'}
                                      className={`w-full ${exCompleted ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 opacity-100 hover:bg-emerald-500/10 hover:text-emerald-700' : ''}`}
                                    >
                                      {exCompleted ? (
                                        <>
                                          <CheckCircle className="w-4 h-4" /> Completed
                                        </>
                                      ) : 'Mark as Complete'}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Complete Topic Action Row */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-line">
                      <Button
                        onClick={() => navigate(`/courses/${courseId}/learn?node=${topic.node_id}`)}
                        variant="outline"
                        className="flex-1"
                      >
                        <Brain className="w-4 h-4" /> Practice in Study Mode
                      </Button>
                      <Button
                        onClick={() => handleCompleteTopic(topic.node_id)}
                        disabled={isCompleted}
                        variant={isCompleted ? 'outline' : 'primary'}
                        className={`flex-1 ${isCompleted ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 opacity-100 hover:bg-emerald-500/10 hover:text-emerald-700' : ''}`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckCircle className="w-4 h-4" /> Topic Completed
                          </>
                        ) : (
                          <>
                            <Award className="w-4 h-4" /> Mark Topic Complete
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Regenerate Confirmation Modal */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 bg-ink/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line rounded-2xl p-8 max-w-md w-full">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-sunken border border-line rounded-full flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-8 h-8 text-ink-3" />
              </div>
              <h3 className="text-xl font-light text-ink mb-2">Regenerate Plan?</h3>
              <p className="text-ink-3 text-sm leading-relaxed">
                This will delete your current plan and all progress, then generate a new one based on the latest knowledge graph.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowRegenerateConfirm(false)}
                variant="ghost"
                className="flex-1 text-ink-3 hover:text-ink"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setShowRegenerateConfirm(false);
                  handleGeneratePlan();
                }}
                variant="primary"
                className="flex-1"
              >
                Yes, Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Deep Dive Plan Modal */}
      {showTopicPlanModal && topicPlan && (
        <div className="fixed inset-0 bg-ink/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-surface border-b border-line px-8 py-6 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-xl font-light text-ink">{topicPlan.title}</h2>
                <p className="text-xs text-ink-3 mt-1">{topicPlan.description}</p>
              </div>
              <button
                onClick={() => setShowTopicPlanModal(false)}
                className="p-2 bg-sunken border border-line rounded-lg hover:border-line-strong transition-all text-ink-3 hover:text-ink"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 overflow-y-auto space-y-8">
              {/* Learning Path */}
              {topicPlan.learning_path?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-ink-3 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Learning Path
                  </h3>
                  <div className="space-y-3">
                    {topicPlan.learning_path.map((step: any) => (
                      <div key={step.step} className="flex gap-4 p-5 bg-sunken border border-line rounded-xl">
                        <div className="w-10 h-10 bg-sunken-2 text-ink border border-line-strong rounded-xl flex items-center justify-center shrink-0">
                          <span className="text-base font-semibold">{step.step}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-medium text-ink text-base">{step.title}</h4>
                            <span className="bg-sunken-2 px-2 py-0.5 rounded border border-line-strong text-[10px] font-semibold text-ink-3">
                              {step.estimated_minutes} min
                            </span>
                          </div>
                          <p className="text-sm text-ink-3 mb-3 leading-relaxed">{step.content}</p>
                          {step.document_references?.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                              {step.document_references.map((doc: string, idx: number) => (
                                <span key={idx} className="px-2 py-1 bg-sunken-2 border border-line-strong text-ink-3 rounded text-xs">
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
                  <h3 className="text-sm font-semibold text-ink-3 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Practice Exercises
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {topicPlan.exercises.map((ex: any, idx: number) => (
                      <div key={idx} className="p-5 bg-sunken border border-line rounded-xl flex flex-col h-full">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-sunken-2 text-ink border border-line-strong rounded-lg">
                            <ExerciseIcon type={ex.type} />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-ink text-base leading-tight">{ex.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <DifficultyBadge difficulty={ex.difficulty} />
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-ink-3 mb-4 flex-grow leading-relaxed">{ex.description}</p>
                        
                        <div className="space-y-3 mt-auto">
                          {ex.hints?.length > 0 && (
                            <div className="p-3 bg-surface border border-line rounded-xl">
                              <p className="text-[10px] text-ink-3 font-semibold uppercase mb-1 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> Hints
                              </p>
                              <ul className="pl-2 space-y-1">
                                {ex.hints.map((h: string, i: number) => (
                                  <li key={i} className="text-xs text-ink-3">• {h}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {ex.solution && (
                            <details className="group bg-surface text-ink border border-line rounded-xl cursor-pointer">
                              <summary className="p-3 font-medium text-xs uppercase tracking-wider flex justify-between items-center outline-none bg-sunken rounded-xl">
                                View Solution
                                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-ink-3" />
                              </summary>
                              <div className="p-4 border-t border-line text-xs text-ink-2 prose prose-invert max-w-none">
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
                  <h3 className="text-sm font-semibold text-ink-3 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Self-Check Questions
                  </h3>
                  <div className="space-y-3">
                    {topicPlan.self_check_questions.map((q: any, idx: number) => (
                      <details key={idx} className="group p-4 bg-sunken border border-line rounded-xl cursor-pointer">
                        <summary className="text-ink font-medium text-sm flex justify-between items-center outline-none">
                          {q.question}
                          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 shrink-0 text-ink-3" />
                        </summary>
                        <div className="mt-3 pt-3 border-t border-line bg-surface rounded-lg p-3">
                          <p className="text-sm text-ink font-medium"><span className="text-emerald-700 font-semibold uppercase text-xs">Answer:</span> {q.answer}</p>
                          {q.explanation && <p className="text-ink-3 text-xs mt-1">{q.explanation}</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* Related Topics */}
              {topicPlan.related_topics?.length > 0 && (
                <div className="pt-4 border-t border-line">
                  <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3">Jump to Related Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {topicPlan.related_topics.map((t: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setShowTopicPlanModal(false);
                          navigate(`/courses/${courseId}/learn?node=${t.node_id}`);
                        }}
                        className="px-3 py-1.5 bg-sunken text-ink border border-line hover:border-line-strong rounded-xl font-medium text-xs transition-all"
                      >
                        {t.label} <span className="text-ink-3">({t.relation})</span>
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
