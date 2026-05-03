import api from './client';

// Courses API
export const coursesApi = {
  create: (data: { title: string; code: string }) => {
    return api.post('/courses/', data);
  },
  
  list: () => {
    return api.get('/courses/');
  },
  
  get: (courseId: string) => {
    return api.get(`/courses/${courseId}`);
  },
  
  createInvite: (courseId: string, data?: { expires_in_hours?: number }) => {
    return api.post(`/courses/${courseId}/invite`, data || {});
  },
  
  join: (code: string) => {
    return api.post('/courses/join', { code });
  },
  
  getStudents: (courseId: string) => {
    return api.get(`/courses/${courseId}/students`);
  },
  
  getProfessorStudents: () => {
    return api.get('/courses/professor/students');
  },
};

export default coursesApi;
