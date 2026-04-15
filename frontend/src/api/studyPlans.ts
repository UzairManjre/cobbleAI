import api from './client';

// Study Plans API
export const studyPlansApi = {
  generate: (course_id: string, graph_id: string) => {
    return api.post('/api/study-plans/generate', { course_id, graph_id });
  },
  
  getActive: () => {
    return api.get('/api/study-plans/active');
  },
  
  deleteActive: () => {
    return api.delete('/api/study-plans/active');
  },
  
  regenerate: (course_id: string, graph_id: string) => {
    return api.post('/api/study-plans/regenerate', { course_id, graph_id });
  },
  
  get: (planId: string) => {
    return api.get(`/api/study-plans/${planId}`);
  },
  
  start: (planId: string) => {
    return api.post(`/api/study-plans/${planId}/start`, {});
  },
  
  completeTopic: (planId: string, nodeId: string) => {
    return api.post(`/api/study-plans/${planId}/topics/${nodeId}/complete`, {});
  },
  
  completeExercise: (planId: string, exerciseId: string) => {
    return api.post(`/api/study-plans/${planId}/exercises/${exerciseId}/complete`, {});
  },
  
  delete: (planId: string) => {
    return api.delete(`/api/study-plans/${planId}`);
  },
  
  generateTopic: (node_id: string, course_id: string) => {
    return api.post('/api/study-plans/topics/generate', null, { params: { node_id, course_id } });
  },
  
  getTopic: (node_id: string, course_id: string) => {
    return api.get('/api/study-plans/topics', { params: { node_id, course_id } });
  },
  
  updateTopicProgress: (node_id: string, course_id: string, progress: number) => {
    return api.post('/api/study-plans/topics/progress', { progress }, { params: { node_id, course_id } });
  },
};

export default studyPlansApi;
