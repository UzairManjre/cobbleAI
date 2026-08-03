import api from './client';

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
   */
  generateFromDocsStream: (courseId: string, userId: string, token: string, ctrl: AbortController, onMessage: (ev: any) => void, onError: (err: any) => void, onComplete: () => void) => {
    import('@microsoft/fetch-event-source').then(({ fetchEventSource }) => {
      fetchEventSource(`${API_BASE_URL}/api/professor/graph/generate-from-docs-stream/${courseId}?user_id=${encodeURIComponent(userId)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: ctrl.signal,
        onmessage(ev) {
          onMessage(ev);
        },
        onerror(err) {
          onError(err);
          // throw err to stop retrying
          throw err;
        },
        onclose() {
          onComplete();
        }
      }).catch((err) => {
        if (err.name !== 'AbortError') {
          onError(err);
        }
      });
    });
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
