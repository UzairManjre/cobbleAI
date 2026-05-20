import { 
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter, 
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

interface Props {
  llmStreaming?: any[];
  queueDepth?: any[];
  retrievalLatency?: any[];
  data?: {
    llm_streaming?: any[];
    queue_depth?: any[];
    retrieval_latency?: any[];
  };
}

export default function TelemetryCluster({ llmStreaming, queueDepth, retrievalLatency, data }: Props) {
  const llm = data?.llm_streaming || llmStreaming || [];
  const queue = data?.queue_depth || queueDepth || [];
  const retrieval = data?.retrieval_latency || retrievalLatency || [];

  const tooltipStyle = {
    backgroundColor: '#FFFFFF',
    borderColor: '#0A0A0A',
    borderWidth: '2px',
    borderRadius: '10px',
    color: '#0A0A0A',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: '600',
    boxShadow: '4px 4px 0 rgba(0, 0, 0, 0.9)'
  };

  const chartBlockStyle = {
    flex: 1,
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '16px',
    border: '2.5px solid #0A0A0A',
    boxShadow: '4px 4px 0 rgba(0,0,0,0.95)'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', height: '100%', padding: '4px' }}>
      {/* LLM Inference Speed */}
      <div style={chartBlockStyle}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 800, color: '#FF4D5B', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'Outfit, sans-serif' }}>
          LLM Inference Speed (t/s)
        </h3>
        <div style={{ height: '120px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={llm}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 80]} tick={{ fill: '#0A0A0A', fontSize: 10, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#0A0A0A' }} />
              <Line type="monotone" dataKey="tokens_sec" stroke="#a855f7" strokeWidth={2.5} dot={false} name="Tokens/s" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Redis Task Queue Depth */}
      <div style={chartBlockStyle}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 800, color: '#FF4D5B', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'Outfit, sans-serif' }}>
          Redis Task Queue Depth
        </h3>
        <div style={{ height: '120px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={queue}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 240]} tick={{ fill: '#0A0A0A', fontSize: 10, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#0A0A0A' }} />
              <Area type="step" dataKey="depth" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Qdrant Retrieval Latency vs Confidence */}
      <div style={chartBlockStyle}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '11px', fontWeight: 800, color: '#FF4D5B', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'Outfit, sans-serif' }}>
          Qdrant Retrieval Latency vs Confidence
        </h3>
        <div style={{ height: '120px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 5, right: 20, bottom: 0, left: -20 }}>
              <XAxis type="number" dataKey="latency_ms" name="Latency" unit="ms" domain={[0, 240]} tick={{ fill: '#0A0A0A', fontSize: 10, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey="confidence" name="Confidence" domain={[0, 1]} tick={{ fill: '#0A0A0A', fontSize: 10, fontFamily: 'Outfit' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} itemStyle={{ color: '#0A0A0A' }} />
              <Scatter data={retrieval} fill="#10b981" opacity={0.7} shape="circle" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
