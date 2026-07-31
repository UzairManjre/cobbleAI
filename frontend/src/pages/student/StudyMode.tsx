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
    fetchCourseGraph,
    setCurrentNode
  } = useGraphStore();

  const [topic, setTopic] = useState('');
  const [showGenerator, setShowGenerator] = useState(true);
  const [mode, setMode] = useState<'topic' | 'docs'>('docs');
  const [isCheckingGraph, setIsCheckingGraph] = useState(false);
  const [isGraphCollapsed, setIsGraphCollapsed] = useState(false);

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

            {/* Mode Toggle */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setMode('topic')}
                className={`flex-1 py-3 px-4 border rounded-xl text-sm font-semibold transition-all ${
                  mode === 'topic' ? 'bg-white text-black border-white' : 'bg-[#111111] text-[#888888] border-[#1A1A1A] hover:text-white'
                }`}
              >
                From Topic
              </button>
              <button
                onClick={() => setMode('docs')}
                className={`flex-1 py-3 px-4 border rounded-xl text-sm font-semibold transition-all ${
                  mode === 'docs' ? 'bg-white text-black border-white' : 'bg-[#111111] text-[#888888] border-[#1A1A1A] hover:text-white'
                }`}
              >
                From Documents
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-5">
              {mode === 'topic' ? (
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
                disabled={isLoading || (mode === 'topic' && !topic.trim())}
                className="w-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50 py-3.5 rounded-xl text-sm font-semibold transition-all flex justify-center items-center gap-2"
              >
                {isLoading ? (
                   <>
                     <RefreshCw className="w-4 h-4 animate-spin" />
                     {mode === 'docs' ? 'Extracting...' : 'Generating...'}
                   </>
                ) : (
                  mode === 'docs' ? 'Generate from Documents' : 'Generate Graph'
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
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="h-16 bg-[#0A0A0A] border-b border-[#1A1A1A] flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(courseId ? `/${role}/courses/${courseId}` : dashboardRoute)}
            className="p-2 bg-[#111111] border border-[#1A1A1A] rounded-lg hover:border-[#333333] transition-all text-[#888888] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-medium tracking-tight uppercase text-white">Study Mode</h1>
            <p className="text-[11px] font-semibold text-[#888888] uppercase tracking-widest">
              {nodes.length} concepts • {edges.length} connections
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsGraphCollapsed(!isGraphCollapsed)}
            className="px-4 py-2 bg-[#111111] text-white border border-[#1A1A1A] hover:border-[#333333] rounded-xl font-medium transition-all text-xs uppercase tracking-wider"
          >
            {isGraphCollapsed ? '🕸 Show Graph' : '💬 Focus Tutor Chat'}
          </button>

          <div className="bg-[#111111] border border-[#1A1A1A] px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
            Visited: <span className="text-white">{useGraphStore.getState().visitedNodes.length}</span>/{nodes.length}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {!isGraphCollapsed && (
          <div className="flex-1 border-r border-[#1A1A1A] relative bg-[#050505]">
            <KnowledgeGraph onNodeClick={handleNodeClick} />
          </div>
        )}

        {/* Panels */}
        {isGraphCollapsed ? (
          <div className="w-full h-full flex overflow-hidden bg-black">
            <div className="flex-[4] overflow-y-auto border-r border-[#1A1A1A] relative bg-[#0A0A0A]">
              <NodeInfo nodeId={activeNodeId} onNavigate={handleNodeClick} />
            </div>
            <div className="flex-[6] overflow-hidden relative bg-[#050505]">
              <TutorChat key={activeNodeId} nodeId={activeNodeId} isMassive={true} />
            </div>
          </div>
        ) : (
          <div className="w-[450px] flex flex-col overflow-hidden bg-[#0A0A0A] shrink-0">
            {/* Node Info */}
            <div className="flex-1 overflow-y-auto border-b border-[#1A1A1A]">
              <NodeInfo nodeId={activeNodeId} onNavigate={handleNodeClick} />
            </div>

            {/* Chat */}
            <div className="h-[450px] bg-[#050505] shrink-0">
              <TutorChat key={activeNodeId} nodeId={activeNodeId} />
            </div>
          </div>
        )}

        {/* Floating Toggle Button for collapsed mode */}
        {isGraphCollapsed && (
          <button
            onClick={() => setIsGraphCollapsed(false)}
            className="absolute bottom-6 left-6 z-30 px-4 py-3 bg-[#111111] text-white border border-[#1A1A1A] hover:border-[#333333] rounded-xl font-medium transition-all flex items-center gap-2 text-xs uppercase tracking-widest shadow-2xl cursor-pointer"
          >
            <span>🕸</span> Show Knowledge Graph
          </button>
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
