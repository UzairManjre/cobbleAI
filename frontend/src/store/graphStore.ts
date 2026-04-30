import { create } from 'zustand';
import { graphsApi, sessionsApi, api } from '../api';
import { analytics } from '../utils/analytics';

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
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  position?: { x: number; y: number; z: number };
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
  generateFromDocs: (courseId: string) => Promise<void>;
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
      const res = await graphsApi.generate(topic, courseId);

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
      const res = await graphsApi.generateFromDocs(courseId);

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
      // Fetch all graphs for this course
      const res = await graphsApi.getByCourse(courseId);

      if (res.data && res.data.length > 0) {
        const graph = res.data[0];

        // Use graph data
        const graphData = {
          graphId: graph.id,
          nodes: graph.nodes,
          edges: graph.edges,
        };

        // Establish an active session for this graph
        const sessionRes = await sessionsApi.getOrCreate(graph.id);

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
      const res = await sessionsApi.get(sessionId);

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
      const graphRes = await graphsApi.get(res.data.graph_id);
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
      const res = await sessionsApi.navigate(sessionId, nodeId);

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

    // Optimistically add user message and empty assistant message
    const userMsg: ChatMessage = { role: 'user', content: question };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', sources: [] };
    
    set((state) => ({ 
      chatHistory: [...state.chatHistory, userMsg, assistantMsg],
      isLoading: true // Show thinking state initially
    }));

    // Track question asked
    analytics.track('question_asked', {
      nodeId,
      nodeLabel,
      questionLengthChars: question.length,
      wordCount: question.split(' ').length,
      sessionQuestionCount: chatHistory.filter(m => m.role === 'user').length + 1,
    });

    try {
      const { useAuthStore } = await import('./authStore');
      const { API_URL } = await import('../api/client');
      const token = useAuthStore.getState().token;

      const response = await fetch(`${API_URL}/sessions/${sessionId}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ node_id: nodeId, question })
      });

      if (!response.ok) {
        throw new Error('Failed to get answer');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedAnswer = '';
      let receivedSources: any[] = [];
      let pendingBuffer = ''; // Buffer for incomplete chunks

      if (reader) {
        set({ isLoading: false }); // Stop global loading once stream starts
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          pendingBuffer += chunk;
          
          // Process complete events
          const events = pendingBuffer.split('\n\n');
          // Keep the last part if it doesn't end with \n\n
          pendingBuffer = pendingBuffer.endsWith('\n\n') ? '' : events.pop() || '';

          for (const event of events) {
            if (!event.trim()) continue;
            
            // Allow multiple data: lines in a single event or handle them individually
            const lines = event.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.type === 'sources') {
                    receivedSources = data.sources;
                    set((state) => {
                      const newHistory = [...state.chatHistory];
                      newHistory[newHistory.length - 1] = {
                        ...newHistory[newHistory.length - 1],
                        sources: receivedSources
                      };
                      return { chatHistory: newHistory };
                    });
                  } else if (data.type === 'chunk') {
                    accumulatedAnswer += data.content;
                    set((state) => {
                      const newHistory = [...state.chatHistory];
                      newHistory[newHistory.length - 1] = {
                        ...newHistory[newHistory.length - 1],
                        content: accumulatedAnswer
                      };
                      return { chatHistory: newHistory };
                    });
                  } else if (data.type === 'error') {
                    console.error('LLM Error:', data.content);
                    accumulatedAnswer += `\n\n[Error: ${data.content}]`;
                    set((state) => {
                      const newHistory = [...state.chatHistory];
                      newHistory[newHistory.length - 1] = {
                        ...newHistory[newHistory.length - 1],
                        content: accumulatedAnswer
                      };
                      return { chatHistory: newHistory };
                    });
                  } else if (data.type === 'done') {
                    const latencyMs = Date.now() - startTime;
                    analytics.track('answer_received', {
                      nodeId,
                      nodeLabel,
                      answerLengthChars: accumulatedAnswer.length,
                      hasSources: receivedSources.length > 0,
                      sourceCount: receivedSources.length,
                      responseLatencyMs: latencyMs,
                    });
                    break;
                  }
                } catch (e) {
                  console.error('Error parsing SSE data:', e, line);
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to get answer', isLoading: false });
      // Remove the empty assistant message on error if it hasn't streamed anything
      set((state) => {
        const history = state.chatHistory;
        const lastMsg = history[history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content) {
           return { chatHistory: history.slice(0, -1) };
        }
        return state;
      });
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
