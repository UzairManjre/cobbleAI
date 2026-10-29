// Shared tutor types (graph-node study chat, course chat and lecture chat)

export type HintLevel = 'nudge' | 'guiding_question' | 'worked_step' | 'full_answer';
export type TutorMode = 'teach' | 'review' | 'teach_back';
export type TutorDecision = 'pending' | 'answered' | 'declined' | 'error';
export type FeedbackRating = 'helpful' | 'wrong' | 'not_in_notes';

export const HINT_LEVELS: { value: HintLevel; label: string; description: string }[] = [
  { value: 'nudge', label: 'Nudge', description: 'A pointer to the right idea, no explanation' },
  { value: 'guiding_question', label: 'Guiding question', description: 'Questions that lead you toward the answer' },
  { value: 'worked_step', label: 'Worked step', description: 'The next step shown, then you try the rest' },
  { value: 'full_answer', label: 'Full answer', description: 'A complete, cited explanation' },
];

/** A retrieved piece of course material; v1 messages only carry the first three fields. */
export interface TutorSource {
  doc_id: string;
  filename: string;
  relevance_score: number;
  sid?: string;
  chunk_id?: string;
  source_type?: string;
  media_type?: 'document' | 'lecture';
  location?: string;
  snippet?: string;
  support?: number;
  page_start?: number;
  page_end?: number;
  slide_start?: number;
  slide_end?: number;
  t_start?: number;
  t_end?: number;
  chapter_id?: string;
  chapter_title?: string;
  section_title?: string;
}

export interface TutorMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string | null;
  sources?: TutorSource[];
  citations?: TutorSource[] | null;
  decision?: TutorDecision | null;
  support?: 'strong' | 'weak' | 'none' | null;
  hint_level?: HintLevel | null;
  mode?: TutorMode | null;
  created_at?: string;
}

export interface TutorPolicyInfo {
  max_hint_level: HintLevel;
  default_hint_level: HintLevel;
  allow_full_answers: boolean;
  assessment_active: boolean;
  assessment_reason?: string | null;
  cite_or_decline: boolean;
  allowed_levels: HintLevel[];
}

export interface TutorPolicySettings {
  course_id: string;
  max_hint_level: HintLevel;
  default_hint_level: HintLevel;
  allow_full_answers: boolean;
  assessment_mode: boolean;
  auto_assessment_mode: boolean;
  scope: 'course_materials' | 'selected_documents';
  allowed_doc_ids: string[];
  cite_or_decline: boolean;
  topic_overrides: { node_id: string; max_hint_level?: HintLevel | null; allow_full_answers?: boolean | null }[];
  hint_levels: HintLevel[];
}

export interface TutorFrameMeta {
  type: 'meta';
  message_id: string;
  run_id: string;
  mode: TutorMode;
  hint_level: HintLevel;
  decision: TutorDecision;
  policy: TutorPolicyInfo;
}

export interface TutorFrameCitations {
  type: 'citations';
  answer: string;
  citations: TutorSource[];
  cited_sids: string[];
  support: 'strong' | 'weak' | 'none';
  decision: TutorDecision;
  decline_reason?: string | null;
}
