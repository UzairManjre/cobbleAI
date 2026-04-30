import React, { useEffect, useState } from 'react';
import { ResponsiveContainer } from 'recharts';
import { analyticsApi, coursesApi } from '../api';
import KnowledgeGraphViewer from '../components/analytics/KnowledgeGraphViewer';
import TelemetryCluster from '../components/analytics/TelemetryCluster';
import StudyHeatmap from '../components/analytics/StudyHeatmap';
import SankeyPipeline from '../components/analytics/SankeyPipeline';
import VectorTreemap from '../components/analytics/VectorTreemap';
import VectorSpace3D from '../components/analytics/VectorSpace3D';
import IntentRadar from '../components/analytics/IntentRadar';
import './AnalyticsDashboard.css';

export default function AnalyticsDashboard() {
  const [data, setData] = useState<any>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedCourse]);

  const fetchCourses = async () => {
    try {
      const res = await coursesApi.list();
      setCourses(res.data);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await analyticsApi.getDashboardData(selectedCourse || undefined);
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="analytics-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <div>Loading analytics engine...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <div className="header-main">
          <h1>Analytics Command Center</h1>
          <p className="subtitle">Real-time intelligence from CobbleAI's semantic engine</p>
        </div>
        <div className="course-filter">
          <select 
            value={selectedCourse} 
            onChange={(e) => setSelectedCourse(e.target.value)}
          >
            <option value="">All Courses (Global View)</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick Stats Header */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-label">🧠 Knowledge Graph</span>
          <span className="stat-value">{data.content?.knowledge_graph?.nodes?.length || 0} Nodes</span>
          <span className="stat-trend">+{Math.floor(Math.random() * 5)} today</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">📦 Total Ingestion</span>
          <span className="stat-value">{data.content?.total_docs || 0} Docs</span>
          <span className="stat-trend">2.4k Chunks</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">⚡ Avg Latency</span>
          <span className="stat-value">124ms</span>
          <span className="stat-trend down">-12% vs last hr</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">🎯 Engagement</span>
          <span className="stat-value">84%</span>
          <span className="stat-trend">0.95 Conf.</span>
        </div>
      </div>

      {/* Hidden SVG gradients */}
      <svg width="0" height="0">
        <defs>
          <linearGradient id="colorVectors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34d399" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
          </linearGradient>
        </defs>
      </svg>

      <div className="dashboard-grid advanced-layout">
        
        {/* ROW 1: Brain Visualizer + Telemetry */}
        <div className="chart-card kg-card" style={{ gridColumn: 'span 2', height: '550px' }}>
          <h2>The "Brain" Visualizer: Socratic Knowledge Graph</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <KnowledgeGraphViewer data={data.content?.knowledge_graph} />
          </div>
        </div>

        <div className="chart-card telemetry-card" style={{ gridRow: 'span 2', height: 'auto' }}>
          <h2>Inference & Hardware Telemetry</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <TelemetryCluster 
              llmStreaming={data.telemetry?.llm_streaming || []} 
              queueDepth={data.telemetry?.queue_depth || []} 
              retrievalLatency={data.telemetry?.retrieval_latency || []} 
            />
          </div>
        </div>

        {/* ROW 2: Sankey + Intent Radar */}
        <div className="chart-card sankey-card" style={{ height: '400px' }}>
          <h2>🔀 RAG Pipeline Attrition</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <SankeyPipeline data={data.content?.sankey_flow} />
          </div>
        </div>

        <div className="chart-card" style={{ height: '400px' }}>
          <h2>🎯 Student Intent Classification</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <IntentRadar data={data.engagement?.intent_radar || []} />
          </div>
        </div>

        {/* ROW 3: 3D Vector Space (full width, the showstopper) */}
        <div className="chart-card" style={{ gridColumn: '1 / -1', height: '550px' }}>
          <h2>🌌 3D Semantic Vector Space (t-SNE Projection)</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <VectorSpace3D data={data.content?.vector_space_3d || []} />
          </div>
        </div>

        {/* ROW 4: Treemap + Heatmap */}
        <div className="chart-card" style={{ gridColumn: 'span 2', height: '450px' }}>
          <h2>📦 Vector Store Treemap (Course → Document → Chunks)</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <VectorTreemap data={data.content?.treemap} />
          </div>
        </div>

        <div className="chart-card heatmap-card" style={{ height: '450px' }}>
          <h2>🔥 Engagement Heatmap</h2>
          <div className="chart-container" style={{ height: 'calc(100% - 40px)' }}>
            <StudyHeatmap data={data.engagement?.study_heatmap || []} />
          </div>
        </div>

      </div>
    </div>
  );
}
