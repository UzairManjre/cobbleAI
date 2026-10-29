import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { TranscriptLine } from '../../api/lectures';
import { formatTimestamp } from '../../utils/format';

interface Props {
  segments: TranscriptLine[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  onDownload: () => void;
}

/** Searchable transcript; click a line to jump there. Low-confidence lines are shaded. */
export default function TranscriptPanel({ segments, currentTime, onSeek, onDownload }: Props) {
  const [query, setQuery] = useState('');
  const [follow, setFollow] = useState(true);
  const activeRef = useRef<HTMLLIElement | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? segments.filter(s => s.text.toLowerCase().includes(q)) : segments;
  }, [segments, query]);

  const activeId = segments.find(s => currentTime >= s.start && currentTime < s.end)?.id;

  useEffect(() => {
    if (follow && !query) activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId, follow, query]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-[#1A1A1A]">
        <div className="flex-1 flex items-center gap-2 bg-[#111111] border border-[#1A1A1A] rounded-lg px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-[#888888]" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the transcript"
            aria-label="Search the transcript"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-[#666666] focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-1 text-[10px] text-[#888888] select-none">
          <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> Follow
        </label>
        <button type="button" onClick={onDownload} title="Download transcript" className="p-1.5 text-[#888888] hover:text-white">
          <Download className="w-4 h-4" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-3 space-y-1">
        {visible.length === 0 && <li className="text-xs text-[#888888] p-2">No matching lines.</li>}
        {visible.map(seg => {
          const active = seg.id === activeId;
          return (
            <li key={seg.id} ref={active ? activeRef : undefined}>
              <button
                type="button"
                onClick={() => onSeek(seg.start)}
                title={seg.low_confidence ? 'The speech recogniser was unsure about this line — check the recording' : undefined}
                className={`w-full text-left flex gap-3 px-2 py-1.5 rounded-lg text-xs leading-relaxed transition-colors ${
                  active ? 'bg-blue-500/10 text-white' : 'text-[#CCCCCC] hover:bg-[#111111]'
                } ${seg.low_confidence ? 'opacity-60 italic' : ''}`}
              >
                <span className="font-mono text-[10px] text-blue-400 shrink-0 pt-0.5 w-12">{formatTimestamp(seg.start)}</span>
                <span>{seg.text}{seg.low_confidence && <span className="sr-only"> (low confidence)</span>}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
