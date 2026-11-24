import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { learnerApi } from '../../api/learner';
import type { Calibration } from '../../api/learner';

const LEVEL_NAMES: Record<number, string> = { 1: 'Guessing', 2: 'Unsure', 3: 'Fairly sure', 4: 'Certain' };

/** How well the student's confidence matched their correctness (from confidence check-ins). */
export default function CalibrationChart({ courseId }: { courseId: string }) {
  const [data, setData] = useState<Calibration | null>(null);

  useEffect(() => {
    learnerApi.calibration(courseId).then(res => setData(res.data)).catch(() => setData(null));
  }, [courseId]);

  if (!data || data.n === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 text-xs text-ink-3">
        Rate how sure you are before submitting answers, and this chart will show how well your confidence matches your results.
      </div>
    );
  }

  const rows = data.levels.map(l => ({
    level: LEVEL_NAMES[l.confidence],
    accuracy: l.accuracy === null ? null : Math.round(l.accuracy * 100),
    expected: Math.round(l.expected * 100),
    n: l.n,
  }));
  const gap = data.overconfidence ?? 0;
  const verdict = Math.abs(gap) < 0.1 ? 'Your confidence matches your results well.'
    : gap > 0 ? 'You tend to be more confident than your results — double-check answers you feel sure about.'
    : 'You know more than you think — trust yourself a little more.';

  return (
    <div className="bg-surface border border-line rounded-2xl p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium text-ink">Confidence vs. correctness</h3>
        <span className="text-[10px] text-ink-3">{data.n} rated answers</span>
      </div>
      <p className="text-xs text-ink-3 mb-4">{verdict}</p>
      <div className="h-56" role="img" aria-label="Bar chart of accuracy at each confidence level, with the accuracy that confidence level would imply">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows}>
            <CartesianGrid stroke="#e4e4e7" vertical={false} />
            <XAxis dataKey="level" tick={{ fill: '#5c5c62', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#5c5c62', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={{ background: '#f2f2f3', border: '1px solid #1A1A1A', borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => [`${value}%`, name === 'accuracy' ? 'Actually correct' : 'Matches this confidence']}
            />
            <Bar dataKey="accuracy" fill="#073dea" radius={[4, 4, 0, 0]} />
            <Line dataKey="expected" stroke="#5c5c62" strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-ink-4 mt-2">Bars: how often you were right at each confidence level. Dashed line: perfectly calibrated.</p>
    </div>
  );
}

