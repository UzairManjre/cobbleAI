import { useEffect, useState } from 'react';
import { learnerApi } from '../../api/learner';
import type { HeatBin, LectureHeatmap } from '../../api/learner';
import { formatTimestamp } from '../../utils/format';
import { CLAY } from '../ui/glass';

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

  if (!data) return <div className="h-40" aria-busy="true" />;
  if (data.n_events === 0) {
    return <p className="p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No viewing activity yet.</p>;
  }

  const hotByStart = new Map(data.hotspots.map(h => [h.start, h]));
  const detail = selected ? hotByStart.get(selected.start) || selected : data.hotspots[0];
  const seek = (b: HeatBin) => { setSelected(b); onSeek?.(b.start); };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#f1f5f7] p-4">
        <div className="flex items-end gap-[2px] h-28" role="img" aria-label="Confusion along the lecture timeline">
          {data.bins.map(bin => {
            const t = data.peak ? bin.intensity / data.peak : 0;
            const active = detail?.start === bin.start;
            return (
              <button key={bin.start} type="button" onClick={() => seek(bin)}
                title={`${formatTimestamp(bin.start)} · ${bin.replays} replays, ${bin.rewinds} rewinds, ${bin.pauses} pauses, ${bin.questions} questions`}
                className="flex-1 min-w-[2px] rounded-full transition-colors cursor-pointer"
                style={{
                  height: Math.max(4, Math.round(t * 112)),
                  background: active ? CLAY.bar : bin.intensity === 0 ? '#dbe7ec' : `rgba(27, 86, 107, ${0.25 + 0.75 * t})`,
                }} />
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] text-ink-4 tabular mt-2">
          <span>0:00</span>
          <span>{formatTimestamp(data.duration_sec)}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {detail && (
          <div className="rounded-2xl border border-[#e2eaeb] p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-accent-strong tabular">{formatTimestamp(detail.start)}–{formatTimestamp(detail.end)}</span>
              {detail.chapter_title && <span className="text-xs text-ink-3 truncate">{detail.chapter_title}</span>}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[['replays', detail.replays], ['pauses', detail.pauses], ['questions', detail.questions], ['students', detail.students]].map(([k, n]) => (
                <span key={k} className="rounded-xl bg-[#f1f5f7] px-2.5 py-2 min-w-0">
                  <span className="block font-display text-lg leading-none tabular text-accent-strong">{n}</span>
                  <span className="block mt-1 text-[11px] text-ink-3 truncate">{k}</span>
                </span>
              ))}
            </div>
            {detail.transcript && <p className="mt-3 text-xs text-ink-2 leading-relaxed line-clamp-3">“{detail.transcript}”</p>}
            {detail.frame_url && <img src={detail.frame_url} alt={detail.frame_text || 'Slide on screen'} className="mt-3 rounded-xl max-h-40" />}
          </div>
        )}

        <div>
          <p className="text-xs text-ink-3 px-1">Top moments</p>
          <ol className="mt-1">
            {data.hotspots.slice(0, 5).map((h, i) => (
              <li key={h.start}>
                <button type="button" onClick={() => seek(h)}
                  className={`w-full text-left rounded-xl px-2 py-2 flex items-center gap-3 text-sm transition-colors cursor-pointer ${detail?.start === h.start ? 'bg-[#f1f5f7]' : 'hover:bg-[#f1f5f7]'}`}>
                  <span className="text-[11px] text-ink-4 tabular w-3">{i + 1}</span>
                  <span className="tabular text-accent-strong w-11">{formatTimestamp(h.start)}</span>
                  <span className="truncate text-ink-3 text-xs">{h.chapter_title || h.transcript || ''}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
