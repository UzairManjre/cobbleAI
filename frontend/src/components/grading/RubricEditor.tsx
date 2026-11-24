import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { gradingApi } from '../../api/grading';
import type { Rubric, RubricCriterion } from '../../api/grading';
import { useToastStore } from '../../store/toastStore';

interface Props {
  assignmentId: string;
  rubric: Rubric | null;
  onSaved: (rubric: Rubric) => void;
}

const EMPTY: RubricCriterion = { name: '', description: '', max_points: 5 };

/** Criteria the AI drafts each submission's grade against. Saving replaces the existing rubric. */
export default function RubricEditor({ assignmentId, rubric, onSaved }: Props) {
  const [criteria, setCriteria] = useState<RubricCriterion[]>(
    rubric?.criteria.length ? rubric.criteria.map(c => ({ ...c })) : [{ ...EMPTY }],
  );
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const update = (i: number, patch: Partial<RubricCriterion>) =>
    setCriteria(prev => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const valid = criteria.length > 0 && criteria.every(c => c.name.trim() && c.max_points > 0);

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
    <div className="border border-line rounded-xl p-5 bg-surface space-y-3">
      <div>
        <h2 className="text-sm font-medium text-ink">Rubric</h2>
        <p className="text-xs text-ink-3 mt-1">The AI drafts a score and feedback per criterion; you review every draft before publishing.</p>
      </div>
      {criteria.map((c, i) => (
        <div key={c.id ?? i} className="grid grid-cols-12 gap-2 items-start">
          <input
            value={c.name}
            onChange={e => update(i, { name: e.target.value })}
            placeholder="Criterion"
            className="col-span-3 bg-canvas border border-line rounded p-2 text-sm text-ink focus:outline-none focus:border-accent"
          />
          <textarea
            value={c.description}
            onChange={e => update(i, { description: e.target.value })}
            placeholder="What earns full points"
            rows={1}
            className="col-span-6 bg-canvas border border-line rounded p-2 text-sm text-ink focus:outline-none focus:border-accent resize-y"
          />
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={c.max_points}
            onChange={e => update(i, { max_points: parseFloat(e.target.value) || 0 })}
            aria-label="Maximum points"
            className="col-span-2 bg-canvas border border-line rounded p-2 text-sm text-ink focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => setCriteria(prev => prev.filter((_, j) => j !== i))}
            disabled={criteria.length === 1}
            aria-label="Remove criterion"
            className="col-span-1 p-2 text-ink-3 hover:text-red-600 disabled:opacity-30"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button onClick={() => setCriteria(prev => [...prev, { ...EMPTY }])} className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
          <Plus className="w-3.5 h-3.5" /> Add criterion
        </button>
        <button
          onClick={save}
          disabled={!valid || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-strong disabled:opacity-40"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save rubric'}
        </button>
      </div>
    </div>
  );
}
