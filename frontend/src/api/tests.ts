import api from './client';

// Tests API
export const testsApi = {
  create: (data: Record<string, any>) => {
    return api.post('/api/tests/create', data);
  },
  
  generateQuestions: (testId: string, data: Record<string, any>) => {
    return api.post(`/api/tests/${testId}/generate-questions`, data);
  },
  
  publish: (testId: string) => {
    return api.post(`/api/tests/${testId}/publish`, {});
  },
  
  getByCourse: (courseId: string) => {
    return api.get(`/api/tests/course/${courseId}`);
  },
  
  get: (testId: string) => {
    return api.get(`/api/tests/${testId}`);
  },
  
  getAnalytics: (testId: string) => {
    return api.get(`/api/tests/analytics/${testId}`);
  },
  
  start: (testId: string) => {
    return api.post(`/api/tests/${testId}/start`, {});
  },
  
  submit: (attemptId: string, answers: any[]) => {
    return api.post(`/api/tests/attempt/${attemptId}/submit`, {
      attempt_id: attemptId,
      answers,
    });
  },
  
  getAttempt: (attemptId: string) => {
    return api.get(`/api/tests/attempt/${attemptId}`);
  },
  
  getMyAttempts: () => {
    return api.get('/api/tests/attempts/my');
  },
  
  generateMock: (data: Record<string, any>) => {
    return api.post('/api/tests/mock/generate', data);
  },
  
  submitMock: (mockTestId: string, answers: any[]) => {
    return api.post(`/api/tests/mock/${mockTestId}/submit`, {
      attempt_id: mockTestId,
      answers,
    });
  },
  
  gradeManual: (testId: string, params: Record<string, any>) => {
    return api.post(`/api/tests/${testId}/grade-manual`, null, { params });
  },
};

export default testsApi;
