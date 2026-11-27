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
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3">
      <span className="text-sm text-[#0e3445]">
        How sure are you?
        <span className="block text-xs text-ink-4">{disabled ? 'Answer first, then rate it.' : 'Only you see this. It shows how well you know what you know.'}</span>
      </span>
      <div className="flex gap-1 p-1 rounded-full bg-[#e6eef2]" role="radiogroup" aria-label="How sure are you?">
        {LEVELS.map(level => (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={value === level.value}
            disabled={disabled}
            onClick={() => onChange(level.value)}
            className={`h-8 px-3.5 rounded-full text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 ${
              value === level.value ? 'bg-[#0e3445] text-white' : 'text-ink-3 hover:text-[#0e3445]'
            }`}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
