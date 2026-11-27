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
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1 flex items-center gap-2 h-9 bg-[#f1f5f7] rounded-full px-3.5 focus-within:ring-1 focus-within:ring-[#2a6f87]">
          <Search className="w-3.5 h-3.5 text-ink-3" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the transcript"
            aria-label="Search the transcript"
            className="flex-1 min-w-0 bg-transparent text-sm text-[#0e3445] placeholder:text-ink-4 focus:outline-none"
          />
        </div>
        <button type="button" onClick={() => setFollow(!follow)} aria-pressed={follow} title="Scroll along with the video"
          className={`h-9 px-3 rounded-full text-xs transition-colors cursor-pointer ${follow ? 'bg-[#0e3445] text-white' : 'bg-[#f1f5f7] text-ink-3 hover:text-[#0e3445]'}`}>
          Follow
        </button>
        <button type="button" onClick={onDownload} title="Download transcript" aria-label="Download transcript"
          className="grid place-items-center h-9 w-9 rounded-full bg-[#f1f5f7] text-[#0e3445] hover:bg-[#e6eef2] transition-colors cursor-pointer">
          <Download className="w-4 h-4" />
        </button>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-0.5">
        {visible.length === 0 && <li className="text-sm text-ink-3 p-3">No matching lines.</li>}
        {visible.map(seg => {
          const active = seg.id === activeId;
          return (
            <li key={seg.id} ref={active ? activeRef : undefined}>
              <button
                type="button"
                onClick={() => onSeek(seg.start)}
                title={seg.low_confidence ? 'The speech recogniser was unsure about this line — check the recording' : undefined}
                className={`w-full text-left flex gap-3 px-2.5 py-2 rounded-xl text-[13px] leading-relaxed transition-colors cursor-pointer ${
                  active ? 'bg-[#e6eef2] text-[#0e3445]' : 'text-ink-2 hover:bg-[#f1f5f7]'
                } ${seg.low_confidence ? 'opacity-60 italic' : ''}`}
              >
                <span className={`text-[11px] shrink-0 pt-0.5 w-11 tabular ${active ? 'text-[#0e3445]' : 'text-[#2a6f87]'}`}>{formatTimestamp(seg.start)}</span>
                <span>{seg.text}{seg.low_confidence && <span className="sr-only"> (low confidence)</span>}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
