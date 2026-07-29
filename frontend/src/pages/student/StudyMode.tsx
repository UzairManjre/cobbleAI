import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { useAuthStore } from '../../store/authStore';
import KnowledgeGraph from '../../components/graph/KnowledgeGraph';
import TutorChat from '../../components/graph/TutorChat';
import NodeInfo from '../../components/graph/NodeInfo';
import { ArrowLeft, BookOpen, RefreshCw } from 'lucide-react';

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
    generateGraph,
    generateFromDocs,
    navigateToNode,
    isLoading,
    error,
    autoIntroNodeId,
    startTopicIntro,
    fetchCourseGraph,
    setCurrentNode
  } = useGraphStore();

  const [topic, setTopic] = useState('');
  const [showGenerator, setShowGenerator] = useState(true);
  const [mode, setMode] = useState<'topic' | 'docs'>('docs');
  const [isCheckingGraph, setIsCheckingGraph] = useState(false);
  const [isGraphCollapsed, setIsGraphCollapsed] = useState(false);

  // Handle auto-intro from Mind Map
  useEffect(() => {
    if (autoIntroNodeId && autoIntroNodeId === currentNodeId && !isLoading) {
      startTopicIntro(autoIntroNodeId);
    }
  }, [autoIntroNodeId, currentNodeId, isLoading, startTopicIntro]);

  // Handle node query parameter from StudyPlan
  useEffect(() => {
    const nodeId = searchParams.get('node');
    if (nodeId && nodes.length > 0 && !isLoading) {
      // Navigate to the specified node
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

  const initStudySession = async () => {
    setIsCheckingGraph(true);
    try {
      await fetchCourseGraph(courseId!);
      const state = useGraphStore.getState();
      console.log('StudyMode - Graph state after fetch:', {
        nodesCount: state.nodes?.length || 0,
        edgesCount: state.edges?.length || 0,
        currentNodeId: state.currentNodeId,
        graphId: state.graphId,
        error: state.error
      });
      
      if (state.nodes && state.nodes.length > 0) {
        setShowGenerator(false);
        // Ensure currentNodeId is set
        if (!state.currentNodeId && state.nodes.length > 0) {
          setCurrentNode(state.nodes[0].id);
        }
      } else if (state.error) {
        console.error('Graph fetch error:', state.error);
      }
    } catch (err) {
      console.log('No existing graph found, showing generator:', err);
    } finally {
      setIsCheckingGraph(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() && mode === 'topic') return;

    if (mode === 'docs' && courseId) {
      await generateFromDocs(courseId);
    } else {
      await generateGraph(topic.trim(), courseId);
    }
    setShowGenerator(false);
  };

  const handleNodeClick = (nodeId: string) => {
    navigateToNode(nodeId);
  };

  if (isCheckingGraph) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-[#FF4D5B] animate-spin mx-auto mb-4 stroke-[3px]" />
          <div className="text-[#0A0A0A]/60 font-black tracking-wider text-xl">LOADING STUDY SESSION...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] flex items-center justify-center p-8">
        <div className="max-w-md text-center bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-10 shadow-[8px_8px_0_#0A0A0A]">
          <div className="w-20 h-20 bg-red-100 border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mx-auto mb-6 shadow-[4px_4px_0_#0A0A0A]">
            <span className="text-4xl">⚠️</span>
          </div>
          <h2 className="text-2xl font-black text-[#0A0A0A] mb-3">Error Loading Graph</h2>
          <p className="text-[#0A0A0A]/70 font-bold mb-8 font-['Inter']">{error}</p>
          <button
            onClick={() => initStudySession()}
            className="px-6 py-3 bg-white text-[#0A0A0A] border-[3px] border-[#0A0A0A] rounded-xl font-black shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-[2px_2px_0_#0A0A0A] transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (showGenerator) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] flex flex-col items-center justify-center p-8">
        <div className="max-w-xl w-full">
          <button
            onClick={() => navigate(courseId ? `/${role}/courses/${courseId}` : dashboardRoute)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 active:shadow-none transition-all mb-8 w-fit"
          >
            <ArrowLeft className="w-4 h-4 stroke-[3px]" />
            <span className="text-sm">Back</span>
          </button>

          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-10 shadow-[8px_8px_0_#0A0A0A]">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 rounded-2xl bg-[#FFD166] border-[3px] border-[#0A0A0A] flex items-center justify-center shadow-[4px_4px_0_#0A0A0A]">
                <BookOpen className="w-8 h-8 text-[#0A0A0A] stroke-[2.5px]" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-[#0A0A0A] tracking-tight">Generate Knowledge Graph</h1>
                <p className="text-sm font-bold text-[#0A0A0A]/60 mt-1 uppercase tracking-wider">Choose how to build your learning graph</p>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setMode('topic')}
                className={`flex-1 py-3 px-4 border-[3px] border-[#0A0A0A] rounded-xl text-lg font-black transition-all ${
                  mode === 'topic' ? 'bg-[#118AB2] text-white shadow-[4px_4px_0_#0A0A0A]' : 'bg-gray-100 text-[#0A0A0A]/50 shadow-none hover:bg-gray-200'
                }`}
              >
                From Topic
              </button>
              <button
                onClick={() => setMode('docs')}
                className={`flex-1 py-3 px-4 border-[3px] border-[#0A0A0A] rounded-xl text-lg font-black transition-all ${
                  mode === 'docs' ? 'bg-[#118AB2] text-white shadow-[4px_4px_0_#0A0A0A]' : 'bg-gray-100 text-[#0A0A0A]/50 shadow-none hover:bg-gray-200'
                }`}
              >
                From Documents
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-6">
              {mode === 'topic' ? (
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Machine Learning, Quantum Physics"
                  className="w-full bg-white border-[3px] border-[#0A0A0A] rounded-xl px-5 py-4 text-lg font-bold text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none focus:ring-4 focus:ring-[#FF4D5B]/30 shadow-[4px_4px_0_#0A0A0A] transition-all"
                  disabled={isLoading}
                />
              ) : (
                <div className="p-6 bg-[#06D6A0]/10 border-2 border-[#0A0A0A] rounded-xl text-lg font-bold text-[#0A0A0A] text-center shadow-[4px_4px_0_#06D6A0]">
                  Will extract concepts from all uploaded course documents and build a connected knowledge graph.
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading || (mode === 'topic' && !topic.trim())}
                className="w-full bg-[#FF4D5B] text-white border-[3px] border-[#0A0A0A] disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[6px_6px_0_#0A0A0A] py-4 rounded-xl text-xl font-black transition-all shadow-[6px_6px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[8px_8px_0_#0A0A0A] active:translate-y-0 active:shadow-[2px_2px_0_#0A0A0A] flex justify-center items-center gap-2"
              >
                {isLoading ? (
                   <>
                     <RefreshCw className="w-6 h-6 animate-spin stroke-[3px]" />
                     {mode === 'docs' ? 'Extracting...' : 'Generating...'}
                   </>
                ) : (
                  mode === 'docs' ? 'Generate from Documents' : 'Generate Graph'
                )}
              </button>
            </form>

            {error && (
              <div className="mt-6 p-4 bg-red-50 border-2 border-red-500 rounded-xl text-red-600 font-bold shadow-[4px_4px_0_#EF4444]">
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
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] flex items-center justify-center">
        <div className="text-xl font-black uppercase tracking-widest text-[#0A0A0A]/40">No active session</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b-[3px] border-[#0A0A0A] flex items-center justify-between px-6 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(courseId ? `/${role}/courses/${courseId}` : dashboardRoute)}
            className="px-3 py-1.5 bg-white border-2 border-[#0A0A0A] rounded-lg shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5 text-[#0A0A0A] stroke-[3px]" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">Study Mode</h1>
            <p className="text-[12px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest">
              {nodes.length} concepts • {edges.length} connections
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsGraphCollapsed(!isGraphCollapsed)}
            className="px-4 py-2 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2 text-xs uppercase tracking-wider"
          >
            {isGraphCollapsed ? '🕸 Show Graph' : '💬 Focus Tutor Chat'}
          </button>

          <div className="bg-[#FFD166] border-2 border-[#0A0A0A] px-3 py-1.5 rounded-lg shadow-[2px_2px_0_#0A0A0A] text-[12px] font-black uppercase tracking-wider">
            Visited: {useGraphStore.getState().visitedNodes.length}/{nodes.length}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* If graph is NOT collapsed, render the graph section */}
        {!isGraphCollapsed && (
          <div className="flex-1 border-r-[3px] border-[#0A0A0A] relative bg-gray-50/50">
            <KnowledgeGraph onNodeClick={handleNodeClick} />
          </div>
        )}

        {/* Panels */}
        {isGraphCollapsed ? (
          // Collapsed Mode: Dual Column Layout (40% Node Info / 60% Massive Chat)
          <div className="w-full h-full flex overflow-hidden bg-white">
            <div className="flex-[4] overflow-y-auto border-r-[3px] border-[#0A0A0A] relative bg-white">
              <NodeInfo nodeId={activeNodeId} onNavigate={handleNodeClick} />
            </div>
            <div className="flex-[6] overflow-hidden relative bg-gray-50/50">
              <TutorChat key={activeNodeId} nodeId={activeNodeId} isMassive={true} />
            </div>
          </div>
        ) : (
          // Normal Mode: standard right panel stack
          <div className="w-[450px] flex flex-col overflow-hidden bg-white shrink-0">
            {/* Node Info */}
            <div className="flex-1 overflow-y-auto border-b-[3px] border-[#0A0A0A]">
              <NodeInfo nodeId={activeNodeId} onNavigate={handleNodeClick} />
            </div>

            {/* Chat */}
            <div className="h-[450px] bg-gray-50/50 shrink-0">
              <TutorChat key={activeNodeId} nodeId={activeNodeId} />
            </div>
          </div>
        )}

        {/* Floating Toggle Button for collapsed mode */}
        {isGraphCollapsed && (
          <button
            onClick={() => setIsGraphCollapsed(false)}
            className="absolute bottom-6 left-6 z-30 px-5 py-3.5 bg-[#118AB2] text-white border-[3px] border-[#0A0A0A] rounded-2xl font-black shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-[2px_2px_0_#0A0A0A] transition-all flex items-center gap-2.5 uppercase text-[10px] tracking-widest cursor-pointer"
          >
            <span className="text-sm">🕸</span> Show Knowledge Graph
          </button>
        )}
      </div>

      {error && (
        <div className="fixed bottom-6 right-6 p-4 bg-red-50 border-[3px] border-[#0A0A0A] rounded-xl text-red-600 font-bold shadow-[6px_6px_0_#EF4444] max-w-md z-50">
          {error}
        </div>
      )}
    </div>
  );
}
