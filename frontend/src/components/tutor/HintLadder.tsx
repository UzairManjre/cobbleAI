import { Lock } from 'lucide-react';
import { HINT_LEVELS } from '../../types/tutor';
import type { HintLevel, TutorPolicyInfo } from '../../types/tutor';

interface Props {
  value: HintLevel;
  onChange: (level: HintLevel) => void;
  policy?: TutorPolicyInfo | null;
  disabled?: boolean;
}

/** How much help the student wants; levels above the instructor's limit are locked. */
export default function HintLadder({ value, onChange, policy, disabled }: Props) {
  const allowed = policy?.allowed_levels ?? HINT_LEVELS.map(h => h.value);
  const lockReason = policy?.assessment_active
    ? `${policy.assessment_reason || 'An assessment is in progress'} — answers are hidden until you submit.`
    : 'Your instructor has limited the help level for this course.';

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Help level">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#888888] mr-1">Help</span>
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
                ? 'bg-white text-black border-white'
                : locked
                  ? 'bg-transparent text-[#555555] border-[#1A1A1A] cursor-not-allowed'
                  : 'bg-[#111111] text-[#CCCCCC] border-[#1A1A1A] hover:border-[#333333]'
            }`}
          >
            {locked && <Lock className="w-3 h-3" />}
            {level.label}
          </button>
        );
      })}
      {policy?.assessment_active && (
        <span className="text-[10px] text-amber-400 ml-1" role="status">Assessment mode</span>
      )}
    </div>
  );
}
