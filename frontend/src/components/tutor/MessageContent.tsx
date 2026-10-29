import { useId, useState } from 'react';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { analytics } from '../../utils/analytics';
import { splitThinking } from '../../utils/thinking';

// react-markdown passes its AST node as a prop; keep it off the DOM element
function withoutNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

export default function MessageContent({ content, thinking }: { content: string; thinking?: string | null }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const reasoningId = useId();
  const { reasoning, text } = splitThinking(content, thinking);

  if (!text && !reasoning) return <span className="opacity-40 font-mono text-xs">...</span>;

  return (
    <div className="space-y-3">
      {reasoning && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl overflow-hidden">
          <button
            type="button"
            aria-expanded={showReasoning}
            aria-controls={reasoningId}
            onClick={() => {
              setShowReasoning(!showReasoning);
              if (!showReasoning) analytics.track('thinking_expanded', {});
            }}
            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-blue-500/20 transition-colors focus:outline-none"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-blue-400">
              <Brain size={14} /> Thinking Process
            </span>
            {showReasoning ? <ChevronUp size={14} className="text-blue-400" /> : <ChevronDown size={14} className="text-blue-400" />}
          </button>
          {showReasoning && (
            <div id={reasoningId} className="px-3.5 pb-3 text-xs text-[#CCCCCC] leading-relaxed border-t border-blue-500/20 pt-2.5 italic whitespace-pre-wrap">
              {reasoning}
            </div>
          )}
        </div>
      )}

      {text && (
        <div className="max-w-none text-sm leading-relaxed text-white space-y-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: (props) => <p className="my-0 font-normal" {...withoutNode(props)} />,
              pre: (props) => <pre className="bg-[#050505] border border-[#1A1A1A] p-3.5 rounded-xl overflow-x-auto my-2 text-xs" {...withoutNode(props)} />,
              code: (props) => <code className="text-purple-300 bg-purple-500/10 font-mono text-xs px-1.5 py-0.5 rounded border border-purple-500/20" {...withoutNode(props)} />,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
