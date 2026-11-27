import type { Calibration } from '../../api/learner';
import { CLAY } from '../ui/glass';
import { plural } from '../../utils/mastery';

const W = 220;
const R = 98;
const CX = W / 2;
const CY = R + 14;
const TICK = 13;
const COUNT = 37;

/**
 * A half dial of ticks, left to right: how sure the student felt (light) against how often
 * they were right (dark). Overconfidence shows as clay ticks past the right answers.
 */
export default function CalibrationBars({ cal }: { cal: Calibration }) {
  const used = cal.levels.filter(l => l.n > 0 && l.accuracy !== null);
  const n = used.reduce((s, l) => s + l.n, 0);
  if (n === 0) return null;
  const felt = used.reduce((s, l) => s + l.expected * l.n, 0) / n;
  const right = used.reduce((s, l) => s + (l.accuracy ?? 0) * l.n, 0) / n;
  const gap = Math.round((right - felt) * 100);
  const over = felt > right;
  const feltColor = over ? CLAY.bar : '#8fbccb';
  const feltIndex = Math.round(felt * (COUNT - 1));

  const tickColor = (i: number) => {
    const f = i / (COUNT - 1);
    if (over) return f <= right + 1e-6 && right > 0 ? '#1b566b' : f <= felt + 1e-6 ? CLAY.bar : '#dbe7ec';
    return f <= felt + 1e-6 && felt > 0 ? '#8fbccb' : f <= right + 1e-6 ? '#1b566b' : '#dbe7ec';
  };

  return (
    <div className="flex-1 flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: W, height: CY + 4 }}>
        <svg width={W} height={CY + 4} viewBox={`0 0 ${W} ${CY + 4}`} role="img"
          aria-label={`You felt ${Math.round(felt * 100)}% sure and were right ${Math.round(right * 100)}% of the time`}>
          {Array.from({ length: COUNT }, (_, i) => {
            const a = Math.PI + (i / (COUNT - 1)) * Math.PI;
            const cos = Math.cos(a), sin = Math.sin(a);
            const marker = i === feltIndex;
            const inner = R - (marker ? TICK + 7 : TICK);
            return (
              <line key={i} x1={CX + cos * inner} y1={CY + sin * inner} x2={CX + cos * (marker ? R + 3 : R)} y2={CY + sin * (marker ? R + 3 : R)}
                stroke={marker ? '#0e3445' : tickColor(i)} strokeWidth={marker ? 3 : 2.6} strokeLinecap="round"
                style={{ transition: `stroke 300ms ease ${i * 14}ms` }} />
            );
          })}
        </svg>
        <span className="absolute inset-x-0 bottom-1 text-center">
          <span className="block font-display text-[2rem] leading-none tracking-[-0.04em] tabular" style={{ color: over ? CLAY.ink : '#0e3445' }}>
            {gap > 0 ? '+' : gap < 0 ? '−' : ''}{Math.abs(gap)}
          </span>
          <span className="block mt-1 text-[11px] text-ink-4">{over ? 'points surer than right' : gap > 0 ? 'points more right than sure' : 'points apart'}</span>
        </span>
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <p className="flex items-center gap-2.5">
          <span className="h-3 w-1 shrink-0 rounded-full bg-[#1b566b]" />
          <span className="min-w-0 flex-1 text-xs text-ink-3">You were right</span>
          <span className="font-display text-[1.5rem] leading-none tracking-[-0.03em] text-[#0e3445] tabular">{Math.round(right * 100)}%</span>
        </p>
        <p className="flex items-center gap-2.5">
          <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: feltColor }} />
          <span className="min-w-0 flex-1 text-xs text-ink-3">You felt sure</span>
          <span className="font-display text-[1.5rem] leading-none tracking-[-0.03em] text-[#0e3445] tabular">{Math.round(felt * 100)}%</span>
        </p>
        <p className="pt-1 text-[11px] text-ink-4">Tall tick = how sure you felt · {plural(n, 'rated answer')}</p>
      </div>
    </div>
  );
}
