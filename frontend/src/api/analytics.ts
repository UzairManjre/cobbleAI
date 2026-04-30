import client from './client';

export const analyticsApi = {
  getDashboardData: async (courseId?: string) => {
    const params = courseId ? { course_id: courseId } : {};
    return client.get('/api/analytics/dashboard', { params });
  },
};
