import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { useAuthStore } from '../../store/authStore';
import KnowledgeGraph from '../../components/graph/KnowledgeGraph';
import TutorChat from '../../components/graph/TutorChat';
import NodeInfo from '../../components/graph/NodeInfo';
import {
  ArrowLeft, BookOpen, RefreshCw, GraduationCap,
  RotateCcw, CheckCircle2, Sparkles, ChevronLeft,
  ChevronRight, Award, Lock, HelpCircle
} from 'lucide-react';

export default function StudyMode() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { role } = useAuthStore();
  const dashboardRoute = role === 'professor' ? '/professor/dashboard' : '/student/dashboard';

  const {
    nodes,
    edges,
    currentNodeId,
    visitedNodes,
    masteredNodes,
    generateGraph,
    generateFromDocs,
    navigateToNode,
    isLoading,
    error,
    fetchCourseGraph,
    setCurrentNode,
    toggleMastered
  } = useGraphStore();

  const [topic, setTopic] = useState('');
  const [showGenerator, setShowGenerator] = useState(true);
  const [generatorMode, setGeneratorMode] = useState<'topic' | 'docs'>('docs');
  const [isCheckingGraph, setIsCheckingGraph] = useState(false);
  const [isGraphCollapsed, setIsGraphCollapsed] = useState(false);

  // Mode switcher: 'teach' = Socratic Graph Exploration, 'review' = Active Recall & Flashcards
  const [studyTab, setStudyTab] = useState<'teach' | 'review'>('teach');

  // Flashcard state for Review Mode
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // Handle node query parameter from StudyPlan
  useEffect(() => {
    const nodeId = searchParams.get('node');
    if (nodeId && nodes.length > 0 && !isLoading) {
      setCurrentNode(nodeId);
      navigateToNode(nodeId);
    }
  }, [nodes.length, isLoading, searchParams, setCurrentNode, navigateToNode]);

  // Check for existing graph on mount
  useEffect(() => {
    if (courseId) {
      initStudySession();
    }
  }, [courseId]);

  // Reset card flip when navigating to a new node
  useEffect(() => {
    setIsCardFlipped(false);
  }, [currentNodeId]);

  const initStudySession = async () => {
    setIsCheckingGraph(true);
    try {
      await fetchCourseGraph(courseId!);
      const state = useGraphStore.getState();
      
      if (state.nodes && state.nodes.length > 0) {
        setShowGenerator(false);
        if (!state.currentNodeId && state.nodes.length > 0) {
          setCurrentNode(state.nodes[0].id);
        }
      }
    } catch (err) {
      console.log('No existing graph found, showing generator:', err);
    } finally {
      setIsCheckingGraph(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() && generatorMode === 'topic') return;

    if (generatorMode === 'docs' && courseId) {
      await generateFromDocs(courseId);
    } else {
      await generateGraph(topic.trim(), courseId);
    }
    setShowGenerator(false);
  };

  const handleNodeClick = (nodeId: string) => {
    navigateToNode(nodeId);
  };

  // Node navigation helpers
  const currentIndex = nodes.findIndex(n => n.id === currentNodeId);
  const currentNode = nodes[currentIndex] || nodes[0];
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < nodes.length - 1;

  const handlePreviousNode = () => {
    if (canGoPrevious) {
      const prevId = nodes[currentIndex - 1].id;
      navigateToNode(prevId);
    }
  };

  const handleNextNode = () => {
    if (canGoNext) {
      const nextId = nodes[currentIndex + 1].id;
      navigateToNode(nextId);
    }
  };

  // Check if current node is locked based on incoming edges
  const incomingEdges = edges.filter(e => e.to === currentNode?.id);
  const isCurrentNodeLocked = incomingEdges.length > 0 && incomingEdges.some(
    e => !visitedNodes.includes(e.from) && !masteredNodes.includes(e.from)
  );

  const masteredCount = masteredNodes.length;
  const masteryPercentage = nodes.length > 0 ? Math.round((masteredCount / nodes.length) * 100) : 0;

  if (isCheckingGraph) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 text-white animate-spin mx-auto mb-4" />
          <div className="text-[#888888] font-medium tracking-widest uppercase text-sm">LOADING STUDY SESSION...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-md text-center bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-8">
          <div className="w-16 h-16 bg-[#111111] border border-[#1A1A1A] rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            ⚠️
          </div>
          <h2 className="text-xl font-light text-white mb-2">Error Loading Graph</h2>
          <p className="text-[#888888] text-sm mb-6">{error}</p>
          <button
            onClick={() => initStudySession()}
            className="px-6 py-2.5 bg-white text-black hover:bg-neutral-200 rounded-xl font-semibold text-sm transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (showGenerator) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <div className="max-w-xl w-full">
          <button
            onClick={() => navigate(courseId ? `/${role}/courses/${courseId}` : dashboardRoute)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0A0A0A] text-white border border-[#1A1A1A] hover:border-[#333333] rounded-xl font-medium transition-all mb-8 w-fit text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-3xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-[#111111] border border-[#1A1A1A] flex items-center justify-center text-white">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-light text-white tracking-tight">Generate Knowledge Graph</h1>
                <p className="text-xs text-[#888888] mt-0.5 uppercase tracking-widest font-semibold">Choose how to build your learning graph</p>
              </div>
            </div>

            {/* Generator Mode Toggle */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setGeneratorMode('topic')}
                className={`flex-1 py-3 px-4 border rounded-xl text-sm font-semibold transition-all ${
                  generatorMode === 'topic' ? 'bg-white text-black border-white' : 'bg-[#111111] text-[#888888] border-[#1A1A1A] hover:text-white'
                }`}
              >
                From Topic
              </button>
              <button
                onClick={() => setGeneratorMode('docs')}
                className={`flex-1 py-3 px-4 border rounded-xl text-sm font-semibold transition-all ${
                  generatorMode === 'docs' ? 'bg-white text-black border-white' : 'bg-[#111111] text-[#888888] border-[#1A1A1A] hover:text-white'
                }`}
              >
                From Documents
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-5">
              {generatorMode === 'topic' ? (
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Machine Learning, Quantum Physics"
                  className="w-full bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#555555] focus:outline-none focus:border-[#333333] transition-all"
                  disabled={isLoading}
                />
              ) : (
                <div className="p-4 bg-[#111111] border border-[#1A1A1A] rounded-xl text-xs text-[#888888] text-center leading-relaxed font-medium">
                  Will extract concepts from all uploaded course documents and build a connected knowledge graph.
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading || (generatorMode === 'topic' && !topic.trim())}
                className="w-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50 py-3.5 rounded-xl text-sm font-semibold transition-all flex justify-center items-center gap-2"
              >
                {isLoading ? (
                   <>
                     <RefreshCw className="w-4 h-4 animate-spin" />
                     {generatorMode === 'docs' ? 'Extracting...' : 'Generating...'}
                   </>
                ) : (
                  generatorMode === 'docs' ? 'Generate from Documents' : 'Generate Graph'
                )}
              </button>
            </form>

            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 font-medium text-xs">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const activeNodeId = currentNodeId || (nodes.length > 0 ? nodes[0].id : null);

  if (!activeNodeId) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-sm font-semibold uppercase tracking-widest text-[#888888]">No active session</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col font-sans">
      
      {/* Universal Top Bar */}
      <header className="h-16 bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center justify-between px-6 shrink-0 z-20">
        
        {/* Left: Back & Title */}
        <div className="flex items-center gap-5">
          <button
            onClick={() => navigate(courseId ? `/${role}/courses/${courseId}` : dashboardRoute)}
            className="p-2 bg-[#111111] border border-[#1A1A1A] rounded-lg hover:border-[#333333] transition-all text-[#888888] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-medium tracking-tight uppercase text-white flex items-center gap-2">
              Study Space
            </h1>
            <p className="text-[11px] font-semibold text-[#888888] uppercase tracking-widest">
              {nodes.length} concepts • {edges.length} connections
            </p>
          </div>
        </div>

        {/* Center: Dedicated Mode Switcher Tabs */}
        <div className="bg-[#111111] border border-[#1A1A1A] p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setStudyTab('teach')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              studyTab === 'teach'
                ? 'bg-white text-black shadow-sm'
                : 'text-[#888888] hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Teach Mode</span>
          </button>

          <button
            onClick={() => setStudyTab('review')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              studyTab === 'review'
                ? 'bg-white text-black shadow-sm'
                : 'text-[#888888] hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Review Mode</span>
            {masteredCount > 0 && (
              <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded text-[10px]">
                {masteredCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Stats & Graph Collapse Toggle */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 bg-[#111111] border border-[#1A1A1A] px-3 py-1.5 rounded-xl text-xs font-medium text-[#888888]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Visited: <strong className="text-white">{visitedNodes.length}</strong>/{nodes.length}
            </span>
            <span className="text-[#333333]">|</span>
            <span className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              Mastery: <strong className="text-emerald-400">{masteryPercentage}%</strong>
            </span>
          </div>

          {studyTab === 'teach' && (
            <button
              onClick={() => setIsGraphCollapsed(!isGraphCollapsed)}
              className="px-3 py-1.5 bg-[#111111] text-[#888888] hover:text-white border border-[#1A1A1A] hover:border-[#333333] rounded-xl font-medium transition-all text-xs uppercase tracking-wider"
            >
              {isGraphCollapsed ? '🕸 Show Graph' : '💬 Focus Chat'}
            </button>
          )}
        </div>

      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* =========================================================================
            TEACH MODE (Socratic Graph & Interactive Concept Progression)
           ========================================================================= */}
        {studyTab === 'teach' && (
          <>
            {/* Left Graph & Concept Details */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-[#1A1A1A]">
              {!isGraphCollapsed && (
                <div className="flex-1 relative bg-[#050505]">
                  <KnowledgeGraph onNodeClick={handleNodeClick} />
                </div>
              )}

              {/* Node Navigation Bar & Info Card */}
              <div className="bg-[#0A0A0A] border-t border-[#1A1A1A] p-4 shrink-0">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <button
                    onClick={handlePreviousNode}
                    disabled={!canGoPrevious}
                    className="px-3 py-1.5 bg-[#111111] border border-[#1A1A1A] rounded-xl text-xs text-[#888888] hover:text-white disabled:opacity-30 transition-all flex items-center gap-1"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </button>

                  <div className="text-center">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[#888888]">
                      Concept {currentIndex + 1} of {nodes.length}
                    </span>
                    {isCurrentNodeLocked && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        <Lock className="w-3 h-3" /> Prerequisite Required
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleNextNode}
                    disabled={!canGoNext}
                    className="px-3 py-1.5 bg-[#111111] border border-[#1A1A1A] rounded-xl text-xs text-[#888888] hover:text-white disabled:opacity-30 transition-all flex items-center gap-1"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <NodeInfo nodeId={activeNodeId} onNavigate={handleNodeClick} />
              </div>
            </div>

            {/* Right Panel: Socratic Tutor Chat */}
            <div className={`${isGraphCollapsed ? 'w-full' : 'w-[450px] shrink-0'} border-l border-[#1A1A1A]`}>
              <TutorChat key={activeNodeId} nodeId={activeNodeId} mode="teach" isMassive={isGraphCollapsed} />
            </div>
          </>
        )}

        {/* =========================================================================
            REVIEW MODE (Active Recall, Flashcards & Concept Mastery Audit)
           ========================================================================= */}
        {studyTab === 'review' && (
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left 60%: Active Recall Flashcards */}
            <div className="flex-1 overflow-y-auto p-8 bg-[#050505] flex flex-col justify-between">
              
              {/* Mastery Header Progress */}
              <div className="max-w-2xl mx-auto w-full mb-8">
                <div className="flex items-center justify-between text-xs font-semibold text-[#888888] mb-2 uppercase tracking-widest">
                  <span className="flex items-center gap-2 text-white">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Overall Graph Mastery
                  </span>
                  <span className="text-emerald-400">{masteredCount} of {nodes.length} Mastered ({masteryPercentage}%)</span>
                </div>
                <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${masteryPercentage}%` }}
                  />
                </div>
              </div>

              {/* Active Concept Flashcard */}
              <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col justify-center my-4">
                <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-3xl p-8 min-h-[320px] flex flex-col justify-between relative shadow-2xl transition-all">
                  
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest bg-[#111111] text-[#888888] px-2.5 py-1 rounded-md border border-[#1A1A1A]">
                        Card {currentIndex + 1} / {nodes.length}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        currentNode?.difficulty === 'advanced' ? 'bg-amber-500/20 text-amber-300' :
                        currentNode?.difficulty === 'beginner' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {currentNode?.difficulty || 'Core'}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleMastered(currentNode.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                        masteredNodes.includes(currentNode.id)
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-[#111111] text-[#888888] border-[#1A1A1A] hover:text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{masteredNodes.includes(currentNode.id) ? 'Mastered' : 'Mark Mastered'}</span>
                    </button>
                  </div>

                  {/* Card Content (Front vs Back) */}
                  {!isCardFlipped ? (
                    /* FRONT SIDE: Active Recall Challenge */
                    <div className="my-auto text-center space-y-4 py-6">
                      <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                        Concept Prompt
                      </span>
                      <h2 className="text-2xl font-light text-white leading-snug max-w-lg mx-auto">
                        {currentNode?.label}
                      </h2>
                      <p className="text-sm text-[#888888] max-w-md mx-auto leading-relaxed">
                        Can you recall the core definition, key mechanics, and practical applications of this concept?
                      </p>
                      <button
                        onClick={() => setIsCardFlipped(true)}
                        className="mt-6 px-6 py-3 bg-white text-black hover:bg-neutral-200 rounded-xl text-sm font-semibold transition-all inline-flex items-center gap-2"
                      >
                        <HelpCircle className="w-4 h-4" /> Flip to Reveal Answer & Explanation
                      </button>
                    </div>
                  ) : (
                    /* BACK SIDE: Explanation & Evaluation */
                    <div className="my-auto space-y-5 py-4 animate-in fade-in duration-300">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 block mb-1">
                          Core Explanation
                        </span>
                        <h3 className="text-xl font-medium text-white mb-2">{currentNode?.label}</h3>
                        <p className="text-sm text-[#CCCCCC] leading-relaxed bg-[#111111] p-4 rounded-xl border border-[#1A1A1A]">
                          {currentNode?.description}
                        </p>
                      </div>

                      {/* Self Assessment Actions */}
                      <div className="pt-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#888888] block mb-3 text-center">
                          Rate Your Understanding
                        </span>
                        <div className="grid grid-cols-3 gap-3">
                          <button
                            onClick={() => {
                              setIsCardFlipped(false);
                              handleNextNode();
                            }}
                            className="py-2.5 px-3 bg-[#111111] hover:bg-[#1A1A1A] text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold transition-all text-center"
                          >
                            ❌ Needs Review
                          </button>
                          <button
                            onClick={() => {
                              setIsCardFlipped(false);
                              handleNextNode();
                            }}
                            className="py-2.5 px-3 bg-[#111111] hover:bg-[#1A1A1A] text-amber-400 border border-amber-500/20 rounded-xl text-xs font-semibold transition-all text-center"
                          >
                            ⚡ Getting There
                          </button>
                          <button
                            onClick={() => {
                              if (!masteredNodes.includes(currentNode.id)) {
                                toggleMastered(currentNode.id);
                              }
                              setIsCardFlipped(false);
                              handleNextNode();
                            }}
                            className="py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all text-center"
                          >
                            ✅ Mastered!
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card Bottom Nav */}
                  <div className="flex items-center justify-between pt-6 border-t border-[#1A1A1A] text-xs text-[#888888]">
                    <button
                      onClick={handlePreviousNode}
                      disabled={!canGoPrevious}
                      className="hover:text-white disabled:opacity-30 flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous Concept
                    </button>

                    <button
                      onClick={() => setIsCardFlipped(!isCardFlipped)}
                      className="hover:text-white text-blue-400 flex items-center gap-1 font-medium"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Flip Card
                    </button>

                    <button
                      onClick={handleNextNode}
                      disabled={!canGoNext}
                      className="hover:text-white disabled:opacity-30 flex items-center gap-1"
                    >
                      Next Concept <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              </div>

              {/* Bottom Quick Node Selector */}
              <div className="max-w-2xl mx-auto w-full pt-4">
                <div className="flex items-center justify-center gap-1.5 overflow-x-auto py-2 hide-scrollbar">
                  {nodes.map((n, idx) => {
                    const isM = masteredNodes.includes(n.id);
                    const isC = n.id === currentNodeId;
                    return (
                      <button
                        key={n.id}
                        onClick={() => navigateToNode(n.id)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all flex items-center justify-center border ${
                          isC
                            ? 'bg-white text-black border-white'
                            : isM
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#0A0A0A] text-[#666666] border-[#1A1A1A] hover:text-white'
                        }`}
                        title={n.label}
                      >
                        {isM ? '✓' : idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right 40%: Targeted Review Chat */}
            <div className="w-[450px] shrink-0 border-l border-[#1A1A1A]">
              <TutorChat key={activeNodeId} nodeId={activeNodeId} mode="review" />
            </div>

          </div>
        )}

      </div>

      {error && (
        <div className="fixed bottom-6 right-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 font-medium text-xs max-w-md z-50">
          {error}
        </div>
      )}
    </div>
  );
}
