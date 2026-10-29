import { describe, expect, it } from 'vitest';
import { answersFromAttempt, formatAnswers, remainingSeconds } from './testAnswers';

describe('formatAnswers', () => {
  it('maps option and text answers to the submit payload', () => {
    expect(formatAnswers({
      q1: { value: 'opt_b', type: 'option', time_spent: 4 },
      q2: { value: 'Divide and conquer', type: 'text', time_spent: 0 },
    })).toEqual([
      { question_id: 'q1', answer_type: 'option', answer_text: null, selected_option_id: 'opt_b', time_spent_seconds: 4 },
      { question_id: 'q2', answer_type: 'text', answer_text: 'Divide and conquer', selected_option_id: null, time_spent_seconds: 0 },
    ]);
  });
});

describe('answersFromAttempt', () => {
  it('restores saved answers and skips empty ones', () => {
    expect(answersFromAttempt([
      { question_id: 'q1', selected_option_id: 'opt_a', time_spent_seconds: 3 },
      { question_id: 'q2', answer_text: 'stable sort' },
      { question_id: 'q3', answer_text: '' },
    ])).toEqual({
      q1: { value: 'opt_a', type: 'option', time_spent: 3 },
      q2: { value: 'stable sort', type: 'text', time_spent: 0 },
    });
  });

  it('keeps confidence check-ins through save and restore', () => {
    const saved = formatAnswers({ q1: { value: 'opt_a', type: 'option', time_spent: 0, confidence: 3 } });
    expect(saved[0].confidence).toBe(3);
    expect(answersFromAttempt(saved).q1.confidence).toBe(3);
    expect(formatAnswers({ q2: { value: 'x', type: 'text', time_spent: 0 } })[0]).not.toHaveProperty('confidence');
  });

  it('round-trips through formatAnswers', () => {
    const saved = formatAnswers({ q1: { value: 'opt_c', type: 'option', time_spent: 0 } });
    expect(answersFromAttempt(saved)).toEqual({ q1: { value: 'opt_c', type: 'option', time_spent: 0 } });
  });
});

describe('remainingSeconds', () => {
  const start = '2026-10-28T10:00:00';
  it('counts down from the attempt start, treating zone-less timestamps as UTC', () => {
    const now = Date.parse('2026-10-28T10:05:00Z');
    expect(remainingSeconds(30, start, now)).toBe(25 * 60);
    expect(remainingSeconds(30, '2026-10-28T10:00:00+00:00', now)).toBe(25 * 60);
  });

  it('never goes below zero and falls back to the full duration', () => {
    expect(remainingSeconds(10, start, Date.parse('2026-10-28T12:00:00Z'))).toBe(0);
    expect(remainingSeconds(10, undefined)).toBe(600);
    expect(remainingSeconds(10, 'not a date')).toBe(600);
  });
});
