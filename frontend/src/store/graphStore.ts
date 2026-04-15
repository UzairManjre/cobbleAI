import { create } from 'zustand';
import axios from 'axios';
import { analytics } from '../utils/analytics';

const API_URL = 'http://127.0.0.1:8000';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    doc_id: string;
    filename: string;
    relevance_score: number;
  }>;
  created_at?: string;
}

interface GraphNode {
  id: string;
  label: string;
  description: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
}

interface GraphState {
  graphId: string | null;
  sessionId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNodeId: string | null;
  visitedNodes: string[];
  chatHistory: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  autoIntroNodeId: string | null; // New: node ID to automatically intro

  // Actions
  generateGraph: (topic: string, courseId?: string) => Promise<void>;
  fetchCourseGraph: (courseId: string) => Promise<void>;
  startTopicIntro: (nodeId: string) => Promise<void>;
  navigateToNode: (nodeId: string) => Promise<void>;
  askQuestion: (nodeId: string, question: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  setCurrentNode: (nodeId: string) => void;
  clearGraph: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graphId: null,
  sessionId: null,
  nodes: [],
  edges: [],
  currentNodeId: null,
  visitedNodes: [],
  chatHistory: [],
  isLoading: false,
  error: null,
  autoIntroNodeId: null,

  generateGraph: async (topic: string, courseId?: string) => {
    set({ isLoading: true, error: null });
    const startTime = Date.now();
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');
      const res = await axios.post(
        `${API_URL}/graph/generate`,
        { topic, course_id: courseId },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }
      );

      analytics.track('graph_generated', {
        graphId: res.data.graph_id,
        nodeCount: res.data.nodes.length,
        edgeCount: res.data.edges.length,
        generationTimeMs: Date.now() - startTime,
      });

      set({
        graphId: res.data.graph_id,
        sessionId: res.data.session_id,
        nodes: res.data.nodes,
        edges: res.data.edges,
        currentNodeId: res.data.nodes[0]?.id || null,
        visitedNodes: res.data.nodes[0]?.id ? [res.data.nodes[0].id] : [],
        chatHistory: [],
        isLoading: false
      });
    } catch (err: any) {
      analytics.track('graph_generation_failed', {
        topic,
        error: err.response?.data?.detail || err.message,
        durationMs: Date.now() - startTime,
      });
      set({ error: err.response?.data?.detail || 'Failed to generate graph', isLoading: false });
    }
  },

  generateFromDocs: async (courseId: string) => {
    set({ isLoading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');
      const res = await axios.post(
        `${API_URL}/graph/generate-from-docs`,
        { course_id: courseId },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }
      );

      set({
        graphId: res.data.graph_id,
        sessionId: res.data.session_id,
        nodes: res.data.nodes,
        edges: res.data.edges,
        currentNodeId: res.data.nodes[0]?.id || null,
        visitedNodes: res.data.nodes[0]?.id ? [res.data.nodes[0].id] : [],
        chatHistory: [],
        isLoading: false
      });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to generate graph from documents', isLoading: false });
    }
  },

  fetchCourseGraph: async (courseId: string) => {
    set({ isLoading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      // Fetch all graphs for this course
      const res = await axios.get(`${API_URL}/graph/course/${courseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.length > 0) {
        const graph = res.data[0];

        // Use graph data
        const graphData = {
          graphId: graph.id,
          nodes: graph.nodes,
          edges: graph.edges,
        };

        // Establish an active session for this graph
        const sessionRes = await axios.post(
          `${API_URL}/sessions/get-or-create`,
          { graph_id: graph.id },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Only update currentNodeId if it's not already set by user navigation
        // This prevents race conditions where user navigates while fetching
        const currentState = get();
        set({
          ...graphData,
          sessionId: sessionRes.data.id,
          // If user already navigated to a specific node, keep it. 
          // Otherwise use session's default node.
          currentNodeId: currentState.currentNodeId || sessionRes.data.current_node_id,
          visitedNodes: sessionRes.data.visited_nodes,
          chatHistory: sessionRes.data.chat_history || [],
          isLoading: false
        });
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to fetch course graph', isLoading: false });
    }
  },

  loadSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');
      const res = await axios.get(`${API_URL}/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      set({
        sessionId: res.data.id,
        graphId: res.data.graph_id,
        currentNodeId: res.data.current_node_id,
        visitedNodes: res.data.visited_nodes,
        chatHistory: (res.data.chat_history || []).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          sources: msg.sources || []
        })),
        isLoading: false
      });

      // Load graph data
      const graphRes = await axios.get(`${API_URL}/graph/${res.data.graph_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ nodes: graphRes.data.nodes, edges: graphRes.data.edges });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to load session', isLoading: false });
    }
  },

  navigateToNode: async (nodeId: string) => {
    const { sessionId, visitedNodes, nodes } = get();
    if (!sessionId) return;

    const isRevisit = visitedNodes.includes(nodeId);
    const nodeLabel = nodes.find(n => n.id === nodeId)?.label || '';

    // Optimistically update state to prevent context mismatch if user types quickly
    set({
      currentNodeId: nodeId,
      visitedNodes: isRevisit ? visitedNodes : [...visitedNodes, nodeId],
      chatHistory: [] // Clear chat history immediately
    });

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');
      const res = await axios.post(
        `${API_URL}/sessions/${sessionId}/navigate`,
        { node_id: nodeId },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }
      );

      // Track analytics
      analytics.track(isRevisit ? 'node_revisited' : 'node_visited', {
        nodeId,
        nodeLabel,
        visitOrder: visitedNodes.length + 1,
        isRevisit,
        totalVisitedNodes: res.data.visited_nodes?.length || 0,
      });

      // Sync with backend response (usually matches optimistic update)
      set({
        visitedNodes: res.data.visited_nodes
      });
    } catch (err: any) {
      // Revert on error if necessary, but usually we keep the UI state
      // or show an error toast. For now, we log the error.
      set({ error: err.response?.data?.detail || 'Failed to navigate' });
    }
  },

  askQuestion: async (nodeId: string, question: string) => {
    const { sessionId, nodes, chatHistory } = get();
    if (!sessionId) return;

    const nodeLabel = nodes.find(n => n.id === nodeId)?.label || '';
    const startTime = Date.now();

    // Optimistically add user message
    const userMsg: ChatMessage = { role: 'user', content: question };
    set((state) => ({ chatHistory: [...state.chatHistory, userMsg] }));

    // Track question asked
    analytics.track('question_asked', {
      nodeId,
      nodeLabel,
      questionLengthChars: question.length,
      wordCount: question.split(' ').length,
      sessionQuestionCount: chatHistory.filter(m => m.role === 'user').length + 1,
    });

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');
      const res = await axios.post(
        `${API_URL}/sessions/${sessionId}/ask`,
        { node_id: nodeId, question },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }
      );

      const latencyMs = Date.now() - startTime;

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources || []
      };
      set((state) => ({ chatHistory: [...state.chatHistory, assistantMsg] }));

      // Track answer received
      analytics.track('answer_received', {
        nodeId,
        nodeLabel,
        answerLengthChars: res.data.answer?.length || 0,
        hasSources: (res.data.sources?.length || 0) > 0,
        sourceCount: res.data.sources?.length || 0,
        responseLatencyMs: latencyMs,
      });
    } catch (err: any) {
      set({ error: err.response?.data?.detail || 'Failed to get answer' });
    }
  },

  startTopicIntro: async (nodeId: string) => {
    const { sessionId } = get();
    if (!sessionId) {
      // If no session, generate one or wait? 
      // For now, assume a session exists if we're in study mode
      return; 
    }

    const introQuestion = "Please introduce this topic, explain what it is, and how it connects to the other concepts shown in the mind map based on our documents.";
    
    // Call askQuestion with the automated intro question
    await get().askQuestion(nodeId, introQuestion);
    
    // Clear the flag after starting
    set({ autoIntroNodeId: null });
  },

  setCurrentNode: (nodeId: string) => {
    set({ currentNodeId: nodeId });
  },

  clearGraph: () => {
    set({
      graphId: null,
      sessionId: null,
      nodes: [],
      edges: [],
      currentNodeId: null,
      visitedNodes: [],
      chatHistory: [],
      error: null
    });
  }
}));
