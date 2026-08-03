import { useState, useRef, useEffect, useId } from 'react';
import type { FormEvent } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { Send, BookOpen, Brain, ChevronDown, ChevronUp, MessageSquare, CheckCircle, Sparkles, HelpCircle, Code, Award } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../../utils/analytics';

interface TutorChatProps {
  nodeId: string;
  isMassive?: boolean;
  mode?: 'teach' | 'review';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    doc_id: string;
    filename: string;
    relevance_score: number;
  }>;
}

const MessageContent = ({ content }: { content: string }) => {
  const [showReasoning, setShowReasoning] = useState(false);
  const reasoningId = useId();

  const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/g);
  const reasoning = thoughtMatch ? thoughtMatch.map(m => m.replace(/<\/?thought>/g, '')).join('\n') : '';
  const cleanContent = content.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();

  if (!cleanContent && !reasoning) return <span className="opacity-40 font-mono text-xs">...</span>;

  return (
    <div className="space-y-3">
      {reasoning && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl overflow-hidden transition-all duration-300">
          <button
            type="button"
            aria-expanded={showReasoning}
            aria-controls={reasoningId}
            onClick={() => {
              const newState = !showReasoning;
              setShowReasoning(newState);
              if (newState) {
                analytics.track('thinking_expanded', {});
              }
            }}
            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-blue-500/20 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
              <Brain size={14} className="text-blue-400" />
              Thinking Process
            </div>
            {showReasoning ? <ChevronUp size={14} className="text-blue-400" /> : <ChevronDown size={14} className="text-blue-400" />}
          </button>

          {showReasoning && (
            <div id={reasoningId} className="px-3.5 pb-3 text-xs text-[#CCCCCC] leading-relaxed border-t border-blue-500/20 pt-2.5 italic whitespace-pre-wrap">
              {reasoning}
            </div>
          )}
        </div>
      )}

      {cleanContent && (
        <div className="prose prose-invert max-w-none text-sm leading-relaxed text-white">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({node, ...props}) => <p className="my-0 font-normal" {...props} />,
              pre: ({node, ...props}) => <pre className="bg-[#050505] border border-[#1A1A1A] p-3.5 rounded-xl overflow-x-auto my-2 text-xs" {...props} />,
              code: ({node, ...props}) => <code className="text-purple-300 bg-purple-500/10 font-mono text-xs px-1.5 py-0.5 rounded border border-purple-500/20" {...props} />
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

const TutorChat = ({ nodeId, isMassive, mode = 'teach' }: TutorChatProps) => {
  const [input, setInput] = useState('');
  const { nodes, chatHistory, askQuestion, isLoading, masteredNodes, toggleMastered } = useGraphStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeNode = nodes.find(n => n.id === nodeId);
  const isMastered = masteredNodes.includes(nodeId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  useEffect(() => {
    setInput('');
  }, [nodeId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await askQuestion(nodeId, message);
  };

  const handleQuickPrompt = (promptText: string) => {
    if (isLoading) return;
    askQuestion(nodeId, promptText);
  };

  const promptChips = mode === 'review' ? [
    { label: '🧪 Drill Quiz', icon: HelpCircle, prompt: `Quiz me on key mechanics of ${activeNode?.label || 'this concept'}` },
    { label: '🔍 Common Misconceptions', icon: Sparkles, prompt: `What are the top 3 common pitfalls or misconceptions about ${activeNode?.label || 'this concept'}?` },
    { label: '💻 Implementation Code', icon: Code, prompt: `Show me a concrete code implementation of ${activeNode?.label || 'this concept'}` },
  ] : [
    { label: '💡 Intuitive Analogy', icon: Sparkles, prompt: `Explain ${activeNode?.label || 'this concept'} intuitively using a real-world analogy` },
    { label: '🚀 Practical Example', icon: Code, prompt: `Show a practical real-world example of ${activeNode?.label || 'this concept'} in action` },
    { label: '❓ Check Understanding', icon: HelpCircle, prompt: `Ask me 2 diagnostic questions to verify if I understand ${activeNode?.label || 'this concept'}` },
  ];

  return (
    <div className={`flex flex-col h-full bg-[#0A0A0A] text-white font-sans ${isMassive ? '' : 'border-t border-[#1A1A1A]'}`}>
      
      {/* Contextual Active Node Header */}
      {activeNode && (
        <div className="bg-[#111111] border-b border-[#1A1A1A] px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">
                {mode === 'review' ? 'Reviewing' : 'Active Concept'}
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
                {mode === 'review' ? 'Review & Verification Assistant' : 'Socratic Tutor Ready'}
              </h4>
              <p className="text-xs text-[#888888] max-w-xs leading-relaxed">
                Ask a question about <span className="text-white font-medium">{activeNode?.label || 'this concept'}</span> or tap a quick prompt below to start.
              </p>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-sm" role="group" aria-label="Quick prompts">
              {promptChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickPrompt(chip.prompt)}
                  disabled={isLoading}
                  className="px-3 py-1.5 bg-[#111111] hover:bg-[#1A1A1A] text-xs text-[#CCCCCC] border border-[#1A1A1A] hover:border-[#333333] rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <chip.icon className="w-3.5 h-3.5 text-blue-400" />
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg: ChatMessage, idx) => (
            <div key={idx} className="space-y-2">
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-white text-black font-medium rounded-br-none'
                    : 'bg-[#0A0A0A] text-white rounded-bl-none border border-[#1A1A1A]'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="leading-relaxed">{msg.content}</p>
                  ) : (
                    <MessageContent content={msg.content} />
                  )}
                </div>
              </div>

              {/* Display sources for assistant messages */}
              {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <div className="flex justify-start ml-2 mt-1">
                  <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-3 max-w-[85%]">
                    <div className="flex items-center gap-1.5 mb-2 border-b border-[#1A1A1A] pb-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-[10px] font-semibold text-[#888888] uppercase tracking-widest">
                        Sources ({msg.sources.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {msg.sources.map((source, sIdx) => (
                        <div key={sIdx} className="text-xs text-[#CCCCCC] flex items-center gap-2">
                          <span className="text-purple-400">•</span>
                          <span className="flex-1 truncate" title={source.filename || 'Unknown Document'}>
                            {source.filename || 'Unknown Document'}
                          </span>
                          <div className="w-12 h-1 bg-[#1A1A1A] rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-purple-500"
                              style={{ width: `${Math.min((source.relevance_score || 0) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
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

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-[#1A1A1A] bg-[#0A0A0A]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${activeNode?.label || 'this concept'}...`}
            className="flex-1 bg-[#111111] border border-[#1A1A1A] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-[#888888] focus:outline-none focus:border-[#333333] transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
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
