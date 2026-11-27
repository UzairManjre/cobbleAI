import { useState } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { gradingApi } from '../../api/grading';
import type { Rubric, RubricCriterion } from '../../api/grading';
import { useToastStore } from '../../store/toastStore';
import { panel, pillDark, pillLine } from '../ui/glass';

interface Props {
  assignmentId: string;
  rubric: Rubric | null;
  onSaved: (rubric: Rubric) => void;
  /** Shown as a Cancel button when editing an existing rubric */
  onCancel?: () => void;
}

const EMPTY: RubricCriterion = { name: '', description: '', max_points: 5 };
const field = 'w-full rounded-xl bg-white border border-[#dbe7ec] px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-[#2a6f87] transition-colors';

/** Criteria the AI drafts each submission's grade against. Saving replaces the existing rubric. */
export default function RubricEditor({ assignmentId, rubric, onSaved, onCancel }: Props) {
  const [criteria, setCriteria] = useState<RubricCriterion[]>(
    rubric?.criteria.length ? rubric.criteria.map(c => ({ ...c })) : [{ ...EMPTY }],
  );
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const update = (i: number, patch: Partial<RubricCriterion>) =>
    setCriteria(prev => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const valid = criteria.length > 0 && criteria.every(c => c.name.trim() && c.max_points > 0);
  const total = criteria.reduce((s, c) => s + (c.max_points || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await gradingApi.createRubric(
        assignmentId,
        criteria.map(c => ({ name: c.name.trim(), description: c.description.trim(), max_points: c.max_points })),
      );
      addToast('Rubric saved', 'success');
      onSaved(saved);
    } catch {
      addToast('Could not save the rubric', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${panel} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] text-accent-strong">Rubric</h3>
          <p className="text-xs text-ink-3 mt-0.5">The AI drafts a score and feedback for each criterion. You check every draft before publishing.</p>
        </div>
        <span className="h-8 px-3 shrink-0 inline-flex items-center rounded-full bg-accent-wash text-xs text-accent tabular">{total} marks</span>
      </div>

      <div className="mt-4 hidden md:grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem_2.25rem] gap-2 px-3 text-[11px] text-ink-3">
        <span>Criterion</span><span>What earns full marks</span><span>Marks</span><span />
      </div>
      <ul className="mt-1.5 space-y-2">
        {criteria.map((c, i) => (
          <li key={c.id ?? i} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_6rem_2.25rem] gap-2 items-start rounded-2xl bg-[#f1f5f7] p-2">
            <input value={c.name} onChange={e => update(i, { name: e.target.value })} placeholder="e.g. Identifies the cause" aria-label="Criterion" className={field} />
            <textarea value={c.description} onChange={e => update(i, { description: e.target.value })} placeholder="e.g. Names overfitting and explains why" rows={1}
              aria-label="What earns full marks" className={`${field} resize-y`} />
            <input type="number" min={0.5} step={0.5} value={c.max_points} onChange={e => update(i, { max_points: parseFloat(e.target.value) || 0 })}
              aria-label="Maximum marks" className={`${field} tabular`} />
            <button type="button" onClick={() => setCriteria(prev => prev.filter((_, j) => j !== i))} disabled={criteria.length === 1} aria-label="Remove criterion"
              className="grid place-items-center h-9 w-9 rounded-full text-ink-3 hover:bg-white hover:text-[#8f5646] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setCriteria(prev => [...prev, { ...EMPTY }])} className={pillLine}>
          <Plus size={14} /> Add criterion
        </button>
        <div className="flex items-center gap-2">
          {onCancel && <button type="button" onClick={onCancel} className={pillLine}>Cancel</button>}
          <button type="button" onClick={save} disabled={!valid || saving} className={pillDark}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? 'Saving' : 'Save rubric'}
          </button>
        </div>
      </div>
    </section>
  );
}
