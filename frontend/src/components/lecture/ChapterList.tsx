import { ListOrdered } from 'lucide-react';
import type { LectureChapter } from '../../api/lectures';
import { formatTimestamp } from '../../utils/format';

interface Props {
  chapters: LectureChapter[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}

/** Auto chapters with summaries and timestamped notes; every time is a jump link. */
export default function ChapterList({ chapters, currentTime, onSeek }: Props) {
  if (chapters.length === 0) {
    return <p className="text-xs text-[#888888] p-4">No chapters yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {chapters.map(chapter => {
        const active = currentTime >= chapter.start && currentTime < chapter.end;
        return (
          <li key={chapter.chapter_id} className={`rounded-xl border p-4 transition-colors ${active ? 'border-blue-500/40 bg-blue-500/5' : 'border-[#1A1A1A] bg-[#0A0A0A]'}`}>
            <button type="button" onClick={() => onSeek(chapter.start)} className="w-full text-left group">
              <div className="flex items-center gap-2 mb-1">
                <ListOrdered className="w-3.5 h-3.5 text-[#888888]" />
                <span className="text-[10px] font-mono text-blue-400">{formatTimestamp(chapter.start)}</span>
                {chapter.generated_by === 'fallback' && (
                  <span className="text-[9px] uppercase tracking-widest text-[#666666]" title="Split by time because automatic chaptering was unavailable">time-based</span>
                )}
              </div>
              <h4 className="text-sm font-medium text-white group-hover:underline">{chapter.title}</h4>
            </button>
            {chapter.summary && <p className="text-xs text-[#AAAAAA] mt-2 leading-relaxed">{chapter.summary}</p>}
            {chapter.notes.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {chapter.notes.map(note => (
                  <li key={`${note.t}-${note.text.slice(0, 20)}`}>
                    <button type="button" onClick={() => onSeek(note.t)} className="text-left text-xs text-[#CCCCCC] hover:text-white flex gap-2">
                      <span className="font-mono text-[10px] text-blue-400 shrink-0 pt-0.5">{formatTimestamp(note.t)}</span>
                      <span>{note.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
