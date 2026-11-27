import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowUp, FileText, GraduationCap, Play } from 'lucide-react';
import { documentsApi } from '../../api';
import { faqApi, type FAQEntry } from '../../api/insights';
import { useCourseTutor } from '../../hooks/useCourseTutor';
import type { HintLevel } from '../../types/tutor';
import FaqCard from '../../components/student/FaqCard';
import HintLadder from '../../components/tutor/HintLadder';
import TutorMessageView from '../../components/tutor/TutorMessageView';
import VoiceInputButton from '../../components/tutor/VoiceInputButton';
import { panel, rise } from '../../components/ui/glass';
import { loadStudyPath, plural, type StudyConcept } from '../../utils/mastery';

interface Doc { id: string; filename: string; media_type: 'document' | 'lecture'; status: string }
const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, '');

/** Ask the whole class's materials anything: one conversation, with what the tutor can draw on beside it. */
export default function ClassAsk() {
  const { courseId = '' } = useParams();
  const { messages, ask, isStreaming, error, policy } = useCourseTutor(courseId);
  const [input, setInput] = useState('');
  const [hintLevel, setHintLevel] = useState<HintLevel>('guiding_question');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [faq, setFaq] = useState<FAQEntry[]>([]);
  const [path, setPath] = useState<StudyConcept[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    documentsApi.list(courseId).then(r => { if (!cancelled) setDocs((r.data || []).filter((d: Doc) => d.status === 'ready')); }).catch(() => undefined);
    faqApi.list(courseId).then(r => { if (!cancelled) setFaq(r.data.entries.filter(e => e.status === 'published')); }).catch(() => undefined);
    loadStudyPath(courseId).then(p => { if (!cancelled) setPath(p); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId]);

  // Keep the newest message in view inside the chat panel (not the whole page)
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // A level the policy no longer allows falls back to the instructor's default
  const effectiveHint: HintLevel = policy && !policy.allowed_levels.includes(hintLevel) ? policy.default_hint_level : hintLevel;

  const send = (text: string) => {
    if (!text.trim() || isStreaming) return;
    ask(text.trim(), { hintLevel: effectiveHint });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput('');
    send(text);
  };

  const lectures = docs.filter(d => d.media_type === 'lecture');
  const notes = docs.filter(d => d.media_type !== 'lecture');

  // Suggestions from this student's weakest concepts and the latest lecture
  const starters = useMemo(() => {
    const weak = [...path].sort((a, b) => a.mastery - b.mastery).slice(0, 2);
    const out = weak.map(k => `Explain ${k.label.toLowerCase()} simply, with an example from the notes`);
    if (lectures[0]) out.push(`Summarise the main points of ${stem(lectures[0].filename)}`);
    if (weak.length === 2) out.push(`How do ${weak[0].label.toLowerCase()} and ${weak[1].label.toLowerCase()} relate?`);
    return out.slice(0, 4);
  }, [path, lectures]);

  const chip = 'inline-flex items-center h-auto min-h-8 px-3 py-1.5 rounded-full border border-[#c3d8e0] bg-white text-left text-[13px] text-[#0e3445] hover:border-[#2a6f87] transition-colors cursor-pointer disabled:opacity-50';

  return (
    // Both columns stretch to the taller one: the chat fills at least the window, and grows with the side panels
    <div className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
      {/* Conversation */}
      <section aria-label="Ask the tutor" style={rise(1)} className={`${panel} flex flex-col min-h-[max(520px,calc(100vh-21.5rem))] overflow-hidden`}>
        {/* Absolutely placed so long chats scroll here instead of making the row taller */}
        <div className="relative flex-1 min-h-0">
        <div ref={scroller} className="absolute inset-0 overflow-y-auto">
          <div className="max-w-[46rem] mx-auto px-6 py-6 space-y-5">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-[#0e3445] text-white"><GraduationCap size={16} /></span>
              <div className="min-w-0 pt-1">
                <p className="text-[15px] text-[#0e3445]">Ask me anything about this class. I only answer from your notes, slides and lecture recordings, and I show where each answer comes from.</p>
                {messages.length === 0 && starters.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {starters.map(s => <button key={s} type="button" onClick={() => send(s)} disabled={isStreaming} className={chip}>{s}</button>)}
                  </div>
                )}
              </div>
            </div>
            {messages.map((m, i) => (
              <TutorMessageView key={m.id || `${i}-${m.role}`} message={m} courseId={courseId} streaming={m.decision === 'pending'} />
            ))}
            {error && <p className="text-xs text-clay" role="alert">{error}</p>}
          </div>
        </div>
        </div>

        <form onSubmit={submit} className="shrink-0 px-5 pb-4 pt-2">
          <div className="max-w-[46rem] mx-auto rounded-[22px] bg-white border border-[#d6e3e8] shadow-[0_12px_32px_-20px_rgba(14,52,69,0.35)] focus-within:border-[#2a6f87] transition-colors">
            <div className="flex items-center gap-1 pl-5 pr-2 py-2">
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about anything in this class…" aria-label="Your question"
                className="flex-1 min-w-0 h-10 bg-transparent text-[15px] text-[#0e3445] placeholder:text-ink-4 focus:outline-none" />
              <VoiceInputButton courseId={courseId} disabled={isStreaming} onTranscript={t => setInput(p => (p.trim() ? `${p.trim()} ${t}` : t))} />
              <button type="submit" disabled={!input.trim() || isStreaming} aria-label="Send"
                className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-[#0e3445] text-white hover:bg-[#2a6f87] disabled:bg-[#e6eef2] disabled:text-ink-4 transition-colors cursor-pointer">
                <ArrowUp size={16} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#e6eef2] px-4 py-1.5">
              <HintLadder compact value={effectiveHint} onChange={setHintLevel} policy={policy} disabled={isStreaming} />
              <span className="text-[11px] text-ink-4">Not in your materials? The tutor says so instead of guessing.</span>
            </div>
          </div>
        </form>
      </section>

      {/* What the tutor draws on, and the class FAQ */}
      <div className="flex flex-col gap-4">
        <section aria-label="What the tutor uses" style={rise(2)} className={`${panel} p-5 ${faq.length > 0 ? '' : 'flex-1'}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] text-[#0e3445]">Answers come from</h2>
            <span className="text-xs text-ink-3 tabular">{plural(docs.length, 'source')}</span>
          </div>
          {docs.length === 0 ? (
            <p className="mt-3 p-3 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">Nothing shared yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {[...lectures, ...notes].map(d => (
                <li key={d.id} className="flex items-center gap-3 p-2 rounded-2xl bg-[#f1f5f7]">
                  <span className="grid place-items-center h-8 w-8 shrink-0 rounded-full bg-white text-[#1b566b]">{d.media_type === 'lecture' ? <Play size={13} className="ml-0.5" /> : <FileText size={14} />}</span>
                  <span className="min-w-0 flex-1 text-sm text-[#0e3445] truncate">{stem(d.filename)}</span>
                  <span className="text-[11px] text-ink-4">{d.media_type === 'lecture' ? 'Recording' : 'Notes'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {faq.length > 0 && <FaqCard style={rise(3)} className="flex-1" courseId={courseId} entries={faq} />}
      </div>
    </div>
  );
}
