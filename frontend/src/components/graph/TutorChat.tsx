import React, { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '../../store/graphStore';
import { Send, BookOpen, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../../utils/analytics';

interface TutorChatProps {
  nodeId: string;
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

  if (!cleanContent && !reasoning) return <span className="opacity-20">...</span>;

  return (
    <div className="space-y-3">
      {reasoning && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => {
              const newState = !showReasoning;
              setShowReasoning(newState);
              if (newState) {
                analytics.track('thinking_expanded', {});
              }
            }}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2 text-[11px] font-medium text-white/40 uppercase tracking-wider">
              <Brain size={12} className={showReasoning ? 'text-blue-400' : ''} />
              Thinking Process
            </div>
            {showReasoning ? <ChevronUp size={14} className="text-white/20" /> : <ChevronDown size={14} className="text-white/20" />}
          </button>

          {showReasoning && (
            <div className="px-4 pb-3 text-[13px] text-white/40 leading-relaxed border-t border-white/[0.04] pt-2 italic whitespace-pre-wrap">
              {reasoning}
            </div>
          )}
        </div>
      )}

      {cleanContent && (
        <div className="prose prose-invert max-w-none text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({node, ...props}) => <p className="my-0" {...props} />,
              pre: ({node, ...props}) => <pre className="bg-black/40 border border-white/10 p-3 rounded-lg overflow-x-auto my-2" {...props} />,
              code: ({node, ...props}) => <code className="text-blue-300 bg-blue-500/10 px-1 rounded" {...props} />
            }}
          >
            {cleanContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

const TutorChat: React.FC<TutorChatProps> = ({ nodeId }) => {
  const [input, setInput] = useState('');
  const { chatHistory, askQuestion, isLoading, currentNodeId } = useGraphStore();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput(''); // Clear input immediately
    // Use the nodeId prop provided by parent, which should match currentNodeId
    await askQuestion(nodeId, message);
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0A0A]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="text-center text-white/20 text-sm py-8">
            Ask a question about this concept to get started
          </div>
        ) : (
          chatHistory.map((msg: ChatMessage, idx) => (
            <div key={idx} className="space-y-2">
              <div
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-500/20 text-blue-100 border border-blue-500/20'
                      : 'bg-white/[0.04] text-white/80 border border-white/[0.06]'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <MessageContent content={msg.content} />
                  )}
                </div>
              </div>
              
              {/* Display sources for assistant messages */}
              {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2 max-w-[85%]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <BookOpen className="w-3 h-3 text-purple-400" />
                      <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wider">
                        Sources ({msg.sources.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {msg.sources.map((source, sIdx) => (
                        <div
                          key={sIdx}
                          className="text-[11px] text-purple-300/80 flex items-center gap-2"
                        >
                          <span className="text-purple-500 mt-0.5 shrink-0">•</span>
                          <span className="flex-1 truncate" title={source.filename || 'Unknown Document'}>
                            {source.filename || 'Unknown Document'}
                          </span>
                          {/* Relevance bar */}
                          <div className="w-12 h-1.5 bg-purple-500/20 rounded-full overflow-hidden shrink-0">
                            <div
                              className="h-full bg-purple-400 rounded-full"
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
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-white/40 font-medium mr-2">Thinking</span>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-blue-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
              <div className="text-[10px] text-white/25 mt-1.5 ml-0.5">
                Searching course materials & analyzing...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this concept..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 rounded-xl transition-colors"
          >
            <Send className="w-4 h-4 text-white/60" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default TutorChat;
