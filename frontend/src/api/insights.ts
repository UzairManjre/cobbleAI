import api from './client';
import type { TutorSource } from '../types/tutor';

export interface QuestionCluster {
  cluster_id: number;
  size: number;
  topic: string;
  misconception: string | null;
  representative_question: string | null;
  node_ids: string[];
  node_labels: string[];
  declined: number;
  weak_support: number;
  labelled_by: 'llm' | 'keywords';
}

export interface QuestionInsight {
  id: string;
  period_start: string;
  period_end: string;
  n_questions: number;
  n_students: number;
  clusters: QuestionCluster[];
  method: Record<string, string | number>;
  generated_by: string;
  created_at: string;
}

export interface SearchedSource extends Omit<TutorSource, 'relevance_score'> {
  best_support: number;
  times: number;
}

export interface CoverageGroup {
  key: string;
  node_id: string | null;
  label: string;
  declined: number;
  weak_support: number;
  not_in_notes: number;
  total: number;
  mean_top_support: number | null;
  searched: SearchedSource[];
}

export interface CoverageReport {
  period_start: string;
  period_end: string;
  n_questions: number;
  n_gaps: number;
  gap_rate: number | null;
  not_in_notes: number;
  groups: CoverageGroup[];
}

export interface SourceCountRow {
  doc_id: string;
  filename: string;
  media_type: 'document' | 'lecture';
  kind: 'page' | 'slide' | 'chapter' | 'time' | 'document';
  location: string;
  page?: number;
  slide?: number;
  t_start?: number;
  chapter_id?: string;
  chapter_title?: string;
  cited: number;
  retrieved: number;
}

export interface SourceCounts {
  n_questions: number;
  time_bin_seconds: number;
  locations: SourceCountRow[];
  documents: { doc_id: string; filename: string; media_type: string; questions: number; cited: number }[];
  note: string;
}

export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  citations: TutorSource[];
  status: 'draft' | 'published';
  order: number;
  published_at: string | null;
  cluster_topic?: string | null;
  cluster_size?: number | null;
  support_level?: string | null;
  edited?: boolean;
}

export type ReportFile = 'weekly.csv' | 'weekly.pdf' | 'term.csv' | 'term.pdf';

// Role-agnostic paths (/api/insights is professor-only, /api/faq serves both roles)
export const insightsApi = {
  latestQuestions: (courseId: string) =>
    api.get<{ insight: QuestionInsight | null }>(`/api/insights/courses/${courseId}/questions`),
  generateQuestions: (courseId: string, days = 7) =>
    api.post<{ insight: QuestionInsight }>(`/api/insights/courses/${courseId}/questions/generate`, null, { params: { days } }),
  coverageGaps: (courseId: string, days = 30) =>
    api.get<CoverageReport>(`/api/insights/courses/${courseId}/coverage-gaps`, { params: { days } }),
  sourceCounts: (courseId: string, days = 30) =>
    api.get<SourceCounts>(`/api/insights/courses/${courseId}/source-counts`, { params: { days } }),
  report: (courseId: string, file: ReportFile) =>
    api.get<Blob>(`/api/insights/courses/${courseId}/reports/${file}`, { responseType: 'blob' }),
};

export const faqApi = {
  list: (courseId: string) => api.get<{ entries: FAQEntry[] }>(`/api/faq/courses/${courseId}`),
  draft: (courseId: string, topN = 5) =>
    api.post<{ created: FAQEntry[]; skipped: { topic: string; reason: string }[] }>(`/api/faq/courses/${courseId}/draft`, null, { params: { top_n: topN } }),
  create: (courseId: string, question: string, answer = '') =>
    api.post<FAQEntry>(`/api/faq/courses/${courseId}`, { question, answer }),
  update: (entryId: string, update: Partial<Pick<FAQEntry, 'question' | 'answer' | 'status' | 'order'>>) =>
    api.patch<FAQEntry>(`/api/faq/${entryId}`, update),
  remove: (entryId: string) => api.delete(`/api/faq/${entryId}`),
};

export default insightsApi;
