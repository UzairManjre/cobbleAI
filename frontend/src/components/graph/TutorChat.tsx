import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useGraphStore } from '../../store/graphStore';
import { Send, MessageSquare, CheckCircle, Sparkles, HelpCircle, Award, GraduationCap, Link2, ListChecks } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import type { HintLevel, TutorPolicyInfo } from '../../types/tutor';
import HintLadder from '../tutor/HintLadder';
import TutorMessageView from '../tutor/TutorMessageView';

interface TutorChatProps {
  nodeId: string;
  isMassive?: boolean;
  mode?: 'teach' | 'review';
}

const TutorChat = ({ nodeId, isMassive, mode = 'teach' }: TutorChatProps) => {
  const [input, setInput] = useState('');
  const { courseId } = useParams();
  const { nodes, chatHistory, askQuestion, isLoading, masteredNodes, toggleMastered } = useGraphStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [policy, setPolicy] = useState<TutorPolicyInfo | null>(null);
  const [hintLevel, setHintLevel] = useState<HintLevel>('guiding_question');
  const [teachBack, setTeachBack] = useState(false);

  const activeNode = nodes.find(n => n.id === nodeId);
  const isMastered = masteredNodes.includes(nodeId);
  const streaming = chatHistory.some(m => m.decision === 'pending');

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
    if (!text.trim() || isLoading || streaming) return;
    return askQuestion(nodeId, text.trim(), { mode: teachBack ? 'teach_back' : mode, hintLevel });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const message = input;
    setInput('');
    await send(message);
  };

  const label = activeNode?.label || 'this concept';
  const promptChips = mode === 'review' ? [
    { label: 'Quiz me', icon: HelpCircle, prompt: `Ask me two questions to check I understand ${label}.` },
    { label: 'Common pitfalls', icon: Sparkles, prompt: `What mistakes do the course materials warn about for ${label}?` },
    { label: 'Connections', icon: Link2, prompt: `How does ${label} connect to the related concepts?` },
  ] : [
    { label: 'Key idea', icon: Sparkles, prompt: `What is the key idea of ${label}?` },
    { label: 'Example from the notes', icon: ListChecks, prompt: `Walk me through an example of ${label} from the course materials.` },
    { label: 'Check my understanding', icon: HelpCircle, prompt: `Ask me two diagnostic questions about ${label}.` },
  ];

  return (
    <div className={`flex flex-col h-full bg-[#0A0A0A] text-white font-sans ${isMassive ? '' : 'border-t border-[#1A1A1A]'}`}>

      {/* Contextual Active Node Header */}
      {activeNode && (
        <div className="bg-[#111111] border-b border-[#1A1A1A] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">
                {teachBack ? 'Teach it back' : mode === 'review' ? 'Reviewing' : 'Active Concept'}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                activeNode.difficulty === 'advanced' ? 'bg-amber-500/20 text-amber-300' :
                activeNode.difficulty === 'beginner' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'
              }`}>
                {activeNode.difficulty || 'Core'}
              </span>
            </div>
            <h3 className="text-sm font-medium text-white truncate" title={activeNode.label}>
              {activeNode.label}
            </h3>
          </div>

          <button
            onClick={() => toggleMastered(nodeId)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 ${
              isMastered
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                : 'bg-[#1A1A1A] text-[#888888] border-[#333333] hover:text-white hover:border-[#888888]'
            }`}
          >
            {isMastered ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mastered</span>
              </>
            ) : (
              <>
                <Award className="w-3.5 h-3.5" />
                <span>Mark Mastered</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#050505]">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 bg-[#111111] border border-[#1A1A1A] rounded-2xl flex items-center justify-center text-[#888888]">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-medium text-white mb-1">
                {teachBack ? 'Explain it in your own words' : mode === 'review' ? 'Review & Verification Assistant' : 'Socratic Tutor Ready'}
              </h4>
              <p className="text-xs text-[#888888] max-w-xs leading-relaxed">
                {teachBack
                  ? <>Explain <span className="text-white font-medium">{label}</span> as if to a classmate. The tutor will ask a follow-up and point out anything that disagrees with your notes.</>
                  : <>Ask a question about <span className="text-white font-medium">{label}</span>. Answers come only from your course materials, with sources.</>}
              </p>
            </div>

            {!teachBack && (
              <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-sm" role="group" aria-label="Quick prompts">
                {promptChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => send(chip.prompt)}
                    disabled={isLoading || streaming}
                    className="px-3 py-1.5 bg-[#111111] hover:bg-[#1A1A1A] text-xs text-[#CCCCCC] border border-[#1A1A1A] hover:border-[#333333] rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <chip.icon className="w-3.5 h-3.5 text-blue-400" />
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
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
          <div className="flex justify-start">
            <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl rounded-bl-none px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#888888] font-semibold uppercase tracking-widest">Thinking</span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 bg-[#888888] rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 bg-[#444444] rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Help level, teach-back toggle and input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#1A1A1A] bg-[#0A0A0A] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!teachBack ? (
            <HintLadder value={hintLevel} onChange={setHintLevel} policy={policy} disabled={isLoading || streaming} />
          ) : (
            <span className="text-[11px] text-[#888888]">Teach-back: the tutor checks your explanation against the notes.</span>
          )}
          <button
            type="button"
            onClick={() => setTeachBack(!teachBack)}
            aria-pressed={teachBack}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors ${
              teachBack ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' : 'bg-[#111111] text-[#CCCCCC] border-[#1A1A1A] hover:border-[#333333]'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" /> Teach it back
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={teachBack ? `Explain ${label} in your own words...` : `Ask about ${label}...`}
            className="flex-1 bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#333333] transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || streaming}
            className="px-4 bg-white text-black hover:bg-neutral-200 disabled:opacity-50 rounded-xl transition-all flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default TutorChat;
