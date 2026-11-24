import { Lock } from 'lucide-react';
import { HINT_LEVELS } from '../../types/tutor';
import type { HintLevel, TutorPolicyInfo } from '../../types/tutor';

interface Props {
  value: HintLevel;
  onChange: (level: HintLevel) => void;
  policy?: TutorPolicyInfo | null;
  disabled?: boolean;
  /** One quiet select instead of a row of four buttons */
  compact?: boolean;
}

/** How much help the student wants; levels above the instructor's limit are locked. */
export default function HintLadder({ value, onChange, policy, disabled, compact }: Props) {
  const allowed = policy?.allowed_levels ?? HINT_LEVELS.map(h => h.value);
  const lockReason = policy?.assessment_active
    ? `${policy.assessment_reason || 'An assessment is in progress'} — answers are hidden until you submit.`
    : 'Your instructor has limited the help level for this course.';

  if (compact) {
    const current = HINT_LEVELS.find(h => h.value === value);
    return (
      <label className="inline-flex items-center gap-1.5 text-xs text-ink-3" title={current?.description}>
        Help
        <select
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value as HintLevel)}
          className="bg-transparent text-ink font-medium rounded-md py-1 pr-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-50 cursor-pointer disabled:opacity-50"
        >
          {HINT_LEVELS.map(level => {
            const locked = !allowed.includes(level.value);
            return (
              <option key={level.value} value={level.value} disabled={locked}>
                {level.label}{locked ? ' (locked)' : ''}
              </option>
            );
          })}
        </select>
        {policy?.assessment_active && <span className="text-ink-3" role="status" title={lockReason}>· assessment mode</span>}
      </label>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Help level">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-3 mr-1">Help</span>
      {HINT_LEVELS.map(level => {
        const locked = !allowed.includes(level.value);
        const active = value === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || locked}
            onClick={() => onChange(level.value)}
            title={locked ? lockReason : level.description}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 ${
              active
                ? 'bg-accent text-white border-accent'
                : locked
                  ? 'bg-transparent text-ink-4 border-line cursor-not-allowed'
                  : 'bg-sunken text-ink-2 border-line hover:border-line-strong'
            }`}
          >
            {locked && <Lock className="w-3 h-3" />}
            {level.label}
          </button>
        );
      })}
      {policy?.assessment_active && (
        <span className="text-[10px] text-amber-700 ml-1" role="status">Assessment mode</span>
      )}
    </div>
  );
}
