import api from './client';

// Tests API
export const testsApi = {
  create: (data: Record<string, any>) => {
    return api.post('/tests/create', data);
  },
  
  listAllProfessorTests: () => {
    return api.get('/tests/all');
  },
  
  generateQuestions: (testId: string, data: Record<string, any>) => {
    return api.post(`/tests/${testId}/generate-questions`, data);
  },
  
  publish: (testId: string) => {
    return api.post(`/tests/${testId}/publish`, {});
  },
  
  getByCourse: (courseId: string) => {
    return api.get(`/tests/course/${courseId}`);
  },
  
  get: (testId: string) => {
    return api.get(`/tests/${testId}`);
  },
  
  getAnalytics: (testId: string) => {
    return api.get(`/tests/analytics/${testId}`);
  },
  
  start: (testId: string) => {
    return api.post(`/tests/${testId}/start`, {});
  },
  
  submit: (attemptId: string, answers: any[], isAutoSave = false) => {
    return api.post(`/tests/attempt/${attemptId}/submit`, {
      attempt_id: attemptId,
      answers,
      is_auto_save: isAutoSave,
    });
  },
  
  getAttempt: (attemptId: string) => {
    return api.get(`/tests/attempt/${attemptId}`);
  },
  
  getMyAttempts: () => {
    return api.get('/tests/attempts/my');
  },
  
  generateMock: (data: Record<string, any>) => {
    return api.post('/tests/mock/generate', data);
  },
  
  submitMock: (mockTestId: string, answers: any[]) => {
    return api.post(`/tests/mock/${mockTestId}/submit`, {
      attempt_id: mockTestId,
      answers,
    });
  },
  
  gradeManual: (testId: string, params: Record<string, any>) => {
    return api.post(`/tests/${testId}/grade-manual`, null, { params });
  },
};

export default testsApi;
