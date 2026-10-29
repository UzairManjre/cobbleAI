import api from './client';

export interface GradeEvidence {
  kind: 'student_answer' | 'course_source';
  point?: string;
  met?: boolean;
  quote?: string;
  sid?: string;
  doc_id?: string;
  filename?: string;
  location?: string;
  snippet?: string;
  t_start?: number;
  page_start?: number;
  slide_start?: number;
}

export interface ReviewItem {
  attempt_id: string;
  question_id: string;
  test_id: string;
  test_title: string;
  student: { id: string; name: string };
  question: string;
  cognitive_level: string | null;
  max_marks: number;
  rubric: string[];
  model_answer: string | null;
  answer: string | null;
  ai_score: number | null;
  final_score: number | null;
  confidence: number | null;
  evidence: GradeEvidence[];
  ai_feedback: string | null;
  ai_rationale: string | null;
  feedback: string | null;
  review_status: 'auto' | 'needs_review' | 'approved' | 'overridden';
  reviewed_at: string | null;
  submitted_at: string | null;
}

export interface AgreementStats {
  n: number;
  qwk?: number | null; // null: undefined because one rater gave every answer the same score
  qwk_ci?: { value: number; ci_low: number; ci_high: number; n: number } | null;
  mae_marks?: number;
  mae_normalized?: number | null;
  exact_agreement?: number;
  override_rate?: number;
}

export interface AgreementReport {
  overall: AgreementStats;
  by_cognitive_level: Record<string, AgreementStats>;
  auto_accepted: number;
  pending_review: number;
}

// Course-level short-answer review queue (grader v2)
export const reviewQueueApi = {
  queue: (courseId: string, status: 'needs_review' | 'reviewed' | 'all' = 'needs_review') =>
    api.get<{ items: ReviewItem[]; counts: { needs_review: number } }>('/api/professor/grading/queue', { params: { course_id: courseId, status } }),
  review: (attemptId: string, questionId: string, action: 'approve' | 'override', score?: number, feedback?: string) =>
    api.post<{ attempt_status: string; final_score: number; review_status: string }>(
      `/api/professor/grading/answers/${attemptId}/${questionId}/review`, { action, score, feedback }),
  exportCsv: (courseId: string) =>
    api.get<Blob>('/api/professor/grading/export.csv', { params: { course_id: courseId }, responseType: 'blob' }),
  agreement: (courseId: string) =>
    api.get<AgreementReport>('/api/professor/grading/agreement', { params: { course_id: courseId } }),
};

export default reviewQueueApi;
