import { create } from 'zustand';
import { graphsApi, sessionsApi } from '../api';
import { analytics } from '../utils/analytics';
import { createSSEParser } from '../utils/sse';
import type { HintLevel, TutorFrameCitations, TutorFrameMeta, TutorMessage, TutorMode, TutorSource } from '../types/tutor';

type ChatSource = TutorSource;
type ChatMessage = TutorMessage;

export interface AskOptions {
  mode?: TutorMode;
  hintLevel?: HintLevel;
}

// The stream currently being read by askQuestion, so it can be cancelled
let activeAsk: AbortController | null = null;

// Saved answers keep model reasoning in `thinking` and v2 metadata (id, citations, decision)
function normalizeHistory(history: TutorMessage[] | undefined): ChatMessage[] {
  return (history || []).map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    thinking: msg.thinking,
    sources: msg.sources || [],
    citations: msg.citations,
    decision: msg.decision,
    support: msg.support,
    hint_level: msg.hint_level,
    mode: msg.mode,
    created_at: msg.created_at,
  }));
}

import type { GraphEdge, GraphNode } from '../types/graph';

interface GraphState {
  graphId: string | null;
  sessionId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  currentNodeId: string | null;
  visitedNodes: string[];
  masteredNodes: string[];
  chatHistory: ChatMessage[];
  isLoading: boolean;
  error: string | null;

  // Actions
  generateGraph: (topic: string, courseId?: string) => Promise<void>;
  generateFromDocs: (courseId: string) => Promise<void>;
  fetchCourseGraph: (courseId: string) => Promise<void>;
  navigateToNode: (nodeId: string) => Promise<void>;
  askQuestion: (nodeId: string, question: string, options?: AskOptions) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  setCurrentNode: (nodeId: string) => void;
  toggleMastered: (nodeId: string) => void;
  clearGraph: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graphId: null,
  sessionId: null,
  nodes: [],
  edges: [],
  currentNodeId: null,
  visitedNodes: [],
  masteredNodes: [],
  chatHistory: [],
  isLoading: false,
  error: null,

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
          chatHistory: normalizeHistory(sessionRes.data.chat_history),
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
        chatHistory: normalizeHistory(res.data.chat_history),
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

    // Stop any answer still streaming for the previous node
    activeAsk?.abort();
    activeAsk = null;

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

      // Sync with backend response (usually matches optimistic update), and show the concept's
      // earlier conversation unless the student already asked something new here
      set((state) => ({
        visitedNodes: res.data.visited_nodes,
        ...(state.currentNodeId === nodeId && state.chatHistory.length === 0
          ? { chatHistory: normalizeHistory(res.data.chat_history) }
          : {}),
      }));
    } catch (err: any) {
      // Revert on error if necessary, but usually we keep the UI state
      // or show an error toast. For now, we log the error.
      set({ error: err.response?.data?.detail || 'Failed to navigate' });
    }
  },

  askQuestion: async (nodeId: string, question: string, options: AskOptions = {}) => {
    const { sessionId, nodes, chatHistory } = get();
    if (!sessionId) return;

    // Only one answer streams at a time; a new question or a node switch cancels the old stream
    activeAsk?.abort();
    const controller = new AbortController();
    activeAsk = controller;

    const nodeLabel = nodes.find(n => n.id === nodeId)?.label || '';
    const startTime = Date.now();

    // Optimistically add user message and empty assistant message
    const userMsg: ChatMessage = { role: 'user', content: question, hint_level: options.hintLevel, mode: options.mode };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', sources: [], decision: 'pending' };

    set((state) => ({
      chatHistory: [...state.chatHistory, userMsg, assistantMsg],
      isLoading: true // Show thinking state initially
    }));

    // Writes into the streaming assistant message; ignored once this stream is cancelled
    const updateAssistant = (patch: Partial<ChatMessage>) => {
      if (controller.signal.aborted) return;
      set((state) => {
        const newHistory = [...state.chatHistory];
        const last = newHistory[newHistory.length - 1];
        if (!last || last.role !== 'assistant') return {};
        newHistory[newHistory.length - 1] = { ...last, ...patch };
        return { chatHistory: newHistory };
      });
    };
    // A stream that ends without its final frame (dropped connection, server error) must not leave
    // the answer "pending": that keeps the input disabled until the student switches concept
    const settlePending = () => set((state) => {
      const history = state.chatHistory;
      const last = history[history.length - 1];
      if (!last || last.role !== 'assistant' || last.decision !== 'pending') return {};
      return { chatHistory: [...history.slice(0, -1), { ...last, decision: 'error' as const }] };
    });

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
      const authState = useAuthStore.getState();
      const token = authState.token;
      const role = authState.role || 'student';

      const response = await fetch(`${API_URL}/api/${role}/sessions/${sessionId}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ node_id: nodeId, question, mode: options.mode, hint_level: options.hintLevel }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get answer');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedAnswer = '';
      let receivedSources: ChatSource[] = [];

      const parser = createSSEParser((data) => {
        if (data.type === 'meta') {
          const meta = data as unknown as TutorFrameMeta;
          updateAssistant({ id: meta.message_id, hint_level: meta.hint_level, mode: meta.mode, decision: meta.decision });
        } else if (data.type === 'citations') {
          // Final, post-processed answer: citations parsed, decline tokens resolved
          const final = data as unknown as TutorFrameCitations;
          updateAssistant({ content: final.answer, citations: final.citations, support: final.support, decision: final.decision });
        } else if (data.type === 'sources') {
          receivedSources = (data.sources as ChatSource[]) || [];
          updateAssistant({ sources: receivedSources });
        } else if (data.type === 'chunk') {
          accumulatedAnswer += String(data.content ?? '');
          updateAssistant({ content: accumulatedAnswer });
        } else if (data.type === 'error') {
          console.error('LLM Error:', data.content);
          accumulatedAnswer += `\n\n[Error: ${data.content}]`;
          updateAssistant({ content: accumulatedAnswer });
        } else if (data.type === 'done') {
          analytics.track('answer_received', {
            nodeId,
            nodeLabel,
            answerLengthChars: accumulatedAnswer.length,
            hasSources: receivedSources.length > 0,
            sourceCount: receivedSources.length,
            responseLatencyMs: Date.now() - startTime,
          });
        }
        // Unknown frame types are ignored so the backend can add new ones safely
      });

      if (reader) {
        set({ isLoading: false }); // Stop global loading once stream starts
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.push(decoder.decode(value, { stream: true }));
        }
        parser.end();
      }
      if (!controller.signal.aborted) settlePending();
    } catch (err: any) {
      if (controller.signal.aborted) {
        // Cancelled by a newer question or a node switch — not an error
        set({ isLoading: false });
        return;
      }
      set({ error: err.message || 'Failed to get answer', isLoading: false });
      settlePending();
      // Remove the empty assistant message on error if it hasn't streamed anything
      set((state) => {
        const history = state.chatHistory;
        const lastMsg = history[history.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content) {
           return { chatHistory: history.slice(0, -1) };
        }
        return state;
      });
    } finally {
      if (activeAsk === controller) activeAsk = null;
    }
  },

  setCurrentNode: (nodeId: string) => {
    set({ currentNodeId: nodeId });
  },

  toggleMastered: (nodeId: string) => {
    const { masteredNodes, visitedNodes } = get();
    const isMastered = masteredNodes.includes(nodeId);
    const updatedMastered = isMastered
      ? masteredNodes.filter(id => id !== nodeId)
      : [...masteredNodes, nodeId];
    
    // Auto-visit node if mastered
    const updatedVisited = visitedNodes.includes(nodeId)
      ? visitedNodes
      : [...visitedNodes, nodeId];

    set({
      masteredNodes: updatedMastered,
      visitedNodes: updatedVisited
    });

    analytics.track(isMastered ? 'node_unmastered' : 'node_mastered', { nodeId });
  },

  clearGraph: () => {
    set({
      graphId: null,
      sessionId: null,
      nodes: [],
      edges: [],
      currentNodeId: null,
      visitedNodes: [],
      masteredNodes: [],
      chatHistory: [],
      error: null
    });
  }
}));
