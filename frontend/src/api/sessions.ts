import api from './client';

// Sessions API
export const sessionsApi = {
  get: (sessionId: string) => {
    return api.get(`/sessions/${sessionId}`);
  },
  
  getOrCreate: (graph_id: string) => {
    return api.post('/sessions/get-or-create', { graph_id });
  },
  
  navigate: (sessionId: string, node_id: string) => {
    return api.post(`/sessions/${sessionId}/navigate`, { node_id });
  },
  
  ask: (sessionId: string, node_id: string, question: string) => {
    return api.post(`/sessions/${sessionId}/ask`, { node_id, question });
  },
};

export default sessionsApi;
