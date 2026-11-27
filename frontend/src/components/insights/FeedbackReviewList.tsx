import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { tutorApi } from '../../api/tutor';
import type { FlaggedAnswer } from '../../api/tutor';
import { useToastStore } from '../../store/toastStore';
import CitationList from '../tutor/CitationList';
import { CLAY, panel } from '../ui/glass';

const RATING: Record<string, { label: string; style: CSSProperties }> = {
  wrong: { label: 'Marked wrong', style: { background: CLAY.wash, color: CLAY.ink } },
  not_in_notes: { label: 'Not in notes', style: { background: '#ecf3f6', color: '#1b566b' } },
  helpful: { label: 'Helpful', style: { background: '#ecf3f6', color: '#1b566b' } },
};

function ago(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Tutor answers students flagged, so the instructor can check them. No student names. */
export default function FeedbackReviewList({ courseId }: { courseId: string }) {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [items, setItems] = useState<FlaggedAnswer[] | null>(null);
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
    <section className={`${panel} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[15px] text-accent-strong">Flagged answers</h2>
          {items && <span className="text-xs text-ink-3">{items.length} {status === 'open' ? 'to check' : 'checked'}</span>}
        </div>
        <div className="inline-flex p-0.5 rounded-full bg-[#f1f5f7]" role="tablist">
          {(['open', 'resolved'] as const).map(s => (
            <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
              className={`h-7 px-3 rounded-full text-xs cursor-pointer ${status === s ? 'bg-accent-strong text-white' : 'text-ink-3 hover:text-accent-strong'}`}>
              {s === 'open' ? 'To check' : 'Checked'}
            </button>
          ))}
        </div>
      </div>

      {!items ? null : items.length === 0 ? (
        <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">{status === 'open' ? 'Nothing to check.' : 'Nothing checked yet.'}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map(item => {
            const r = RATING[item.rating] ?? { label: item.rating, style: { background: '#ecf3f6', color: '#1b566b' } };
            return (
              <li key={item.id} className="rounded-2xl bg-[#f1f5f7] p-4">
                <div className="flex items-center gap-2">
                  <span className="h-6 px-2.5 inline-flex items-center rounded-full text-[11px]" style={r.style}>{r.label}</span>
                  <span className="text-[11px] text-ink-4">{ago(item.updated_at)}</span>
                  {item.status === 'open' ? (
                    <button type="button" onClick={() => setItemStatus(item.id, 'resolved')}
                      className="ml-auto h-7 px-3 rounded-full text-xs bg-white text-accent-strong hover:bg-accent-wash cursor-pointer">Mark checked</button>
                  ) : (
                    <button type="button" onClick={() => setItemStatus(item.id, 'open')}
                      className="ml-auto h-7 px-3 rounded-full text-xs text-ink-3 hover:text-accent-strong cursor-pointer">Reopen</button>
                  )}
                </div>
                {item.question && <p className="mt-2.5 text-sm text-accent-strong">{item.question}</p>}
                {item.answer && <p className="mt-1 text-xs text-ink-3 leading-relaxed line-clamp-2" title={item.answer}>{item.answer.replace(/[#*_`>]/g, '')}</p>}
                {item.comment && <p className="mt-2 text-xs text-ink-2 border-l-2 border-accent-100 pl-2.5">“{item.comment}”</p>}
                {item.citations && item.citations.length > 0 && <div className="mt-2.5"><CitationList courseId={courseId} citations={item.citations} /></div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
