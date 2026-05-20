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

  if (!content) return <span className="opacity-50 font-black tracking-widest uppercase text-xs">Initializing...</span>;

  const thoughtMatch = typeof content === 'string' ? content.match(/<thought>([\s\S]*?)<\/thought>/g) : null;
  const reasoning = thoughtMatch ? thoughtMatch.map(m => m.replace(/<\/?thought>/g, '')).join('\n') : '';
  const cleanContent = typeof content === 'string' ? content.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim() : '';

  if (!cleanContent && !reasoning) return <span className="opacity-50 font-black tracking-widest uppercase text-xs">...</span>;

  return (
    <div className="space-y-4">
      {reasoning && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl overflow-hidden transition-all duration-300 shadow-sm">
          <button
            type="button"
            onClick={() => setShowReasoning(!showReasoning)}
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
        ? `I see you're interested in **${initialTopic}**. Let's dive deep into it. What specifically would you like to explore?`
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
    <div className="flex flex-col h-full bg-[#FCFCFC] font-['Outfit']">
      <div className="flex items-center justify-between px-6 py-4 border-b-[3px] border-[#0A0A0A] bg-white shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FFD166] border-2 border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[2px_2px_0_#0A0A0A]">
            <Brain className="w-5 h-5 text-[#0A0A0A] stroke-[2.5px]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-[#0A0A0A] uppercase tracking-tight">Cobble AI</h2>
            <p className="text-[11px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest">{mode} mode</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all border-2 flex items-center gap-1.5 ${
                mode === m.key
                  ? 'bg-[#118AB2] text-white border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]'
                  : 'bg-white text-[#0A0A0A] border-transparent hover:border-[#0A0A0A]/20'
              }`}
            >
              <m.icon size={14} className={mode === m.key ? 'stroke-[3px]' : 'stroke-[2.5px]'} />
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`w-full max-w-[85%] ${
                m.role === 'user'
                  ? 'bg-[#FF4D5B] text-white rounded-2xl rounded-br-none p-5 shadow-[4px_4px_0_#0A0A0A] border-[3px] border-[#0A0A0A]'
                  : 'bg-white text-[#0A0A0A] rounded-2xl rounded-bl-none p-6 shadow-[4px_4px_0_#0A0A0A] border-[3px] border-[#0A0A0A]'
              }`}>
                {m.role === 'user' ? (
                  <p className="text-[15px] font-bold leading-relaxed">{m.content}</p>
                ) : (
                  <MsgContent content={m.content} />
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border-[3px] border-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] rounded-2xl rounded-bl-none px-5 py-4 flex items-center gap-2 w-fit">
                <span className="text-[12px] font-black uppercase tracking-widest text-[#0A0A0A] mr-2">Thinking</span>
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[#FF4D5B] border border-[#0A0A0A] rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-[#118AB2] border border-[#0A0A0A] rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-[#06D6A0] border border-[#0A0A0A] rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t-[3px] border-[#0A0A0A] p-5 bg-white z-10">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSend} className="relative flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message Cobble AI..."
              className="w-full bg-white border-[3px] border-[#0A0A0A] text-[15px] font-bold text-[#0A0A0A] placeholder:text-[#0A0A0A]/40 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-4 focus:ring-[#FF4D5B]/20 shadow-[4px_4px_0_#0A0A0A] transition-all"
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="px-6 bg-[#FF4D5B] text-white border-[3px] border-[#0A0A0A] hover:bg-[#ff3344] disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0_#0A0A0A] rounded-xl transition-all shadow-[4px_4px_0_#0A0A0A] active:translate-y-1 active:shadow-none flex items-center justify-center shrink-0"
            >
              <Send size={20} className="stroke-[2.5px] -ml-1" />
            </button>
          </form>
          <p className="text-center text-[11px] text-[#0A0A0A]/40 mt-3 font-bold uppercase tracking-wider">Cobble AI generated content using {searchParams.get('model') || 'gemma4:e2b'}. Verify important information.</p>
        </div>
      </div>
    </div>
  );

  if (!courseId) {
    return (
      <div className="h-full bg-[#FCFCFC] text-[#0A0A0A] font-['Outfit']">
        {chatPanel}
      </div>
    );
  }

  return (
    <div className="h-full bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] flex overflow-hidden">
      {/* Graph Panel */}
      <div className="flex-1 border-r-[3px] border-[#0A0A0A] bg-gray-50/50">
        <div className="h-full flex flex-col">
          <div className="px-6 py-4 border-b-[3px] border-[#0A0A0A] bg-white shrink-0 flex items-center justify-between">
            <h2 className="text-lg font-black text-[#0A0A0A] uppercase tracking-tight">Knowledge Graph</h2>
            <span className="text-[12px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest">{nodes.length} concepts</span>
          </div>
          <div className="flex-1">
            <KnowledgeGraph onNodeClick={handleNodeClick} />
          </div>
        </div>
      </div>
      {/* Chat Panel */}
      <div className="w-[500px] flex flex-col border-l-2 border-[#0A0A0A]/10">
        {chatPanel}
      </div>
    </div>
  );
}
