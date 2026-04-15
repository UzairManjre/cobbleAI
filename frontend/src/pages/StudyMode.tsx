import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useGraphStore } from '../store/graphStore';
import KnowledgeGraph from '../components/graph/KnowledgeGraph';
import TutorChat from '../components/graph/TutorChat';
import NodeInfo from '../components/graph/NodeInfo';
import { ArrowLeft, BookOpen } from 'lucide-react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

export default function StudyMode() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    nodes,
    edges,
    currentNodeId,
    generateGraph,
    generateFromDocs,
    navigateToNode,
    isLoading,
    error,
    loadSession,
    autoIntroNodeId,
    startTopicIntro,
    fetchCourseGraph,
    setCurrentNode
  } = useGraphStore();

  const [topic, setTopic] = useState('');
  const [showGenerator, setShowGenerator] = useState(true);
  const [mode, setMode] = useState<'topic' | 'docs'>('docs');
  const [isCheckingGraph, setIsCheckingGraph] = useState(false);

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
      const graph = useGraphStore.getState().nodes;
      if (graph && graph.length > 0) {
        setShowGenerator(false);
      }
    } catch (err) {
      console.log('No existing graph found, showing generator');
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
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-8">
        <div className="text-white/20 text-[14px]">Checking for existing graphs...</div>
      </div>
    );
  }

  if (showGenerator) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-8">
        <div className="max-w-lg w-full">
          <button
            onClick={() => navigate(courseId ? `/course/${courseId}` : '/dashboard')}
            className="flex items-center gap-2 text-white/40 hover:text-white/70 mb-12 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-[13px]">Back</span>
          </button>

          <div className="bg-white/[0.02] border border-white/[0.06] rounded-3xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white/60" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Generate Knowledge Graph</h1>
                <p className="text-sm text-white/40 mt-0.5">Choose how to build your learning graph</p>
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex gap-2 mb-6 p-1 bg-white/[0.03] rounded-xl">
              <button
                onClick={() => setMode('topic')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  mode === 'topic' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                From Topic
              </button>
              <button
                onClick={() => setMode('docs')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  mode === 'docs' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                From Documents
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              {mode === 'topic' ? (
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Machine Learning, Photosynthesis, Quantum Physics"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
                  disabled={isLoading}
                />
              ) : (
                <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-white/60">
                  Will extract concepts from all uploaded course documents and build a connected knowledge graph.
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading || (mode === 'topic' && !topic.trim())}
                className="w-full bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:hover:bg-[var(--accent)] py-3 rounded-xl text-sm font-semibold transition-all"
              >
                {isLoading ? (mode === 'docs' ? 'Extracting from Documents...' : 'Generating Graph...') : (mode === 'docs' ? 'Generate from Documents' : 'Generate Graph')}
              </button>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[12px]">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!currentNodeId) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-white/20 text-[14px]">No active session</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0A0A0A] text-white flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(courseId ? `/course/${courseId}` : '/dashboard')}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-white/60" />
          </button>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Study Mode</h1>
            <p className="text-[11px] text-white/30">
              {nodes.length} concepts • {edges.length} connections
            </p>
          </div>
        </div>
        <div className="text-[11px] text-white/30">
          Visited: {useGraphStore.getState().visitedNodes.length}/{nodes.length}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph */}
        <div className="flex-1 border-r border-white/[0.06]">
          <KnowledgeGraph onNodeClick={handleNodeClick} />
        </div>

        {/* Right Panel */}
        <div className="w-[380px] flex flex-col overflow-hidden">
          {/* Node Info */}
          <div className="flex-1 overflow-y-auto border-b border-white/[0.06]">
            <NodeInfo nodeId={currentNodeId} onNavigate={handleNodeClick} />
          </div>

          {/* Chat */}
          <div className="h-[400px]">
            <TutorChat key={currentNodeId} nodeId={currentNodeId} />
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed bottom-6 right-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[13px] max-w-md">
          {error}
        </div>
      )}
    </div>
  );
}
