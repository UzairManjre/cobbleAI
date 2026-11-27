import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { insightsApi } from '../../api/insights';
import type { SourceCountRow, SourceCounts as Counts } from '../../api/insights';
import { lecturesApi } from '../../api/lectures';
import { openInNewTab } from '../../utils/download';
import { useToastStore } from '../../store/toastStore';
import { panel } from '../ui/glass';

const TOP = 8;

/** Which files, and which pages and lecture moments in them, students' questions were answered from. */
export default function SourceCounts({ courseId, days }: { courseId: string; days: number }) {
  const [data, setData] = useState<Counts | null>(null);
  const navigate = useNavigate();
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    insightsApi.sourceCounts(courseId, days).then(res => { if (!cancelled) setData(res.data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, days]);

  const open = async (row: SourceCountRow) => {
    if (row.t_start !== undefined && row.t_start !== null) {
      navigate(`/courses/${courseId}/lectures/${row.doc_id}?t=${Math.floor(row.t_start)}`);
      return;
    }
    const opened = await openInNewTab(async () => {
      const res = await lecturesApi.fileUrl(row.doc_id);
      return row.page ? `${res.data.url}#page=${row.page}` : res.data.url;
    });
    if (!opened) addToast('Could not open this file', 'error');
  };

  const docs = [...(data?.documents ?? [])].sort((a, b) => b.questions - a.questions);
  const docMax = Math.max(1, ...docs.map(d => d.questions));
  const spots = (data?.locations ?? []).slice(0, TOP);
  const spotMax = Math.max(1, ...spots.map(r => r.retrieved));

  return (
    <section className={`${panel} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] text-accent-strong">Material students lean on</h2>
        <p className="text-xs text-ink-3">{data ? `${data.n_questions} answered questions, last ${days} days` : ''}</p>
      </div>

      {!data ? null : data.locations.length === 0 ? (
        <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No answered questions in this period.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* By file */}
          <div className="rounded-2xl bg-[#f1f5f7] p-4">
            <p className="text-xs text-ink-3">By file</p>
            <ul className="mt-3 space-y-3">
              {docs.map(d => (
                <li key={d.doc_id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-accent-strong">{d.filename}</span>
                    <span className="shrink-0 tabular text-ink-2">{d.questions}</span>
                  </div>
                  <span className="mt-1.5 block h-2 rounded-full bg-[#dbe7ec] overflow-hidden">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(d.questions / docMax) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Hot spots: the exact page or moment */}
          <div>
            <p className="text-xs text-ink-3 px-1">Busiest pages and moments</p>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-4">
              {spots.map((row, i) => (
                <li key={`${row.doc_id}-${row.kind}-${row.location}`}>
                  <button type="button" onClick={() => open(row)}
                    className="group w-full grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-1 py-2 text-left hover:bg-[#f1f5f7] transition-colors cursor-pointer">
                    <span className="text-[11px] text-ink-4 tabular">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-sm text-accent-strong truncate" title={row.filename}>{row.filename.replace(/\.[^.]+$/, '')}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1.5 flex-1 rounded-full bg-[#dbe7ec] overflow-hidden">
                          <span className="block h-full rounded-full bg-accent-300" style={{ width: `${(row.retrieved / spotMax) * 100}%` }} />
                        </span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs text-ink-2 tabular">{row.location || 'file'}</span>
                      <span className="flex items-center justify-end gap-0.5 text-[11px] text-ink-4 tabular">{row.retrieved}<ArrowUpRight size={11} className="opacity-0 group-hover:opacity-100" /></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {data?.note && <p className="mt-3 text-[11px] text-ink-4">{data.note}</p>}
    </section>
  );
}
