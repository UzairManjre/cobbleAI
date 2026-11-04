import api from './client';
import type { AuditItem, AuditReport, CourseGraphStatus, CourseSetup, GraphBuild } from '../types/graph';

// Graphs API
export const graphsApi = {
  generate: (topic: string, course_id?: string) => {
    return api.post('/graph/generate', { topic, course_id });
  },
  
  generateFromDocs: (course_id: string) => {
    return api.post('/graph/generate-from-docs', { course_id });
  },

  // Concept-map builds run in the background; these read and steer them (professor)
  getSetup: (courseId: string) => {
    return api.get<CourseSetup>(`/graph/course/${courseId}/setup`);
  },

  startBuild: (courseId: string) => {
    return api.post<{ created: boolean; build: GraphBuild }>(`/graph/course/${courseId}/build`);
  },

  cancelBuild: (buildId: string) => {
    return api.post<GraphBuild>(`/graph/builds/${buildId}/cancel`);
  },

  get: (graphId: string) => {
    return api.get(`/graph/${graphId}`);
  },
  
  getByCourse: (courseId: string) => {
    return api.get(`/graph/course/${courseId}`);
  },
  
  getStatus: (courseId: string) => {
    return api.get<CourseGraphStatus>(`/graph/course/${courseId}/status`);
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
