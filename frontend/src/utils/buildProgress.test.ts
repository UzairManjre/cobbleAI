import { describe, expect, it } from 'vitest';
import { formatDuration, isActiveBuild, timeAgo } from './buildProgress';

describe('formatDuration', () => {
  it('reads like a person would say it', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(300)).toBe('5 min');
    expect(formatDuration(3900)).toBe('1 h 5 min');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(null)).toBe('0s');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  it('rounds to the nearest sensible unit', () => {
    expect(timeAgo('2026-10-29T11:59:50Z', now)).toBe('just now');
    expect(timeAgo('2026-10-29T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-10-29T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-28T12:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo(null, now)).toBe('');
  });
});

describe('isActiveBuild', () => {
  it('is true only while queued or running', () => {
    expect(isActiveBuild({ status: 'queued' })).toBe(true);
    expect(isActiveBuild({ status: 'running' })).toBe(true);
    expect(isActiveBuild({ status: 'complete' })).toBe(false);
    expect(isActiveBuild(null)).toBe(false);
  });
});
