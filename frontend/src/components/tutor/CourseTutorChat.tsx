import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { useCourseTutor } from '../../hooks/useCourseTutor';
import type { HintLevel, TutorMode } from '../../types/tutor';
import HintLadder from './HintLadder';
import TutorMessageView from './TutorMessageView';

interface Props {
  courseId: string;
  /** "Ask this lecture": evidence comes only from this recording */
  lectureId?: string;
  getCurrentTime?: () => number;
  onSeekLecture?: (docId: string, seconds: number) => boolean;
  mode?: TutorMode;
}

/** Course-level tutor chat with cited answers, the hint ladder and feedback. */
export default function CourseTutorChat({ courseId, lectureId, getCurrentTime, onSeekLecture, mode }: Props) {
  const { messages, ask, isStreaming, error, policy } = useCourseTutor(courseId, lectureId);
  const [input, setInput] = useState('');
  const [hintLevel, setHintLevel] = useState<HintLevel>('guiding_question');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // A level the policy no longer allows falls back to the instructor's default
  const effectiveHint: HintLevel = policy && !policy.allowed_levels.includes(hintLevel) ? policy.default_hint_level : hintLevel;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const question = input.trim();
    setInput('');
    ask(question, { hintLevel: effectiveHint, mode, videoT: getCurrentTime?.() });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 p-6">
            <MessageSquare className="w-6 h-6 text-[#888888]" />
            <p className="text-sm text-white">{lectureId ? 'Ask about this lecture' : 'Ask about this course'}</p>
            <p className="text-xs text-[#888888] max-w-xs">
              {lectureId
                ? 'Answers come from what was said and shown in this recording, with timestamps you can jump to.'
                : 'Answers come only from your course notes, slides and lecture recordings, with sources. If they are not covered, the tutor says so.'}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <TutorMessageView
            key={m.id || `${i}-${m.role}`}
            message={m}
            courseId={courseId}
            streaming={m.decision === 'pending'}
            onSeekLecture={onSeekLecture}
          />
        ))}
        {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="p-3 border-t border-[#1A1A1A] space-y-2">
        <HintLadder value={effectiveHint} onChange={setHintLevel} policy={policy} disabled={isStreaming} />
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={lectureId ? 'Ask about something said in this lecture...' : 'Ask about the course...'}
            className="flex-1 bg-[#111111] border border-[#1A1A1A] rounded-xl px-3 py-2 text-sm text-white placeholder:text-[#666666] focus:outline-none focus:border-[#333333]"
          />
          <button type="submit" disabled={!input.trim() || isStreaming} className="px-3 bg-white text-black rounded-xl disabled:opacity-50" aria-label="Send">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
