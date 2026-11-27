import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import { useToastStore } from '../../store/toastStore';
import { apiErrorDetail } from '../../utils/apiError';

interface Props {
  courseId?: string;
  disabled?: boolean;
  /** Called with the transcribed question; the student can edit it before sending */
  onTranscript: (text: string) => void;
}

const MAX_SECONDS = 60;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find(type => MediaRecorder.isTypeSupported(type));
}

/**
 * Ask by voice. Click to record, click again to stop; the question appears in the box for
 * editing. Audio goes only to this course's server (a local Whisper model), never to a cloud
 * speech service, and is not stored.
 */
export default function VoiceInputButton({ courseId, disabled, onTranscript }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const addToast = useToastStore(s => s.addToast);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  // Leaving the page mid-recording releases the microphone
  useEffect(() => () => {
    stopTimer();
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  if (!supported) return null;

  const transcribe = async (blob: Blob) => {
    setState('transcribing');
    try {
      const { data } = await tutorApi.transcribe(blob, courseId);
      if (data.text) onTranscript(data.text);
      else addToast("Didn't catch that. Try again a little closer to the microphone.", 'info');
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not transcribe the recording'), 'error');
    } finally {
      setState('idle');
    }
  };

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      addToast('Microphone access is blocked. Allow it in the browser’s site settings to ask by voice.', 'error');
      return;
    }
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      stopTimer();
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      if (blob.size) transcribe(blob);
      else setState('idle');
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setState('recording');
    const startedAt = Date.now();
    timer.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS && rec.state === 'recording') rec.stop();
    }, 250);
  };

  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  if (state === 'recording') {
    return (
      <button type="button" onClick={stop} aria-label="Stop recording"
        className="h-9 px-3 rounded-full bg-clay-wash text-clay hover:bg-[#efe2dc] flex items-center gap-2 text-xs tabular-nums shrink-0">
        <span className="w-2 h-2 rounded-full bg-[#c9957f] animate-pulse" aria-hidden />
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        <Square className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled || state === 'transcribing'}
      aria-label={state === 'transcribing' ? 'Transcribing your question' : 'Ask by voice'}
      title="Ask by voice. Your recording is transcribed on the course server and not kept."
      className="w-9 h-9 rounded-full text-ink-3 hover:text-ink hover:bg-sunken disabled:opacity-50 flex items-center justify-center shrink-0 self-center transition-colors"
    >
      {state === 'transcribing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
