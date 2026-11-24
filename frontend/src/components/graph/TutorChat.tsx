import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { ArrowUp } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import type { HintLevel, TutorPolicyInfo } from '../../types/tutor';
import HintLadder from '../tutor/HintLadder';
import TutorMessageView from '../tutor/TutorMessageView';
import VoiceInputButton from '../tutor/VoiceInputButton';

interface TutorChatProps {
  nodeId: string;
  mode?: 'teach' | 'review';
}

const TutorChat = ({ nodeId, mode = 'teach' }: TutorChatProps) => {
  const [input, setInput] = useState('');
  const { courseId } = useParams();
  const { nodes, chatHistory, askQuestion, isLoading } = useGraphStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [policy, setPolicy] = useState<TutorPolicyInfo | null>(null);
  const [hintLevel, setHintLevel] = useState<HintLevel>('guiding_question');
  const [teachBack, setTeachBack] = useState(false);

  const activeNode = nodes.find(n => n.id === nodeId);
  const streaming = chatHistory.some(m => m.decision === 'pending');
  const busy = isLoading || streaming;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Input, help level and teach-back reset per concept because StudyMode keys this component by node

  // The instructor's policy decides which help levels are available here
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    tutorApi.getPolicy(courseId, nodeId).then(res => {
      if (cancelled) return;
      setPolicy(res.data);
      setHintLevel(current => res.data.allowed_levels.includes(current) ? current : res.data.default_hint_level);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, nodeId]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    return askQuestion(nodeId, text.trim(), { mode: teachBack ? 'teach_back' : mode, hintLevel });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = input;
    setInput('');
    await send(message);
  };

  const label = activeNode?.label || 'this concept';
  const starters = mode === 'review' ? [
    { label: 'Quiz me', prompt: `Ask me two questions to check I understand ${label}.` },
    { label: 'Common mistakes', prompt: `What mistakes do the course materials warn about for ${label}?` },
    { label: 'How it connects', prompt: `How does ${label} connect to the related concepts?` },
  ] : [
    { label: 'Explain the key idea', prompt: `What is the key idea of ${label}?` },
    { label: 'Show an example from the notes', prompt: `Walk me through an example of ${label} from the course materials.` },
    { label: 'Check my understanding', prompt: `Ask me two diagnostic questions about ${label}.` },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface text-ink">
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-6 space-y-5 min-h-full flex flex-col">
          {chatHistory.length === 0 ? (
            <div className="flex-1 flex flex-col justify-end pb-2">
              <h2 className="font-display text-xl font-medium tracking-[-0.025em] leading-tight">
                {teachBack ? `Explain ${label} in your own words.` : mode === 'review' ? `Test yourself on ${label}.` : `Ask about ${label}.`}
              </h2>
              <p className="mt-2 text-sm text-ink-3 leading-relaxed">
                {teachBack
                  ? 'The tutor asks a follow-up and points out anything your notes disagree with.'
                  : 'Answers come only from your course materials, with sources.'}
              </p>
              {!teachBack && (
                <ul className="mt-5 border-t border-line" aria-label="Suggested questions">
                  {starters.map(s => (
                    <li key={s.label} className="border-b border-line">
                      <button
                        onClick={() => send(s.prompt)}
                        disabled={busy}
                        className="w-full text-left py-3 text-sm text-ink-2 hover:text-accent transition-colors disabled:opacity-50"
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            chatHistory.map((msg, idx) => (
              <TutorMessageView
                key={msg.id || `${idx}-${msg.role}`}
                message={msg}
                courseId={courseId}
                streaming={msg.decision === 'pending'}
              />
            ))
          )}
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-ink-3" role="status">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Looking through your notes
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-3 pb-4 border-t border-line">
        <div className="flex items-center gap-1 rounded-xl border border-line-strong bg-surface pl-4 pr-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-50 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={teachBack ? `Explain ${label}…` : `Ask about ${label}…`}
            aria-label={teachBack ? 'Your explanation' : 'Your question'}
            className="flex-1 min-w-0 h-12 bg-transparent text-[15px] text-ink placeholder:text-ink-4 focus:outline-none"
            disabled={isLoading}
          />
          <VoiceInputButton courseId={courseId} disabled={busy} onTranscript={(text) => setInput(prev => (prev.trim() ? `${prev.trim()} ${text}` : text))} />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send"
            className="w-9 h-9 rounded-full bg-accent text-white hover:bg-accent-strong disabled:bg-sunken-2 disabled:text-ink-4 transition-colors flex items-center justify-center shrink-0"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 px-1">
          {teachBack
            ? <span className="text-xs text-ink-3">Teach-back mode</span>
            : <HintLadder compact value={hintLevel} onChange={setHintLevel} policy={policy} disabled={busy} />}
          <button
            type="button"
            onClick={() => setTeachBack(!teachBack)}
            aria-pressed={teachBack}
            className="text-xs text-ink-3 hover:text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink"
          >
            {teachBack ? 'Back to questions' : 'Teach it back instead'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TutorChat;
