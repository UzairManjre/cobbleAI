import React from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';

interface IntentData {
  intent: string;
  count: number;
}

interface Props {
  data: IntentData[];
}

export default function IntentRadar({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '14px' }}>
        No chat data available for intent analysis.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis
          dataKey="intent"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={30}
          tick={{ fill: '#64748b', fontSize: 10 }}
          stroke="rgba(255,255,255,0.06)"
        />
        <Radar
          name="Query Intent"
          dataKey="count"
          stroke="#818cf8"
          fill="#818cf8"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#f8fafc',
          }}
          itemStyle={{ color: '#fff' }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
