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
        <div className="bg-[#eef4f6] rounded-xl overflow-hidden">
          <button
            type="button"
            aria-expanded={showReasoning}
            aria-controls={reasoningId}
            onClick={() => {
              setShowReasoning(!showReasoning);
              if (!showReasoning) analytics.track('thinking_expanded', {});
            }}
            className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#e6eef2] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs text-[#1b566b]">
              <Brain size={14} /> How I worked it out
            </span>
            {showReasoning ? <ChevronUp size={14} className="text-[#1b566b]" /> : <ChevronDown size={14} className="text-[#1b566b]" />}
          </button>
          {showReasoning && (
            <div id={reasoningId} className="px-3.5 pb-3 text-xs text-ink-2 leading-relaxed border-t border-[#dbe7ec] pt-2.5 whitespace-pre-wrap">
              {reasoning}
            </div>
          )}
        </div>
      )}

      {text && (
        <div className="max-w-none text-sm leading-relaxed text-ink space-y-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: (props) => <p className="my-0 font-normal" {...withoutNode(props)} />,
              pre: (props) => <pre className="bg-[#f1f5f7] p-3.5 rounded-xl overflow-x-auto my-2 text-xs" {...withoutNode(props)} />,
              code: (props) => <code className="text-[#1b566b] bg-[#e6eef2] font-mono text-xs px-1.5 py-0.5 rounded" {...withoutNode(props)} />,
              ul: (props) => <ul className="list-disc pl-5 space-y-1" {...withoutNode(props)} />,
              ol: (props) => <ol className="list-decimal pl-5 space-y-1" {...withoutNode(props)} />,
              a: (props) => <a className="text-[#1b566b] underline underline-offset-2" target="_blank" rel="noreferrer" {...withoutNode(props)} />,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
