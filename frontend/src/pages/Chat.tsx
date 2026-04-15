import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Send, GraduationCap, PenTool, LayoutDashboard, ChevronLeft, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../utils/analytics';
import { API_URL } from '../api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MsgContent = ({ content }: { content: string }) => {
  const [showReasoning, setShowReasoning] = useState(false);

  if (!content) return <span className="opacity-20">Initializing...</span>;

  const thoughtMatch = typeof content === 'string' ? content.match(/<thought>([\s\S]*?)<\/thought>/g) : null;
  const reasoning = thoughtMatch ? thoughtMatch.map(m => m.replace(/<\/?thought>/g, '')).join('\n') : '';
  const cleanContent = typeof content === 'string' ? content.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim() : '';

  if (!cleanContent && !reasoning) return <span className="opacity-20">...</span>;

  return (
    <div className="space-y-3">
      {reasoning && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => setShowReasoning(!showReasoning)}
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
        <div className="prose prose-invert max-w-none text-[14px] leading-relaxed">
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

/**
 * Generate or retrieve a persistent chat session ID.
 * Uses localStorage with a TTL so sessions survive tab close/reopen.
 * Falls back to a fresh UUID if the stored session is expired.
 */
const SESSION_STORAGE_KEY = 'chat_session_id';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getOrCreateSessionId(): string {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const { id, expiresAt } = JSON.parse(raw);
      if (Date.now() < expiresAt) {
        return id;
      }
    }
  } catch {
    // ignore parse errors
  }

  const newId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: newId, expiresAt }));
  return newId;
}

export default function Chat() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('course');
  const initialTopic = searchParams.get('topic');

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: initialTopic
        ? `I see you're interested in ${initialTopic}. Let's dive deep into it. What specifically would you like to explore?`
        : 'Hello! I\'m your Cobble AI tutor. What would you like to learn about today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'teach' | 'test' | 'review'>('teach');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { logout, token } = useAuthStore();
  const navigate = useNavigate();

  // Stable session ID across renders (not tab-close)
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping || !token) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const startTime = Date.now();

      analytics.track('chat_standalone_sent', {
        messageLength: input.length,
        wordCount: input.split(' ').length,
        mode,
        hasCourse: !!courseId,
        topic: initialTopic || '',
      });

      // Use centralized API URL
      const url = new URL(`${API_URL}/chat/`);
      url.searchParams.append('session_id', sessionIdRef.current);
      url.searchParams.append('message', input);
      if (courseId) url.searchParams.append('course_id', courseId);
      url.searchParams.append('mode', mode);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server returned ${response.status}`);
      }

      // Check if response is streaming or JSON
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('text/event-stream')) {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Failed to get stream reader');
        }

        const decoder = new TextDecoder();
        let assistantMessage = '';
        let hasError = false;

        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Detect SSE-style error events: "event: error\ndata: ..."
          if (chunk.includes('event: error')) {
            hasError = true;
            // Extract the error data after "data: "
            const lines = chunk.split('\n');
            const errorLine = lines.find(l => l.startsWith('data: '));
            if (errorLine) {
              try {
                const errorData = JSON.parse(errorLine.slice(6));
                assistantMessage = `⚠️ Error: ${errorData.detail || errorData.message || errorData.error || 'Unknown error'}`;
              } catch {
                assistantMessage = `⚠️ Error: ${errorLine.slice(6)}`;
              }
            } else {
              assistantMessage = '⚠️ An error occurred while generating the response.';
            }
            break;
          }

          // Also catch plain "Error: " prefix at start of stream (legacy fallback)
          if (!assistantMessage && chunk.startsWith('Error:')) {
            hasError = true;
            assistantMessage = `⚠️ ${chunk}`;
            break;
          }

          assistantMessage += chunk;

          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1].content = assistantMessage;
            return newMessages;
          });
        }

        if (!hasError) {
          const latencyMs = Date.now() - startTime;
          analytics.track('answer_received', {
            answerLengthChars: assistantMessage.length,
            responseLatencyMs: latencyMs,
            isStandaloneChat: true,
          });
        }
      } else {
        // Handle JSON response (non-streaming fallback)
        const json = await response.json();
        const reply = json.reply || json.message || '(empty response)';
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        
        const latencyMs = Date.now() - startTime;
        analytics.track('answer_received', {
          answerLengthChars: reply.length,
          responseLatencyMs: latencyMs,
          isStandaloneChat: true,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, token, courseId, mode, initialTopic]);

  const modes = [
    { key: 'teach' as const, icon: GraduationCap, label: 'Learn' },
    { key: 'test' as const, icon: PenTool, label: 'Test' },
    { key: 'review' as const, icon: LayoutDashboard, label: 'Review' },
  ];

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white">
      {/* Sidebar */}
      <div className="w-16 bg-[#0A0A0A] border-r border-white/[0.06] flex flex-col items-center py-5">
        <button
          onClick={() => courseId ? navigate(`/course/${courseId}`) : navigate('/dashboard')}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.04] mb-6 transition-all"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="w-8 h-8 rounded-lg bg-[var(--accent-surface)] border border-[var(--accent-border)] flex items-center justify-center mb-8">
          <span className="text-sm font-bold text-[var(--accent)]">C</span>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 group relative ${
                mode === m.key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/30 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              <m.icon size={18} />
              <span className="absolute left-full ml-2 px-2 py-1 bg-white/10 backdrop-blur-md text-[11px] text-white rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                {m.label}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => { logout(); navigate('/'); }}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all duration-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="h-14 border-b border-white/[0.06] flex items-center justify-center">
          <span className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-xs font-semibold text-white/50 uppercase tracking-wide">
            {mode} mode
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`w-full max-w-[90%] ${
                  m.role === 'user'
                    ? 'bg-white text-[#0A0A0A] rounded-2xl rounded-br-md p-4'
                    : 'bg-white/[0.04] border border-white/[0.06] text-white/90 rounded-2xl rounded-bl-md p-5'
                }`}>
                  {m.role === 'user' ? (
                    <p className="text-sm leading-relaxed">{m.content}</p>
                  ) : (
                    <MsgContent content={m.content} />
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-4 bg-[#0A0A0A]">
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSend} className="relative">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Message Cobble AI..."
                className="w-full bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-white/20 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:border-white/[0.15] focus:bg-white/[0.06] transition-all duration-200"
              />
              <button
                type="submit"
                disabled={isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-white text-[#0A0A0A] rounded-lg hover:bg-white/90 active:scale-95 transition-all duration-150 disabled:opacity-30"
              >
                <Send size={14} />
              </button>
            </form>
            <p className="text-center text-[10px] text-white/15 mt-3 font-medium">Cobble AI generated content using {searchParams.get('model') || 'gemma4:e2b'}. Verify important information.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
