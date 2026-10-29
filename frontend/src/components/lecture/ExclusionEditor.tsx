import { useState } from 'react';
import { EyeOff, Plus, Trash2 } from 'lucide-react';
import { lecturesApi } from '../../api/lectures';
import type { ExcludedRange } from '../../api/lectures';
import { useToastStore } from '../../store/toastStore';
import { formatTimestamp } from '../../utils/format';

interface Props {
  lectureId: string;
  ranges: ExcludedRange[];
  getCurrentTime: () => number;
  onSaved: (ranges: ExcludedRange[]) => void;
}

function parseTime(value: string): number | null {
  const parts = value.trim().split(':').map(Number);
  if (parts.some(p => Number.isNaN(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Professor-only: mask parts of a recording (e.g. classroom Q&A with student voices)
 *  from captions, transcript and the tutor's search. */
export default function ExclusionEditor({ lectureId, ranges, getCurrentTime, onSaved }: Props) {
  const [draft, setDraft] = useState<ExcludedRange[]>(ranges);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const add = () => {
    const s = parseTime(start);
    const e = parseTime(end);
    if (s === null || e === null || e <= s) {
      addToast('Enter a start and end time like 12:30, with the end after the start', 'error');
      return;
    }
    setDraft([...draft, { start: s, end: e, reason: 'Excluded by instructor' }].sort((a, b) => a.start - b.start));
    setStart('');
    setEnd('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await lecturesApi.updateExclusions(lectureId, draft);
      onSaved(res.data.excluded_ranges);
      addToast('Exclusions saved and the lecture re-indexed', 'success');
    } catch {
      addToast('Could not save exclusions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const now = () => formatTimestamp(getCurrentTime());

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-2">
        <EyeOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-[#AAAAAA] leading-relaxed">
          Excluded ranges are removed from captions, the transcript and the tutor's search. Use this for parts where students can be heard, such as classroom Q&amp;A.
        </p>
      </div>
      <ul className="space-y-2">
        {draft.length === 0 && <li className="text-xs text-[#666666]">Nothing excluded.</li>}
        {draft.map((r, i) => (
          <li key={`${r.start}-${r.end}`} className="flex items-center justify-between bg-[#111111] border border-[#1A1A1A] rounded-lg px-3 py-2 text-xs text-white">
            <span className="font-mono">{formatTimestamp(r.start)} – {formatTimestamp(r.end)}</span>
            <button type="button" onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-[#888888] hover:text-red-400" title="Remove">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <label className="flex-1 text-[10px] text-[#888888] uppercase tracking-widest">From
          <div className="flex gap-1 mt-1">
            <input value={start} onChange={e => setStart(e.target.value)} placeholder="12:30" className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-2 py-1.5 text-xs text-white normal-case" />
            <button type="button" onClick={() => setStart(now())} className="text-[10px] text-blue-400 px-1 normal-case">now</button>
          </div>
        </label>
        <label className="flex-1 text-[10px] text-[#888888] uppercase tracking-widest">To
          <div className="flex gap-1 mt-1">
            <input value={end} onChange={e => setEnd(e.target.value)} placeholder="15:00" className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-2 py-1.5 text-xs text-white normal-case" />
            <button type="button" onClick={() => setEnd(now())} className="text-[10px] text-blue-400 px-1 normal-case">now</button>
          </div>
        </label>
        <button type="button" onClick={add} className="p-2 rounded-lg border border-[#1A1A1A] text-white hover:border-[#333333]" title="Add range">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <button type="button" onClick={save} disabled={saving} className="w-full py-2 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-50">
        {saving ? 'Saving…' : 'Save and re-index'}
      </button>
    </div>
  );
}
