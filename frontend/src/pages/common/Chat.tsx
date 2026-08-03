import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSearchParams } from 'react-router-dom';
import { Send, GraduationCap, PenTool, LayoutDashboard, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../../utils/analytics';
import { API_URL } from '../../api';
import { Button } from '../../components/ui/Button';
import KnowledgeGraph from '../../components/graph/KnowledgeGraph';
import { useGraphStore } from '../../store/graphStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MsgContent = ({ content }: { content: string }) => {
  const [showReasoning, setShowReasoning] = useState(false);

  if (!content) return <span className="opacity-50 font-medium text-xs tracking-wider uppercase">Initializing...</span>;

  const thoughtMatch = typeof content === 'string' ? content.match(/<thought>([\s\S]*?)<\/thought>/g) : null;
  const reasoning = thoughtMatch ? thoughtMatch.map(m => m.replace(/<\/?thought>/g, '')).join('\n') : '';
  const cleanContent = typeof content === 'string' ? content.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim() : '';

  if (!cleanContent && !reasoning) return <span className="opacity-50 font-medium text-xs tracking-wider uppercase">...</span>;

  return (
    <div className="space-y-4">
      {reasoning && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl overflow-hidden transition-all duration-300">
          <button
            type="button"
            onClick={() => setShowReasoning(!showReasoning)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-blue-500/20 transition-colors focus:outline-none"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
              <Brain size={14} className="text-blue-400" />
              Thinking Process
            </div>
            {showReasoning ? <ChevronUp size={14} className="text-blue-400" /> : <ChevronDown size={14} className="text-blue-400" />}
          </button>

          {showReasoning && (
            <div className="px-4 pb-4 text-xs text-[#CCCCCC] leading-relaxed border-t border-blue-500/20 pt-3 italic whitespace-pre-wrap">
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
              pre: ({node, ...props}) => <pre className="bg-[#050505] border border-[#1A1A1A] p-4 rounded-xl overflow-x-auto my-3 text-xs" {...props} />,
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

  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (courseId) {
      fetchCourseGraph(courseId);
    }
  }, [courseId, fetchCourseGraph]);

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
    <div className="flex flex-col h-full bg-black text-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A] bg-[#0A0A0A] shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#111111] border border-[#1A1A1A] rounded-xl flex items-center justify-center text-white">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-medium text-white tracking-tight uppercase">Cobble AI</h2>
            <p className="text-[10px] font-semibold text-[#888888] uppercase tracking-widest">{mode} mode</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {modes.map(m => (
            <Button
              key={m.key}
              onClick={() => setMode(m.key)}
              variant={mode === m.key ? 'primary' : 'outline'}
              size="sm"
              leftIcon={<m.icon size={14} />}
              className={mode !== m.key ? 'text-[#888888] border-[#1A1A1A] bg-[#111111] hover:text-white' : ''}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#050505]">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`w-full max-w-[85%] ${
                m.role === 'user'
                  ? 'bg-white text-black rounded-2xl rounded-br-none p-4 font-medium text-sm'
                  : 'bg-[#0A0A0A] text-white rounded-2xl rounded-bl-none p-5 border border-[#1A1A1A]'
              }`}>
                {m.role === 'user' ? (
                  <p className="text-sm font-medium leading-relaxed">{m.content}</p>
                ) : (
                  <MsgContent content={m.content} />
                )}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 w-fit">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#888888] mr-2">Thinking</span>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-[#888888] rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-[#444444] rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-[#1A1A1A] p-4 bg-[#0A0A0A] z-10">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSend} className="relative flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message Cobble AI..."
              className="w-full bg-[#111111] border border-[#1A1A1A] text-sm text-white placeholder:text-[#888888] rounded-xl px-4 py-3 focus:outline-none focus:border-[#333333] transition-all"
              disabled={isTyping}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isTyping}
              variant="primary"
              className="px-5 shrink-0"
            >
              <Send size={18} />
            </Button>
          </form>
          <p className="text-center text-[10px] text-[#888888] mt-2 font-medium uppercase tracking-wider">Cobble AI generated content using {searchParams.get('model') || 'gemma4:e2b'}. Verify important information.</p>
        </div>
      </div>
    </div>
  );

  if (!courseId) {
    return (
      <div className="h-full bg-black text-white">
        {chatPanel}
      </div>
    );
  }

  return (
    <div className="h-full bg-black text-white flex overflow-hidden">
      {/* Graph Panel */}
      <div className="flex-1 border-r border-[#1A1A1A] bg-[#050505]">
        <div className="h-full flex flex-col">
          <div className="px-6 py-4 border-b border-[#1A1A1A] bg-[#0A0A0A] shrink-0 flex items-center justify-between">
            <h2 className="text-base font-medium text-white tracking-tight uppercase">Knowledge Graph</h2>
            <span className="text-[11px] font-semibold text-[#888888] uppercase tracking-widest">{nodes.length} concepts</span>
          </div>
          <div className="flex-1">
            <KnowledgeGraph onNodeClick={handleNodeClick} />
          </div>
        </div>
      </div>
      {/* Chat Panel */}
      <div className="w-[500px] flex flex-col border-l border-[#1A1A1A]">
        {chatPanel}
      </div>
    </div>
  );
}
