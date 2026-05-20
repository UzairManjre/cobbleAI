import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSearchParams } from 'react-router-dom';
import { Send, GraduationCap, PenTool, LayoutDashboard, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../utils/analytics';
import { API_URL } from '../api';
import KnowledgeGraph from '../components/graph/KnowledgeGraph';
import { useGraphStore } from '../store/graphStore';

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

  const { token } = useAuthStore();
  const { nodes, currentNodeId, fetchCourseGraph, navigateToNode, setCurrentNode } = useGraphStore();

  // Stable session ID across renders (not tab-close)
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch graph when courseId is present
  useEffect(() => {
    if (courseId) {
      fetchCourseGraph(courseId);
    }
  }, [courseId, fetchCourseGraph]);

  // Auto-select first node when graph loads
  useEffect(() => {
    if (nodes.length > 0 && !currentNodeId) {
      setCurrentNode(nodes[0].id);
    }
  }, [nodes, currentNodeId, setCurrentNode]);

  const handleNodeClick = (nodeId: string) => {
    navigateToNode(nodeId);
  };

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

      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('text/event-stream')) {
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

          if (chunk.includes('event: error')) {
            hasError = true;
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

  const chatPanel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white/80">Socratic Tutor</span>
          <span className="text-[11px] text-white/30">| {mode} mode</span>
        </div>
        <div className="flex items-center gap-1">
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                mode === m.key
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              <m.icon size={14} className="inline mr-1" />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
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
  );

  if (!courseId) {
    return (
      <div className="h-full bg-[#0A0A0A] text-white">
        {chatPanel}
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0A0A0A] text-white flex overflow-hidden">
      {/* Graph Panel */}
      <div className="flex-1 border-r border-white/[0.06]">
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-white/[0.06] text-sm font-semibold text-white/70 shrink-0">
            Knowledge Graph - {nodes.length} concepts
          </div>
          <div className="flex-1">
            <KnowledgeGraph onNodeClick={handleNodeClick} />
          </div>
        </div>
      </div>
      {/* Chat Panel */}
      <div className="w-[480px] flex flex-col">
        {chatPanel}
      </div>
    </div>
  );
}
