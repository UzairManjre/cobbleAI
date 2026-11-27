import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from 'recharts';

interface IntentData {
  intent: string;
  count: number;
}

interface Props {
  data: IntentData[];
}

export default function IntentRadar({ data }: Props) {
  if (!data || data.length === 0 || data.every(d => !d.count)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '14px' }}>
        Not measured yet: no tutor chats recorded for this selection.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#282828" />
        <PolarAngleAxis
          dataKey="intent"
          tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={30}
          tick={{ fill: '#64748b', fontSize: 10 }}
          stroke="#282828"
        />
        <Radar
          name="Query Intent"
          dataKey="count"
          stroke="#1b566b"
          fill="#1b566b"
          fillOpacity={0.2}
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#282828',
            borderColor: '#282828',
            borderRadius: '8px',
            color: '#282828',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
          itemStyle={{ color: '#282828' }}
          animationDuration={0}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
