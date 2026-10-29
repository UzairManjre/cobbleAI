import api from './client';

// Study Plans API — paths are rewritten to /api/{role}/study-plans by the client
export const studyPlansApi = {
  generate: (course_id: string, graph_id?: string) => {
    return api.post('/api/study-plans/generate', { course_id, graph_id });
  },

  getActive: (course_id: string) => {
    return api.get(`/api/study-plans/active/${course_id}`);
  },

  deleteActive: (course_id?: string) => {
    return api.delete('/api/study-plans/active', { params: { course_id } });
  },

  regenerate: (course_id: string, graph_id?: string) => {
    return api.post('/api/study-plans/regenerate', { course_id, graph_id });
  },

  completeTopic: (course_id: string, nodeId: string) => {
    return api.post(`/api/study-plans/${course_id}/topic/${nodeId}/complete`, {});
  },

  completeExercise: (course_id: string, exerciseId: string) => {
    return api.post(`/api/study-plans/${course_id}/exercise/${exerciseId}/complete`, {});
  },

  generateTopic: (node_id: string, course_id: string) => {
    return api.post('/api/study-plans/topics/generate', null, { params: { node_id, course_id } });
  },

  getTopic: (node_id: string, course_id: string) => {
    return api.get('/api/study-plans/topics', { params: { node_id, course_id } });
  },
};

export default studyPlansApi;
