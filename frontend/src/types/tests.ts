// Tests as the professor's test list and the create wizard see them

export type TestStatus = 'draft' | 'published' | 'completed' | 'archived';
export type TestType = 'assignment' | 'quiz' | 'exam' | 'mock_test';
export type QuestionType = 'mcq' | 'true_false' | 'short_answer';

export interface TestSummary {
  id: string;
  title: string;
  description?: string | null;
  duration_minutes: number;
  passing_percentage: number;
  test_type: TestType | string;
  status: TestStatus | string;
  question_count: number;
  total_marks: number;
  show_results_immediately?: boolean;
  results_released?: boolean;
  created_at?: string | null;
  available_until?: string | null;
  /** Professor list only: finished attempts, and AI grades waiting for review */
  submissions?: number;
  answers_to_review?: number;
}

export interface NewTestDraft {
  title: string;
  description: string;
  duration_minutes: number;
  passing_percentage: number;
  test_type: TestType;
  show_results_immediately: boolean;
  question_count: number;
  question_types: QuestionType[];
  selected_documents: string[];
  selected_topics: string[];
}

export interface TestSourceDocument {
  id: string;
  filename: string;
  status: string;
  media_type?: string;
}

export interface TestTopic {
  id: string;
  label: string;
}
