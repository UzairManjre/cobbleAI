import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ArrowUp, Check, Eye, GraduationCap, RotateCcw } from 'lucide-react';
import { useGraphStore } from '../../store/graphStore';
import { tutorApi } from '../../api/tutor';
import type { HintLevel, TutorPolicyInfo } from '../../types/tutor';
import { evidenceToSource } from '../../types/graph';
import type { ArtPalette } from '../ui/artPalettes';
import { prerequisiteIds } from '../../utils/concepts';
import { sourceLocation } from '../../utils/format';
import { pct, type StudyConcept } from '../../utils/mastery';
import CitationList from '../tutor/CitationList';
import HintLadder from '../tutor/HintLadder';
import TutorMessageView from '../tutor/TutorMessageView';
import VoiceInputButton from '../tutor/VoiceInputButton';

const DIFFICULTY = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

interface Props {
  courseId: string;
  nodeId: string;
  mode: 'teach' | 'review';
  palette: ArtPalette;
  /** This concept on the study path (step number and mastery); null while the path loads */
  concept: StudyConcept | null;
  total: number;
  next: StudyConcept | null;
  onNavigate: (nodeId: string) => void;
}

/**
 * One concept as a single conversation: the concept card opens the thread, the tutor's answers
 * follow, and the composer stays pinned at the bottom. Keyed by concept and mode by the page.
 */
export default function LessonThread({ courseId, nodeId, mode, palette, concept, total, next, onNavigate }: Props) {
  const { nodes, edges, chatHistory, askQuestion, isLoading, masteredNodes, toggleMastered } = useGraphStore();
  const node = nodes.find(n => n.id === nodeId);
  const [input, setInput] = useState('');
  const [policy, setPolicy] = useState<TutorPolicyInfo | null>(null);
  const [hintLevel, setHintLevel] = useState<HintLevel>('guiding_question');
  const [teachBack, setTeachBack] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const streaming = chatHistory.some(m => m.decision === 'pending');
  const busy = isLoading || streaming;
  const mastered = masteredNodes.includes(nodeId);
  const review = mode === 'review';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chatHistory, mastered]);

  // The instructor's policy decides which help levels are available here
  useEffect(() => {
    let cancelled = false;
    tutorApi.getPolicy(courseId, nodeId).then(res => {
      if (cancelled) return;
      setPolicy(res.data);
      setHintLevel(current => res.data.allowed_levels.includes(current) ? current : res.data.default_hint_level);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, nodeId]);

  const learnFirst = useMemo(() => prerequisiteIds(nodeId, edges).map(id => nodes.find(n => n.id === id)).filter(Boolean), [nodeId, nodes, edges]);
  const leadsTo = useMemo(() => nodes.filter(n => prerequisiteIds(n.id, edges).includes(nodeId)), [nodeId, nodes, edges]);

  // The same passage can back a concept twice (a quote and a mention): list each place once
  const sources = useMemo(() => {
    const seen = new Set<string>();
    return (node?.provenance || []).map(evidenceToSource).filter(s => {
      const key = `${s.doc_id || s.filename}|${sourceLocation(s)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [node]);

  if (!node) return null;
  const label = node.label;

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    return askQuestion(nodeId, text.trim(), { mode: teachBack ? 'teach_back' : mode, hintLevel });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput('');
    await send(text);
  };

  const starters = review ? [
    { label: 'Quiz me', prompt: `Ask me two questions to check I understand ${label}.` },
    { label: 'Common mistakes', prompt: `What mistakes do the course materials warn about for ${label}?` },
    { label: 'How it connects', prompt: `How does ${label} connect to the related concepts?` },
  ] : [
    { label: 'Explain the key idea', prompt: `What is the key idea of ${label}?` },
    { label: 'Show an example from the notes', prompt: `Walk me through an example of ${label} from the course materials.` },
    { label: 'Check my understanding', prompt: `Ask me two diagnostic questions about ${label}.` },
  ];

  const chip = 'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-[#c3d8e0] bg-white text-[13px] text-[#0e3445] hover:border-[#2a6f87] transition-colors cursor-pointer disabled:opacity-50';
  const hideAnswer = review && !revealed;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[46rem] mx-auto px-6 pt-8 pb-10 space-y-6">

          {/* The concept opens the thread */}
          <article className="rounded-[22px] bg-white/85 backdrop-blur-xl border border-white shadow-[0_1px_2px_rgba(14,52,69,0.04),0_16px_40px_-24px_rgba(14,52,69,0.35)] p-2" style={{ animation: 'rise 700ms var(--ease-out-expo) both' }}>
            <header className="relative overflow-hidden rounded-[16px] px-6 pt-5 pb-6 text-white" style={{ background: `linear-gradient(135deg, ${palette.deep} 0%, ${palette.mid} 100%)` }}>
              <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1.3px)', backgroundSize: '7px 7px', maskImage: 'radial-gradient(70% 120% at 100% 0%, #000 0%, transparent 70%)', WebkitMaskImage: 'radial-gradient(70% 120% at 100% 0%, #000 0%, transparent 70%)' }} />
              <div className="relative flex items-center gap-2 text-xs">
                {concept && <span className="h-7 px-3 inline-flex items-center rounded-full bg-white/15 border border-white/25 tabular">Step {concept.step} of {total}</span>}
                <span className="h-7 px-3 inline-flex items-center rounded-full bg-black/15 border border-white/15">{DIFFICULTY[node.difficulty ?? 'intermediate']}</span>
                {concept && <span className="ml-auto text-white/80 tabular">{mastered ? 'Marked as known' : `${pct(concept.mastery)} known`}</span>}
              </div>
              <h1 className="relative mt-4 font-display font-medium text-[2.1rem] leading-[1.05] tracking-[-0.03em]">{label}</h1>
              {review ? (
                <p className="relative mt-2 text-[15px] text-white/80">Say what it is, how it works and where it's used. Then check yourself.</p>
              ) : node.description && (
                <p className="relative mt-2 text-[16px] leading-relaxed text-white/90 max-w-[36rem]">{node.description}</p>
              )}
            </header>

            <div className="px-4 pt-4 pb-3 space-y-4">
              {review && (
                hideAnswer ? (
                  <button type="button" onClick={() => setRevealed(true)} className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-[#a3bfcb] text-sm text-[#0e3445] hover:bg-[#f1f5f7] cursor-pointer">
                    <Eye size={15} /> Show the answer
                  </button>
                ) : (
                  <div className="rounded-2xl bg-[#f1f5f7] p-4">
                    <p className="text-[15px] leading-relaxed text-[#0e3445]">{node.description}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-3 mr-1">How well did you know it?</span>
                      <button type="button" className={chip} onClick={() => next && onNavigate(next.id)}>Not yet</button>
                      <button type="button" className={chip} onClick={() => next && onNavigate(next.id)}>Partly</button>
                      <button type="button" className={`${chip} !bg-[#0e3445] !text-white !border-[#0e3445]`} onClick={() => { if (!mastered) toggleMastered(nodeId); if (next) onNavigate(next.id); }}>
                        <Check size={13} /> Knew it
                      </button>
                    </div>
                  </div>
                )
              )}

              {(learnFirst.length > 0 || leadsTo.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Links title="Learn first" items={learnFirst.map(n => ({ id: n!.id, label: n!.label }))} onPick={onNavigate} />
                  <Links title="Leads to" items={leadsTo.map(n => ({ id: n.id, label: n.label }))} onPick={onNavigate} />
                </div>
              )}

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">{sources.length > 0 && <CitationList courseId={courseId} sources={sources} title="From" />}</div>
                {!review && (
                  <button type="button" onClick={() => toggleMastered(nodeId)} aria-pressed={mastered}
                    className={`${chip} ${mastered ? '!bg-[#0e3445] !text-white !border-[#0e3445]' : ''}`}>
                    <Check size={13} /> {mastered ? 'Known' : 'I know this'}
                  </button>
                )}
              </div>
            </div>
          </article>

          {/* The tutor opens with a prompt and suggestions; then the conversation */}
          {chatHistory.length === 0 ? (
            <div className="flex items-start gap-3" style={{ animation: 'rise 700ms var(--ease-out-expo) 120ms both' }}>
              <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-[#0e3445] text-white"><GraduationCap size={16} /></span>
              <div className="min-w-0 pt-1">
                <p className="text-[15px] text-[#0e3445]">
                  {teachBack ? `Explain ${label} in your own words. I'll ask a follow-up and point out anything your notes disagree with.`
                    : review ? `Want me to test you on ${label}?`
                      : `Where do you want to start with ${label}? I only answer from your course materials, with sources.`}
                </p>
                {!teachBack && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {starters.map(s => <button key={s.label} type="button" onClick={() => send(s.prompt)} disabled={busy} className={chip}>{s.label}</button>)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {chatHistory.map((msg, i) => (
                <TutorMessageView key={msg.id || `${i}-${msg.role}`} message={msg} courseId={courseId} streaming={msg.decision === 'pending'} />
              ))}
            </div>
          )}
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-ink-3" role="status">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2a6f87] animate-pulse" /> Looking through your notes
            </p>
          )}

          {/* Done with this one: point at the next step */}
          {mastered && next && !review && (
            <div className="flex items-center gap-4 rounded-[18px] bg-[#e6eef2] px-5 py-4" style={{ animation: 'rise 600ms var(--ease-out-expo) both' }}>
              <span className="grid place-items-center h-9 w-9 shrink-0 rounded-full bg-[#1b566b] text-white"><Check size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-[#0e3445]">Step complete</span>
                <span className="block text-xs text-ink-3">Next on your path: {next.label}</span>
              </span>
              <button type="button" onClick={() => onNavigate(next.id)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#0e3445] text-white text-[13px] font-medium hover:bg-[#2a6f87] transition-colors cursor-pointer">
                Continue <ArrowRight size={13} />
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="shrink-0 px-6 pb-5 pt-2">
        {/* Same width as the thread's content above */}
        <div className="max-w-[43rem] mx-auto">
          <div className="rounded-[22px] bg-white border border-[#d6e3e8] shadow-[0_12px_32px_-20px_rgba(14,52,69,0.35)] focus-within:border-[#2a6f87] transition-colors">
            <div className="flex items-center gap-1 pl-5 pr-2 py-2">
              <input value={input} onChange={e => setInput(e.target.value)} disabled={isLoading}
                placeholder={teachBack ? `Explain ${label} in your own words…` : `Ask about ${label}…`}
                aria-label={teachBack ? 'Your explanation' : 'Your question'}
                className="flex-1 min-w-0 h-10 bg-transparent text-[15px] text-[#0e3445] placeholder:text-ink-4 focus:outline-none" />
              <VoiceInputButton courseId={courseId} disabled={busy} onTranscript={t => setInput(p => (p.trim() ? `${p.trim()} ${t}` : t))} />
              <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
                className="grid place-items-center h-10 w-10 shrink-0 rounded-full bg-[#0e3445] text-white hover:bg-[#2a6f87] disabled:bg-[#e6eef2] disabled:text-ink-4 transition-colors cursor-pointer">
                <ArrowUp size={16} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#e6eef2] px-4 py-1.5">
              {teachBack ? <span className="text-xs text-ink-3">Teach-back: you explain, the tutor checks</span>
                : <HintLadder compact value={hintLevel} onChange={setHintLevel} policy={policy} disabled={busy} />}
              <button type="button" onClick={() => setTeachBack(v => !v)} aria-pressed={teachBack}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs transition-colors cursor-pointer ${teachBack ? 'bg-[#0e3445] text-white' : 'text-ink-3 hover:text-[#0e3445] hover:bg-[#f1f5f7]'}`}>
                <RotateCcw size={12} /> {teachBack ? 'Back to asking' : 'Teach it back'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function Links({ title, items, onPick }: { title: string; items: { id: string; label: string }[]; onPick: (id: string) => void }) {
  return (
    <div className="rounded-2xl bg-[#f1f5f7] p-3">
      <p className="text-[11px] text-ink-3">{title}</p>
      {items.length === 0 ? <p className="mt-1.5 text-xs text-ink-4">Nothing</p> : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map(i => (
            <button key={i.id} type="button" onClick={() => onPick(i.id)} className="inline-flex items-center h-7 px-2.5 rounded-full bg-white text-xs text-[#0e3445] hover:bg-[#e6eef2] transition-colors cursor-pointer">{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
