import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUp, BookOpen, GraduationCap, Lightbulb, ListChecks, RotateCcw } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { coursesApi, API_URL } from '../../api';
import { analytics } from '../../utils/analytics';
import GradientPage from '../../components/layout/GradientPage';
import VoiceInputButton from '../../components/tutor/VoiceInputButton';
import MessageContent from '../../components/tutor/MessageContent';
import { panel, rise } from '../../components/ui/glass';
import { paletteAt } from '../../components/ui/artPalettes';

interface Message { role: 'user' | 'assistant'; content: string }
interface Course { id: string; title: string; code: string }
type Mode = 'teach' | 'test' | 'review';

const MODES: { key: Mode; label: string; hint: string; icon: typeof Lightbulb }[] = [
  { key: 'teach', label: 'Explain', hint: 'Explains the idea step by step', icon: Lightbulb },
  { key: 'test', label: 'Quiz me', hint: 'Asks you questions and checks your answers', icon: ListChecks },
  { key: 'review', label: 'Recap', hint: 'Short summary of what matters', icon: RotateCcw },
];

const STARTERS = [
  'Explain gradient descent like I am new to it',
  'Quiz me on probability basics',
  'What is the difference between a list and an array?',
  'Help me plan a week of revision',
];

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-[#0e3445] text-white"><GraduationCap size={16} /></span>
      <div className="min-w-0 max-w-[85%] rounded-[18px] rounded-tl-md bg-white px-4 py-3 shadow-[0_8px_24px_-18px_rgba(14,52,69,0.45)]">
        {content ? <MessageContent content={content} /> : (
          <span className="inline-flex gap-1 py-1.5" aria-label="Thinking">
            {[0, 150, 300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-[#8fbccb] animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
          </span>
        )}
      </div>
    </div>
  );
}

const SESSION_STORAGE_KEY = 'chat_session_id';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getOrCreateSessionId(): string {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const { id, expiresAt } = JSON.parse(raw);
      if (Date.now() < expiresAt) return id;
    }
  } catch {
    // ignore parse errors
  }
  const newId = crypto.randomUUID();
  try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: newId, expiresAt: Date.now() + SESSION_TTL_MS })); } catch { /* storage blocked */ }
  return newId;
}

/** The general tutor: any subject, not tied to a class. Class-grounded answers live in each class's Ask tab. */
export default function Chat() {
  const [searchParams] = useSearchParams();
  const initialTopic = searchParams.get('topic');
  const { token } = useAuthStore();

  const [courses, setCourses] = useState<Course[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialTopic ? `Help me understand ${initialTopic}` : '');
  const [mode, setMode] = useState<Mode>('teach');
  const [isTyping, setIsTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  useEffect(() => {
    coursesApi.list().then(res => setCourses(res.data || [])).catch(() => setCourses([]));
  }, []);

  // Keep the newest message in view inside the chat panel
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isTyping || !token) return;
    setMessages(prev => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setIsTyping(true);

    const replaceLast = (content: string) => setMessages(prev => {
      const next = [...prev];
      next[next.length - 1] = { role: 'assistant', content };
      return next;
    });

    try {
      const startTime = Date.now();
      analytics.track('chat_standalone_sent', {
        messageLength: text.length,
        wordCount: text.split(' ').length,
        mode,
        hasCourse: false,
        topic: initialTopic || '',
      });

      // API_URL is '' in dev (Vite proxy), so build a relative URL rather than new URL()
      const params = new URLSearchParams({ session_id: sessionIdRef.current, message: text, mode });
      const response = await fetch(`${API_URL}/api/chat/?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error((await response.text()) || `Server returned ${response.status}`);

      let reply = '';
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Failed to get stream reader');
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk.includes('event: error')) {
            const line = chunk.split('\n').find(l => l.startsWith('data: '));
            let detail = 'Something went wrong while answering.';
            if (line) {
              try { const d = JSON.parse(line.slice(6)); detail = d.detail || d.message || d.error || detail; } catch { detail = line.slice(6); }
            }
            throw new Error(detail);
          }
          if (!reply && chunk.startsWith('Error:')) throw new Error(chunk.slice(6).trim());
          // The backend prefixes the stream with a <sources>[json]</sources> block
          reply = (reply + chunk).replace(/^<sources>[\s\S]*?<\/sources>/, '');
          replaceLast(reply);
        }
      } else {
        const json = await response.json();
        reply = json.reply || json.message || '(empty response)';
        replaceLast(reply);
      }
      analytics.track('answer_received', { answerLengthChars: reply.length, responseLatencyMs: Date.now() - startTime, isStandaloneChat: true });
    } catch (err) {
      replaceLast(`Sorry, I could not answer that: ${err instanceof Error ? err.message : 'unknown error'}. Try again.`);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, token, mode, initialTopic]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput('');
    send(text);
  };

  const modeBtn = (active: boolean) => `inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs transition-colors cursor-pointer ${active ? 'bg-[#0e3445] text-white' : 'text-ink-3 hover:text-[#0e3445]'}`;

  return (
    <GradientPage>
      <header className="mt-6 sm:mt-10 flex items-end justify-between gap-6 text-white" style={rise(0)}>
        <div>
          <h1 className="font-display font-medium text-[clamp(2rem,4vw,3rem)] leading-[1.02] tracking-[-0.035em]">Tutor</h1>
          <p className="mt-3 text-white/75 text-[15px]">Ask about anything. For answers from your notes, ask inside a class.</p>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} disabled={isTyping}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/35 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50">
            <RotateCcw size={14} /> New chat
          </button>
        )}
      </header>

      {/* Both columns stretch to the taller one */}
      <div className="mt-8 sm:mt-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-label="Chat with the tutor" style={rise(1)} className={`${panel} flex flex-col min-h-[max(520px,calc(100vh-20.5rem))] overflow-hidden`}>
          <div className="relative flex-1 min-h-0">
            <div ref={scroller} className="absolute inset-0 overflow-y-auto">
              <div className="max-w-[46rem] mx-auto px-6 py-6 space-y-5">
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-[#0e3445] text-white"><GraduationCap size={16} /></span>
                  <div className="min-w-0 pt-1">
                    <p className="text-[15px] text-[#0e3445]">
                      {initialTopic ? <>Let's dig into <strong>{initialTopic}</strong>. What would you like to know?</> : 'Hi! What do you want to learn today? I can explain, quiz you, or recap a topic.'}
                    </p>
                    {messages.length === 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {STARTERS.map(s => (
                          <button key={s} type="button" onClick={() => send(s)} disabled={isTyping}
                            className="inline-flex items-center min-h-8 px-3 py-1.5 rounded-full border border-[#c3d8e0] bg-white text-left text-[13px] text-[#0e3445] hover:border-[#2a6f87] transition-colors cursor-pointer disabled:opacity-50">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {messages.map((m, i) => m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[80%] rounded-[18px] rounded-br-md bg-[#0e3445] px-4 py-2.5 text-[15px] text-white whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <AssistantMessage key={i} content={m.content} />
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="shrink-0 px-5 pb-4 pt-2">
            <div className="max-w-[46rem] mx-auto rounded-[22px] bg-white border border-[#d6e3e8] shadow-[0_12px_32px_-20px_rgba(14,52,69,0.35)] focus-within:border-[#2a6f87] transition-colors">
              <div className="flex items-center gap-1 pl-5 pr-2 py-2">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything…" aria-label="Your message"
                  className="flex-1 min-w-0 h-10 bg-transparent text-[15px] text-[#0e3445] placeholder:text-ink-4 focus:outline-none" />
                <VoiceInputButton disabled={isTyping} onTranscript={t => setInput(p => (p.trim() ? `${p.trim()} ${t}` : t))} />
                <button type="submit" disabled={!input.trim() || isTyping} aria-label="Send"
                  className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-[#0e3445] text-white hover:bg-[#2a6f87] disabled:bg-[#e6eef2] disabled:text-ink-4 transition-colors cursor-pointer">
                  <ArrowUp size={16} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[#e6eef2] px-3 py-1.5">
                <div className="flex items-center gap-1" role="group" aria-label="How the tutor answers">
                  {MODES.map(m => (
                    <button key={m.key} type="button" title={m.hint} onClick={() => setMode(m.key)} aria-pressed={mode === m.key} className={modeBtn(mode === m.key)}>
                      <m.icon size={12} /> {m.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-ink-4">Not checked against your notes. Double-check what matters.</span>
              </div>
            </div>
          </form>
        </section>

        {/* Class-grounded alternatives */}
        <div className="flex flex-col gap-4">
          <section aria-labelledby="classes-heading" style={rise(2)} className={`${panel} p-5 flex-1`}>
            <h2 id="classes-heading" className="text-[15px] text-[#0e3445]">Ask a class instead</h2>
            <p className="mt-1 text-xs text-ink-3">Answers only from that class's notes and lectures, with sources.</p>
            {courses.length === 0 ? (
              <p className="mt-4 p-3 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">Join a class to ask about its notes.</p>
            ) : (
              <ul className="mt-4 space-y-1.5">
                {courses.map((c, i) => {
                  const p = paletteAt(i);
                  return (
                    <li key={c.id}>
                      <Link to={`/courses/${c.id}/ask`} className="group flex items-center gap-3 p-2 rounded-2xl bg-[#f1f5f7] hover:bg-[#e6eef2] transition-colors">
                        <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full text-white" style={{ background: `linear-gradient(135deg, ${p.deep}, ${p.mid})` }}><BookOpen size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-[#0e3445] truncate">{c.title}</span>
                          <span className="block text-xs text-ink-3">{c.code}</span>
                        </span>
                        <span className="text-xs text-ink-3 group-hover:text-[#0e3445] pr-1">Ask</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-5 pt-4 border-t border-[#e6eef2] space-y-2.5">
              {MODES.map(m => (
                <p key={m.key} className="flex items-start gap-2.5 text-xs text-ink-3">
                  <span className="grid place-items-center h-6 w-6 shrink-0 rounded-full bg-[#e6eef2] text-[#1b566b]"><m.icon size={12} /></span>
                  <span className="pt-1"><span className="text-[#0e3445]">{m.label}</span> · {m.hint.toLowerCase()}</span>
                </p>
              ))}
            </div>
          </section>
        </div>
      </div>
    </GradientPage>
  );
}
