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
    return <p className="p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No chapters yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {chapters.map((chapter, i) => {
        const active = currentTime >= chapter.start && currentTime < chapter.end;
        return (
          <li key={chapter.chapter_id} className={`rounded-2xl p-3.5 transition-colors ${active ? 'bg-[#e6eef2]' : 'bg-[#f1f5f7]'}`}>
            <button type="button" onClick={() => onSeek(chapter.start)} className="w-full flex items-start gap-3 text-left group cursor-pointer">
              <span className={`grid place-items-center h-7 w-7 shrink-0 rounded-full text-xs tabular ${active ? 'bg-[#0e3445] text-white' : 'bg-white text-[#1b566b]'}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[#0e3445] group-hover:underline underline-offset-2">{chapter.title}</span>
                <span className="block text-[11px] text-ink-3 tabular">
                  {formatTimestamp(chapter.start)}–{formatTimestamp(chapter.end)}
                  {chapter.generated_by === 'fallback' && <span title="Split by time because automatic chaptering was unavailable"> · split by time</span>}
                  {active && <span className="text-[#1b566b]"> · playing</span>}
                </span>
              </span>
            </button>
            {chapter.summary && <p className="text-xs text-ink-2 mt-2 pl-10 leading-relaxed">{chapter.summary}</p>}
            {chapter.notes.length > 0 && (
              <ul className="mt-2 pl-10 space-y-1">
                {chapter.notes.map(note => (
                  <li key={`${note.t}-${note.text.slice(0, 20)}`}>
                    <button type="button" onClick={() => onSeek(note.t)} className="text-left text-xs text-ink-2 hover:text-[#0e3445] flex gap-2 cursor-pointer">
                      <span className="text-[11px] text-[#2a6f87] shrink-0 tabular">{formatTimestamp(note.t)}</span>
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
