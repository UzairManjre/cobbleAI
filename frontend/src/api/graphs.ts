import api from './client';

// Graphs API
export const graphsApi = {
  generate: (topic: string, course_id?: string) => {
    return api.post('/graph/generate', { topic, course_id });
  },
  
  generateFromDocs: (course_id: string) => {
    return api.post('/graph/generate-from-docs', { course_id });
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
