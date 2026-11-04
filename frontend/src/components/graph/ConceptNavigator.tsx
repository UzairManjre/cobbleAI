import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { GraphNode } from '../../types/graph';

interface Props {
  nodes: GraphNode[];
  currentIndex: number;
  onPick: (nodeId: string) => void;
}

const MAX_MATCHES = 8;

/** Previous / next through the concepts, plus a search box to jump straight to one. */
export default function ConceptNavigator({ nodes, currentIndex, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter(n => n.label.toLowerCase().includes(q)).slice(0, MAX_MATCHES);
  }, [nodes, query]);

  const pick = (id: string) => {
    onPick(id);
    setQuery('');
    setOpen(false);
  };
  const go = (offset: number) => {
    const next = nodes[currentIndex + offset];
    if (next) onPick(next.id);
  };

  return (
    <div className="px-4 py-3 border-b border-[#1A1A1A] bg-[#0A0A0A] flex items-center gap-2">
      <button
        onClick={() => go(-1)}
        disabled={currentIndex <= 0}
        aria-label="Previous concept"
        className="p-2 rounded-lg border border-[#1A1A1A] bg-[#111111] text-[#AAAAAA] hover:text-white hover:border-[#333333] disabled:opacity-30"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-[11px] text-[#888888] tabular-nums whitespace-nowrap px-1">
        {currentIndex + 1} / {nodes.length}
      </span>
      <button
        onClick={() => go(1)}
        disabled={currentIndex >= nodes.length - 1}
        aria-label="Next concept"
        className="p-2 rounded-lg border border-[#1A1A1A] bg-[#111111] text-[#AAAAAA] hover:text-white hover:border-[#333333] disabled:opacity-30"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="relative flex-1 min-w-0">
        <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
            if (e.key === 'Escape') { setQuery(''); setOpen(false); }
          }}
          placeholder="Jump to a concept"
          aria-label="Search concepts"
          className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-[#666666] focus:outline-none focus:border-[#333333]"
        />
        {open && query.trim() && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-[#0A0A0A] border border-[#262626] rounded-xl shadow-2xl overflow-hidden">
            {matches.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-[#888888]">No concept matches “{query.trim()}”</p>
            ) : matches.map(n => (
              <button
                key={n.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(n.id)}
                className="w-full text-left px-3 py-2 text-xs text-[#DDDDDD] hover:bg-[#161616] hover:text-white"
              >
                {n.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
