import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { learnerApi } from '../../api/learner';
import type { HeatBin, LectureHeatmap } from '../../api/learner';
import { formatTimestamp } from '../../utils/format';

interface Props {
  lectureId: string;
  onSeek?: (seconds: number) => void;
}

/** Where students rewind, pause and ask the tutor, along the lecture's timeline. */
export default function ConfusionTimeline({ lectureId, onSeek }: Props) {
  const [data, setData] = useState<LectureHeatmap | null>(null);
  const [selected, setSelected] = useState<HeatBin | null>(null);

  useEffect(() => {
    learnerApi.lectureHeatmap(lectureId).then(res => setData(res.data)).catch(() => setData(null));
  }, [lectureId]);

  if (!data) return <p className="text-xs text-[#888888] p-4">Loading…</p>;
  if (data.n_events === 0) {
    return <p className="text-xs text-[#888888] p-4">No viewing activity yet. Rewinds, pauses and questions will appear here as students watch.</p>;
  }

  const hotByStart = new Map(data.hotspots.map(h => [h.start, h]));
  const detail = selected ? hotByStart.get(selected.start) || selected : data.hotspots[0];

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-end gap-px h-24" role="img" aria-label="Confusion intensity along the lecture timeline">
          {data.bins.map(bin => {
            const height = data.peak ? Math.max(2, Math.round((bin.intensity / data.peak) * 96)) : 2;
            const active = detail?.start === bin.start;
            return (
              <button
                key={bin.start}
                type="button"
                onClick={() => { setSelected(bin); onSeek?.(bin.start); }}
                title={`${formatTimestamp(bin.start)} · ${bin.replays} replays, ${bin.rewinds} rewinds, ${bin.pauses} pauses, ${bin.questions} questions`}
                className="flex-1 min-w-[2px] rounded-t-sm transition-colors"
                style={{
                  height,
                  background: bin.intensity === 0 ? '#1A1A1A' : active ? '#f97316' : `rgba(249, 115, 22, ${0.35 + 0.65 * (bin.intensity / (data.peak || 1))})`,
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-[#666666] font-mono mt-1">
          <span>0:00</span>
          <span>{formatTimestamp(data.duration_sec)}</span>
        </div>
      </div>

      {detail && (
        <div className="bg-[#111111] border border-[#1A1A1A] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-white font-mono">{formatTimestamp(detail.start)}–{formatTimestamp(detail.end)}</span>
            {detail.chapter_title && <span className="text-xs text-[#888888] truncate">· {detail.chapter_title}</span>}
          </div>
          <p className="text-[11px] text-[#AAAAAA]">
            {detail.replays} replays · {detail.rewinds} rewinds · {detail.pauses} pauses · {detail.questions} tutor questions · {detail.students} students
          </p>
          {detail.transcript && <p className="text-xs text-[#CCCCCC] leading-relaxed">“{detail.transcript}”</p>}
          {detail.frame_url && <img src={detail.frame_url} alt={detail.frame_text || 'Slide on screen'} className="rounded-lg border border-[#1A1A1A] max-h-40" />}
        </div>
      )}

      <ol className="space-y-1">
        {data.hotspots.slice(0, 5).map((h, i) => (
          <li key={h.start}>
            <button type="button" onClick={() => { setSelected(h); onSeek?.(h.start); }} className="w-full text-left text-xs text-[#CCCCCC] hover:text-white flex gap-3">
              <span className="text-[#666666] w-4">{i + 1}.</span>
              <span className="font-mono text-orange-300 w-12">{formatTimestamp(h.start)}</span>
              <span className="truncate">{h.chapter_title || h.transcript || ''}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
