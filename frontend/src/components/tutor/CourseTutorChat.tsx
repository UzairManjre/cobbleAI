import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUp, GraduationCap } from 'lucide-react';
import { useCourseTutor } from '../../hooks/useCourseTutor';
import type { HintLevel, TutorMode } from '../../types/tutor';
import HintLadder from './HintLadder';
import TutorMessageView from './TutorMessageView';
import VoiceInputButton from './VoiceInputButton';

interface Props {
  courseId: string;
  /** "Ask this lecture": evidence comes only from this recording */
  lectureId?: string;
  getCurrentTime?: () => number;
  onSeekLecture?: (docId: string, seconds: number) => boolean;
  mode?: TutorMode;
}

/** Course or lecture tutor chat with cited answers, the hint ladder and feedback. Fills its parent's height. */
export default function CourseTutorChat({ courseId, lectureId, getCurrentTime, onSeekLecture, mode }: Props) {
  const { messages, ask, isStreaming, error, policy } = useCourseTutor(courseId, lectureId);
  const [input, setInput] = useState('');
  const [hintLevel, setHintLevel] = useState<HintLevel>('guiding_question');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // A level the policy no longer allows falls back to the instructor's default
  const effectiveHint: HintLevel = policy && !policy.allowed_levels.includes(hintLevel) ? policy.default_hint_level : hintLevel;

  const send = (question: string) => {
    if (!question.trim() || isStreaming) return;
    ask(question.trim(), { hintLevel: effectiveHint, mode, videoT: getCurrentTime?.() });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = input;
    setInput('');
    send(q);
  };

  const starters = lectureId
    // The tutor receives the playhead with every question, so "just now" means where the video is
    ? ['Summarise this lecture in five points', 'Explain what was just said', 'Which part is most likely to be tested?']
    : ['Summarise the main ideas so far', 'What should I revise first?'];

  return (
    <div className="flex flex-col h-full">
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center h-8 w-8 shrink-0 rounded-full bg-[#0e3445] text-white"><GraduationCap size={14} /></span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm text-[#0e3445]">
              {lectureId
                ? 'Ask about anything in this recording. Answers link to the moment it was said, so you can jump there.'
                : 'Ask about this class. Answers come only from its notes, slides and lectures, with sources.'}
            </p>
            {messages.length === 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {starters.map(s => (
                  <button key={s} type="button" onClick={() => send(s)} disabled={isStreaming}
                    className="inline-flex items-center min-h-7 px-2.5 py-1 rounded-full border border-[#c3d8e0] bg-white text-left text-xs text-[#0e3445] hover:border-[#2a6f87] transition-colors cursor-pointer disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {messages.map((m, i) => (
          <TutorMessageView
            key={m.id || `${i}-${m.role}`}
            message={m}
            courseId={courseId}
            streaming={m.decision === 'pending'}
            onSeekLecture={onSeekLecture}
          />
        ))}
        {error && <p className="text-xs text-clay" role="alert">{error}</p>}
      </div>

      <form onSubmit={submit} className="shrink-0 px-3 pb-3 pt-1">
        <div className="rounded-[20px] bg-white border border-[#d6e3e8] shadow-[0_12px_32px_-20px_rgba(14,52,69,0.35)] focus-within:border-[#2a6f87] transition-colors">
          <div className="flex items-center gap-1 pl-4 pr-1.5 py-1.5">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={lectureId ? 'Ask about this lecture…' : 'Ask about this class…'}
              aria-label="Your question"
              className="flex-1 min-w-0 h-9 bg-transparent text-sm text-[#0e3445] placeholder:text-ink-4 focus:outline-none"
            />
            <VoiceInputButton courseId={courseId} disabled={isStreaming} onTranscript={(text) => setInput(prev => (prev.trim() ? `${prev.trim()} ${text}` : text))} />
            <button type="submit" disabled={!input.trim() || isStreaming} aria-label="Send"
              className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-[#0e3445] text-white hover:bg-[#2a6f87] disabled:bg-[#e6eef2] disabled:text-ink-4 transition-colors cursor-pointer">
              <ArrowUp size={15} />
            </button>
          </div>
          <div className="border-t border-[#e6eef2] px-3 py-1.5">
            <HintLadder compact value={effectiveHint} onChange={setHintLevel} policy={policy} disabled={isStreaming} />
          </div>
        </div>
      </form>
    </div>
  );
}
