import api, { API_URL } from './client';
import type { AuditItem, AuditReport } from '../types/graph';

// Same origin as every other call (the Vite proxy in development)
const API_BASE_URL = API_URL;

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

  // Edge audit (professor): judge a stratified sample of relations
  auditSample: (graphId: string, n = 30) => {
    return api.post<{ items: AuditItem[] }>(`/graph/${graphId}/audit-sample`, null, { params: { n } });
  },

  judgeEdge: (graphId: string, edgeId: string, status: 'correct' | 'incorrect' | 'unreviewed', note?: string) => {
    return api.patch<AuditItem>(`/graph/${graphId}/edges/${edgeId}/audit`, { status, note });
  },

  auditReport: (graphId: string) => {
    return api.get<AuditReport>(`/graph/${graphId}/audit-report`);
  },
};

export default graphsApi;
