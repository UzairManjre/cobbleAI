import React from 'react';
import { 
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface Props {
  llmStreaming: any[];
  queueDepth: any[];
  retrievalLatency: any[];
}

export default function TelemetryCluster({ llmStreaming, queueDepth, retrievalLatency }: Props) {
  const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#f1f5f9'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', height: '100%' }}>
      {/* LLM Inference Speed */}
      <div style={{ flex: 1, background: 'rgba(30,41,59,0.3)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>LLM Inference Speed (t/s)</h3>
        <div style={{ height: '140px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={llmStreaming || []}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 80]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
              <Line type="monotone" dataKey="tokens_sec" stroke="#a855f7" strokeWidth={2} dot={false} name="Tokens/s" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Redis Task Queue Depth */}
      <div style={{ flex: 1, background: 'rgba(30,41,59,0.3)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Redis Task Queue Depth</h3>
        <div style={{ height: '140px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={queueDepth || []}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 240]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
              <Area type="step" dataKey="depth" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Qdrant Retrieval Latency vs Confidence */}
      <div style={{ flex: 1, background: 'rgba(30,41,59,0.3)', borderRadius: '16px', padding: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Qdrant Retrieval Latency vs Confidence</h3>
        <div style={{ height: '140px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 5, right: 20, bottom: 0, left: -20 }}>
              <XAxis type="number" dataKey="latency_ms" name="Latency" unit="ms" domain={[0, 240]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="confidence" name="Confidence" domain={[0, 1]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
              <Scatter data={retrievalLatency || []} fill="#10b981" opacity={0.6} shape="circle" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
