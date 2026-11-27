/** A small ring: the score of a finished test (0..1), or an empty ring for one still to take. */
export default function ScoreRing({ value, color = '#1b566b' }: { value: number | null; color?: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid place-items-center h-10 w-10 shrink-0" aria-hidden>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="white" stroke="#dbe7ec" strokeWidth="3" />
        {value !== null && <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} />}
      </svg>
      <span className="relative text-[10px] tabular text-[#0e3445]">{value === null ? '' : Math.round(value * 100)}</span>
    </span>
  );
}
