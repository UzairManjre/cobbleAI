import client from './client';

export interface RubricCriterion {
  id?: string;
  name: string;
  description: string;
  max_points: number;
}

export interface Rubric {
  id: string;
  assignment_id: string;
  criteria: RubricCriterion[];
  created_at: string;
}

export interface CriterionDraft {
  criterion_id: string;
  suggested_score: number;
  suggested_feedback: string;
  ai_reasoning: string;
  override_score?: number;
  override_feedback?: string;
}

export interface EditHistoryRecord {
  timestamp: string;
  editor_id: string;
  field: string;
  old_value: any;
  new_value: any;
}

export interface GradingDraft {
  id: string;
  submission_id: string;
  rubric_id: string;
  status: 'drafting' | 'needs_review' | 'anomaly_flagged' | 'approved' | 'published';
  anomaly_reason?: string;
  criteria_evaluations: CriterionDraft[];
  total_score: number;
  approved_by_professor_id?: string;
  edit_history: EditHistoryRecord[];
  created_at: string;
  updated_at: string;
}

export interface StudentInfo {
  id: string;
  name: string;
  email: string;
}

export interface SubmissionOverviewItem {
  attempt: any; // We can type this strictly if we want, but `any` is fine for now
  student: StudentInfo;
  draft: GradingDraft | null;
}

export interface GradingOverviewResponse {
  rubric: Rubric | null;
  submissions: SubmissionOverviewItem[];
}

export interface SubmissionReviewResponse {
  attempt: any;
  student: StudentInfo;
  rubric: Rubric | null;
  draft: GradingDraft | null;
}

export const gradingApi = {
  createRubric: (assignmentId: string, criteria: Omit<RubricCriterion, 'id'>[]) => 
    client.post<Rubric>(`/api/professor/grading/assignments/${assignmentId}/rubric`, { criteria }).then(res => res.data),

  triggerDraft: (submissionId: string, submission_text: string) =>
    client.post<GradingDraft>(`/api/professor/grading/submissions/${submissionId}/draft`, { submission_text }).then(res => res.data),

  overrideDraft: (draftId: string, overrides: { criterion_id: string; override_score?: number; override_feedback?: string }[]) =>
    client.patch<GradingDraft>(`/api/professor/grading/drafts/${draftId}`, { overrides }).then(res => res.data),

  approveDraft: (draftId: string) =>
    client.post<GradingDraft>(`/api/professor/grading/drafts/${draftId}/approve`).then(res => res.data),

  publishAssignmentDrafts: (assignmentId: string) =>
    client.post<{ status: string; published_count: number }>(`/api/professor/grading/assignments/${assignmentId}/publish`).then(res => res.data),
    
  getGradingOverview: (assignmentId: string) =>
    client.get<GradingOverviewResponse>(`/api/professor/grading/assignments/${assignmentId}/grading-overview`).then(res => res.data),
    
  getSubmissionReview: (assignmentId: string, attemptId: string) =>
    client.get<SubmissionReviewResponse>(`/api/professor/grading/assignments/${assignmentId}/submissions/${attemptId}/review`).then(res => res.data),
};
