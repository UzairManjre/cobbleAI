import { useEffect, useState } from 'react';
import { Check, Flag, RotateCcw } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import type { FlaggedAnswer } from '../../api/tutor';
import { useToastStore } from '../../store/toastStore';
import CitationList from '../tutor/CitationList';
import MessageContent from '../tutor/MessageContent';

const RATING_LABEL: Record<string, string> = { wrong: 'Marked wrong', not_in_notes: 'Not in my notes', helpful: 'Helpful' };

/** Tutor answers students flagged, so the instructor can check and correct them. */
export default function FeedbackReviewList({ courseId }: { courseId: string }) {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [items, setItems] = useState<FlaggedAnswer[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    tutorApi.listFeedback(courseId, status).then(res => { if (!cancelled) setItems(res.data.items); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, status, reloadKey]);

  const setItemStatus = async (id: string, next: 'open' | 'resolved') => {
    try {
      await tutorApi.updateFeedback(id, next);
      setReloadKey(k => k + 1);
    } catch {
      addToast('Could not update', 'error');
    }
  };

  return (
    <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white flex items-center gap-2"><Flag className="w-4 h-4 text-red-400" /> Flagged tutor answers</h2>
          <p className="text-[11px] text-[#888888] mt-1">Answers students marked wrong or not in their notes. Student names are not shown.</p>
        </div>
        <div className="flex gap-1.5" role="tablist">
          {(['open', 'resolved'] as const).map(s => (
            <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-lg text-xs border capitalize ${status === s ? 'bg-white text-black border-white' : 'border-[#1A1A1A] text-[#AAAAAA]'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[#666666]">{status === 'open' ? 'No flagged answers to check.' : 'Nothing resolved yet.'}</p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={item.id} className="border border-[#1A1A1A] rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-[10px] uppercase tracking-widest ${item.rating === 'wrong' ? 'text-red-400' : 'text-amber-400'}`}>
                  {RATING_LABEL[item.rating] || item.rating}{item.support ? ` · ${item.support} support` : ''}
                </span>
                <span className="text-[10px] text-[#666666]">{new Date(item.updated_at).toLocaleString()}</span>
              </div>
              {item.question && <p className="text-sm text-white">{item.question}</p>}
              {item.answer && <div className="text-xs text-[#BBBBBB]"><MessageContent content={item.answer} /></div>}
              {item.comment && <p className="text-xs text-[#888888]"><span className="text-[#AAAAAA]">Student comment:</span> {item.comment}</p>}
              {item.citations && item.citations.length > 0 && <CitationList courseId={courseId} citations={item.citations} />}
              <div className="flex justify-end">
                {item.status === 'open' ? (
                  <button onClick={() => setItemStatus(item.id, 'resolved')}
                    className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Mark checked
                  </button>
                ) : (
                  <button onClick={() => setItemStatus(item.id, 'open')} className="text-xs text-[#888888] hover:text-white flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
