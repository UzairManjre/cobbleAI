// POST a tutor question and consume the SSE answer stream (see backend app/services/tutor_stream.py)
import { API_URL } from '../api/client';
import { useAuthStore } from '../store/authStore';
import type { TutorFrameCitations, TutorFrameMeta, TutorSource } from '../types/tutor';
import { createSSEParser } from './sse';

export interface TutorStreamHandlers {
  onMeta?: (meta: TutorFrameMeta) => void;
  onSources?: (sources: TutorSource[]) => void;
  onChunk?: (text: string, accumulated: string) => void;
  onError?: (message: string) => void;
  onCitations?: (final: TutorFrameCitations) => void;
  onDone?: () => void;
}

export async function streamTutor(path: string, body: unknown, handlers: TutorStreamHandlers, signal?: AbortSignal): Promise<void> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : detail;
    } catch {
      // keep the generic message
    }
    throw new Error(detail);
  }

  let accumulated = '';
  const parser = createSSEParser(frame => {
    switch (frame.type) {
      case 'meta':
        handlers.onMeta?.(frame as unknown as TutorFrameMeta);
        break;
      case 'sources':
        handlers.onSources?.((frame.sources as TutorSource[]) || []);
        break;
      case 'chunk':
        accumulated += String(frame.content ?? '');
        handlers.onChunk?.(String(frame.content ?? ''), accumulated);
        break;
      case 'error':
        handlers.onError?.(String(frame.content ?? 'The tutor could not answer.'));
        break;
      case 'citations':
        handlers.onCitations?.(frame as unknown as TutorFrameCitations);
        break;
      case 'done':
        handlers.onDone?.();
        break;
      // Unknown frame types are ignored so the backend can add new ones safely
    }
  });

  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.end();
}
