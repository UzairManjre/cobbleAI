const LEVELS = [
  { value: 1, label: 'Guessing' },
  { value: 2, label: 'Unsure' },
  { value: 3, label: 'Fairly sure' },
  { value: 4, label: 'Certain' },
];

interface Props {
  value?: number;
  onChange: (level: number) => void;
  disabled?: boolean;
}

/** "How sure are you?" — logged before results so students can see how well confidence matches correctness. */
export default function ConfidenceCheckIn({ value, onChange, disabled }: Props) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="How sure are you?">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[#888888] mr-2">How sure are you?</span>
      {LEVELS.map(level => (
        <button
          key={level.value}
          type="button"
          role="radio"
          aria-checked={value === level.value}
          disabled={disabled}
          onClick={() => onChange(level.value)}
          title={disabled ? 'Answer the question first' : undefined}
          className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-40 ${
            value === level.value ? 'bg-white text-black border-white' : 'bg-[#0A0A0A] text-[#AAAAAA] border-[#1A1A1A] hover:border-[#333333]'
          }`}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}
