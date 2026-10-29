// Shared answer-state helpers for TakeTest (auto-save and final submit use the same payload)

export type AnswerKind = 'text' | 'option';

export interface AnswerState {
  value: string;
  type: AnswerKind;
  time_spent: number;
  confidence?: number; // check-in before results: 1 guessing .. 4 certain
}

export interface SubmitAnswerPayload {
  question_id: string;
  answer_type: AnswerKind;
  answer_text: string | null;
  selected_option_id: string | null;
  time_spent_seconds: number;
  confidence?: number;
}

interface StoredAnswer {
  question_id: string;
  question_type?: string;
  answer_text?: string | null;
  selected_option_id?: string | null;
  time_spent_seconds?: number;
  confidence?: number | null;
}

export function formatAnswers(answers: Record<string, AnswerState>): SubmitAnswerPayload[] {
  return Object.entries(answers).map(([questionId, ans]) => ({
    question_id: questionId,
    answer_type: ans.type,
    answer_text: ans.type === 'text' ? ans.value : null,
    selected_option_id: ans.type === 'option' ? ans.value : null,
    time_spent_seconds: ans.time_spent || 0,
    ...(ans.confidence ? { confidence: ans.confidence } : {}),
  }));
}

/** Rebuild answer state from a resumed attempt's saved answers. */
export function answersFromAttempt(saved: StoredAnswer[] | undefined): Record<string, AnswerState> {
  const result: Record<string, AnswerState> = {};
  for (const a of saved || []) {
    const confidence = a.confidence ? { confidence: a.confidence } : {};
    if (a.selected_option_id) {
      result[a.question_id] = { value: a.selected_option_id, type: 'option', time_spent: a.time_spent_seconds || 0, ...confidence };
    } else if (a.answer_text) {
      result[a.question_id] = { value: a.answer_text, type: 'text', time_spent: a.time_spent_seconds || 0, ...confidence };
    }
  }
  return result;
}

/** Seconds left on an attempt, measured from when it started (so a reload does not reset the clock). */
export function remainingSeconds(durationMinutes: number, startedAt: string | undefined, now: number = Date.now()): number {
  const total = Math.max(0, Math.round(durationMinutes * 60));
  if (!startedAt) return total;
  // The API returns naive UTC timestamps without a zone suffix
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(startedAt) ? startedAt : `${startedAt}Z`;
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return total;
  const elapsed = Math.floor((now - started) / 1000);
  return Math.max(0, total - elapsed);
}
