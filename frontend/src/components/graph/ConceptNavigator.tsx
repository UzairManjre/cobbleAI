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

  const stepper = 'w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:text-ink hover:bg-sunken disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

  return (
    <div className="flex items-center gap-1 min-w-0">
      <button onClick={() => go(-1)} disabled={currentIndex <= 0} aria-label="Previous concept" className={stepper}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="annot text-ink-3 tabular-nums whitespace-nowrap" aria-live="polite">
        {currentIndex + 1} / {nodes.length}
      </span>
      <button onClick={() => go(1)} disabled={currentIndex >= nodes.length - 1} aria-label="Next concept" className={stepper}>
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="relative hidden sm:block ml-2 w-56 min-w-0">
        <Search className="w-3.5 h-3.5 text-ink-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
            if (e.key === 'Escape') { setQuery(''); setOpen(false); }
          }}
          placeholder="Find a concept"
          aria-label="Find a concept"
          className="w-full h-9 bg-sunken rounded-full pl-8 pr-3 text-sm text-ink placeholder:text-ink-4 border border-transparent focus:outline-none focus:bg-surface focus:border-accent focus:ring-2 focus:ring-accent-50 transition-colors"
        />
        {open && query.trim() && (
          <div className="absolute z-30 left-0 w-72 mt-2 bg-surface border border-line rounded-2xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] overflow-hidden py-1">
            {matches.length === 0 ? (
              <p className="px-4 py-2.5 text-sm text-ink-3">No concept matches “{query.trim()}”</p>
            ) : matches.map(n => (
              <button
                key={n.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(n.id)}
                className="w-full text-left px-4 py-2 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
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
