import { useCallback, useEffect, useRef, useState } from 'react';
import { tutorApi } from '../api/tutor';
import type { HintLevel, TutorMessage, TutorMode, TutorPolicyInfo } from '../types/tutor';
import { streamTutor } from '../utils/tutorStream';

interface AskOptions {
  hintLevel?: HintLevel;
  mode?: TutorMode;
  videoT?: number;
}

/** Course-level tutor chat ("ask the course"), or one lecture's chat when lectureId is given. */
export function useCourseTutor(courseId: string | undefined, lectureId?: string) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<TutorPolicyInfo | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    tutorApi.getCourseChat(courseId, lectureId)
      .then(res => { if (!cancelled) setMessages(res.data.messages || []); })
      .catch(() => { if (!cancelled) setMessages([]); });
    tutorApi.getPolicy(courseId)
      .then(res => { if (!cancelled) setPolicy(res.data); })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      controllerRef.current?.abort();
    };
  }, [courseId, lectureId]);

  const patchLast = (patch: Partial<TutorMessage>) =>
    setMessages(prev => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === 'assistant') next[next.length - 1] = { ...last, ...patch };
      return next;
    });

  // An answer whose stream ended without the final frame is settled, not left "pending" forever
  const settlePending = () =>
    setMessages(prev => {
      const last = prev[prev.length - 1];
      return last && last.role === 'assistant' && last.decision === 'pending'
        ? [...prev.slice(0, -1), { ...last, decision: 'error' }]
        : prev;
    });

  const ask = useCallback(async (question: string, options: AskOptions = {}) => {
    if (!courseId || !question.trim()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError(null);
    setIsStreaming(true);
    setMessages(prev => [
      ...prev,
      { role: 'user', content: question, hint_level: options.hintLevel, mode: options.mode },
      { role: 'assistant', content: '', sources: [], decision: 'pending' },
    ]);
    try {
      await streamTutor(tutorApi.askUrl(courseId), {
        question,
        mode: options.mode,
        hint_level: options.hintLevel,
        lecture_id: lectureId,
        video_t: options.videoT,
      }, {
        onMeta: meta => {
          setPolicy(meta.policy);
          patchLast({ id: meta.message_id, hint_level: meta.hint_level, mode: meta.mode, decision: meta.decision });
        },
        onSources: sources => patchLast({ sources }),
        onChunk: (_text, accumulated) => patchLast({ content: accumulated }),
        onError: message => setError(message),
        onCitations: final => patchLast({
          content: final.answer,
          citations: final.citations,
          support: final.support,
          decision: final.decision,
        }),
      }, controller.signal);
      if (!controller.signal.aborted) settlePending();
    } catch (err) {
      if (!controller.signal.aborted) {
        settlePending();
        setError(err instanceof Error ? err.message : 'The tutor could not answer.');
        setMessages(prev => {
          const last = prev[prev.length - 1];
          return last && last.role === 'assistant' && !last.content ? prev.slice(0, -1) : prev;
        });
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setIsStreaming(false);
      }
    }
  }, [courseId, lectureId]);

  return { messages, ask, isStreaming, error, policy };
}
