import api from './client';
import { useAuthStore } from '../store/authStore';

// Get base URL for SSE connections (EventSource doesn't support custom headers)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// Graphs API
export const graphsApi = {
  generate: (topic: string, course_id?: string) => {
    return api.post('/graph/generate', { topic, course_id });
  },
  
  generateFromDocs: (course_id: string) => {
    return api.post('/graph/generate-from-docs', { course_id });
  },

  /**
   * Stream graph generation progress via Server-Sent Events.
   * Returns an EventSource that emits:
   *   - "progress" events: { step, totalSteps, message, detail, elapsed }
   *   - "complete" events: { graph_id, session_id, nodes_count, edges_count, elapsed }
   *   - "error" events: { message }
   */
  generateFromDocsStream: (courseId: string, userId: string): EventSource => {
    const url = `${API_BASE_URL}/graph/generate-from-docs-stream/${courseId}?user_id=${encodeURIComponent(userId)}`;
    return new EventSource(url);
  },
  
  get: (graphId: string) => {
    return api.get(`/graph/${graphId}`);
  },
  
  getByCourse: (courseId: string) => {
    return api.get(`/graph/course/${courseId}`);
  },
  
  getStatus: (courseId: string) => {
    return api.get(`/graph/course/${courseId}/status`);
  },
};

export default graphsApi;
