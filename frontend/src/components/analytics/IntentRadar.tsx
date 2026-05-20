import React from 'react';
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
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', fontSize: '14px' }}>
        No chat data available for intent analysis.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#e2e8f0" />
        <PolarAngleAxis
          dataKey="intent"
          tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={30}
          tick={{ fill: '#64748b', fontSize: 10 }}
          stroke="#e2e8f0"
        />
        <Radar
          name="Query Intent"
          dataKey="count"
          stroke="#FF4D5B"
          fill="#FF4D5B"
          fillOpacity={0.2}
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#ffffff',
            borderColor: '#e2e8f0',
            borderRadius: '8px',
            color: '#0f172a',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
          itemStyle={{ color: '#0f172a' }}
          animationDuration={0}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
