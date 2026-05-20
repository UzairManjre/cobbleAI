import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { Send, BookOpen, Brain, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../../utils/analytics';

interface TutorChatProps {
  nodeId: string;
  isMassive?: boolean;
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

// Component to handle message display with thought tag parsing
const MessageContent = ({ content }: { content: string }) => {
  const [showReasoning, setShowReasoning] = useState(false);

  // Extract reasoning between <thought> tags
  const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/g);
  const reasoning = thoughtMatch ? thoughtMatch.map(m => m.replace(/<\/?thought>/g, '')).join('\n') : '';
  const cleanContent = content.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim();

  if (!cleanContent && !reasoning) return <span className="opacity-40 font-black tracking-widest uppercase text-xs">...</span>;

  return (
    <div className="space-y-4">
      {reasoning && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl overflow-hidden transition-all duration-300 shadow-sm">
          <button
            type="button"
            onClick={() => {
              const newState = !showReasoning;
              setShowReasoning(newState);
              if (newState) {
                analytics.track('thinking_expanded', {});
              }
            }}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100/50 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-2 text-[12px] font-extrabold text-[#0A0A0A] uppercase tracking-widest">
              <Brain size={14} className={showReasoning ? 'text-blue-600 stroke-[3px]' : 'text-blue-400 stroke-[3px]'} />
              Thinking Process
            </div>
            {showReasoning ? <ChevronUp size={16} className="text-[#0A0A0A] stroke-[3px]" /> : <ChevronDown size={16} className="text-[#0A0A0A] stroke-[3px]" />}
          </button>

          {showReasoning && (
            <div className="px-4 pb-4 text-[13px] text-[#0A0A0A]/70 font-bold font-['Inter'] leading-relaxed border-t-2 border-blue-200/50 pt-3 italic whitespace-pre-wrap">
              {reasoning}
            </div>
          )}
        </div>
      )}

      {cleanContent && (
        <div className="prose max-w-none text-sm font-['Inter'] leading-relaxed text-[#0A0A0A]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({node, ...props}) => <p className="my-0 font-medium" {...props} />,
              pre: ({node, ...props}) => <pre className="bg-gray-50 border-2 border-[#0A0A0A] p-4 rounded-xl overflow-x-auto my-3 shadow-[2px_2px_0_#0A0A0A]" {...props} />,
              code: ({node, ...props}) => <code className="text-purple-700 bg-purple-50 font-bold px-1.5 py-0.5 rounded-md border border-purple-200" {...props} />
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

const TutorChat = ({ nodeId, isMassive }: TutorChatProps) => {
  const [input, setInput] = useState('');
  const { chatHistory, askQuestion, isLoading } = useGraphStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // Clear input when node changes to prevent sending old questions to new context
  useEffect(() => {
    setInput('');
  }, [nodeId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput(''); // Clear input immediately
    // Use the nodeId prop provided by parent, which should match currentNodeId
    await askQuestion(nodeId, message);
  };

  return (
    <div className={`flex flex-col h-full bg-white font-['Outfit'] ${isMassive ? '' : 'border-t-[3px] border-[#0A0A0A]'}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <div className="w-16 h-16 bg-gray-200 border-2 border-[#0A0A0A] rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-[#0A0A0A]" />
            </div>
            <div className="text-[#0A0A0A] font-black uppercase tracking-widest text-sm">
              Ask a question to start
            </div>
          </div>
        ) : (
          chatHistory.map((msg: ChatMessage, idx) => (
            <div key={idx} className="space-y-3">
              <div
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-[4px_4px_0_#0A0A0A] border-[3px] border-[#0A0A0A] ${
                    msg.role === 'user'
                      ? 'bg-[#FF4D5B] text-white rounded-br-none'
                      : 'bg-white text-[#0A0A0A] rounded-bl-none'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-[15px] font-bold leading-relaxed">{msg.content}</p>
                  ) : (
                    <MessageContent content={msg.content} />
                  )}
                </div>
              </div>
              
              {/* Display sources for assistant messages */}
              {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <div className="flex justify-start ml-2 mt-1">
                  <div className="bg-purple-50 border-2 border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A] rounded-xl px-4 py-3 max-w-[85%]">
                    <div className="flex items-center gap-2 mb-2 border-b-2 border-[#0A0A0A]/10 pb-2">
                      <BookOpen className="w-4 h-4 text-[#0A0A0A] stroke-[3px]" />
                      <span className="text-[11px] font-black text-[#0A0A0A] uppercase tracking-widest">
                        Sources ({msg.sources.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {msg.sources.map((source, sIdx) => (
                        <div
                          key={sIdx}
                          className="text-[12px] font-bold text-[#0A0A0A]/70 flex items-center gap-3"
                        >
                          <span className="text-purple-600 font-black shrink-0">•</span>
                          <span className="flex-1 truncate" title={source.filename || 'Unknown Document'}>
                            {source.filename || 'Unknown Document'}
                          </span>
                          {/* Relevance bar */}
                          <div className="w-16 h-2 bg-purple-200 border border-[#0A0A0A] rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-purple-500 border-r border-[#0A0A0A]"
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
            <div className="bg-white border-[3px] border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] rounded-2xl rounded-bl-none px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[#0A0A0A] font-black uppercase tracking-widest mr-2">Thinking</span>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#FF4D5B] border border-[#0A0A0A] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[#118AB2] border border-[#0A0A0A] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#06D6A0] border border-[#0A0A0A] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
              <div className="text-[11px] font-bold text-[#0A0A0A]/50 mt-2 uppercase tracking-wide">
                Searching materials & analyzing...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-5 border-t-[3px] border-[#0A0A0A] bg-white">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this concept..."
            className="flex-1 bg-white border-[3px] border-[#0A0A0A] rounded-xl px-4 py-3 text-[15px] font-bold text-[#0A0A0A] placeholder:text-[#0A0A0A]/30 focus:outline-none focus:ring-4 focus:ring-[#FF4D5B]/20 shadow-[4px_4px_0_#0A0A0A] transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-5 bg-[#FF4D5B] text-white border-[3px] border-[#0A0A0A] hover:bg-[#ff3344] disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0_#0A0A0A] rounded-xl transition-all shadow-[4px_4px_0_#0A0A0A] active:translate-y-1 active:shadow-none flex items-center justify-center"
          >
            <Send className="w-5 h-5 stroke-[2.5px] -ml-1" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default TutorChat;
