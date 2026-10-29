import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, ExternalLink } from 'lucide-react';
import { insightsApi } from '../../api/insights';
import type { SourceCountRow, SourceCounts as Counts } from '../../api/insights';
import { lecturesApi } from '../../api/lectures';
import { openInNewTab } from '../../utils/download';
import { useToastStore } from '../../store/toastStore';

/** Which slides, pages and lecture moments students' questions were answered from. */
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
      navigate(`/professor/courses/${courseId}/lectures/${row.doc_id}?t=${Math.floor(row.t_start)}`);
      return;
    }
    const opened = await openInNewTab(async () => {
      const res = await lecturesApi.fileUrl(row.doc_id);
      return row.page ? `${res.data.url}#page=${row.page}` : res.data.url;
    });
    if (!opened) addToast('Could not open this file', 'error');
  };

  const max = Math.max(1, ...(data?.locations.map(r => r.retrieved) || [1]));

  return (
    <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-medium text-white flex items-center gap-2"><BarChart2 className="w-4 h-4 text-purple-400" /> Most-asked-about material</h2>
        <p className="text-[11px] text-[#888888] mt-1">
          {data ? `${data.n_questions} answered questions in the last ${days} days. ${data.note}` : 'Question counts per slide, page and lecture moment.'}
        </p>
      </div>
      {!data ? null : data.locations.length === 0 ? (
        <p className="text-xs text-[#666666]">No answered questions in this period.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-white">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-[#888888] text-left">
                  <th className="pb-2 pr-3">Material</th><th className="pb-2 pr-3">Where</th><th className="pb-2 pr-3 w-40">Questions</th><th className="pb-2 pr-3">Cited</th><th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {data.locations.map(row => (
                  <tr key={`${row.doc_id}-${row.kind}-${row.location}`} className="border-t border-[#1A1A1A]">
                    <td className="py-2 pr-3 max-w-[220px] truncate" title={row.filename}>{row.filename}</td>
                    <td className="py-2 pr-3 text-[#AAAAAA]">{row.location || 'whole file'}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 bg-[#1A1A1A] rounded-full flex-1 overflow-hidden">
                          <div className="h-full bg-purple-400" style={{ width: `${(row.retrieved / max) * 100}%` }} />
                        </div>
                        <span className="font-mono w-6 text-right">{row.retrieved}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.cited}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => open(row)} className="text-[#888888] hover:text-white" aria-label={`Open ${row.filename} ${row.location}`}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.documents.map(d => (
              <span key={d.doc_id} className="text-[10px] px-2 py-1 rounded-lg border border-[#1A1A1A] text-[#AAAAAA]">
                {d.filename}: {d.questions} question{d.questions === 1 ? '' : 's'}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
