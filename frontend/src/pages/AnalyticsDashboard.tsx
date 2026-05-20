import { useEffect, useState } from 'react';
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
      <div className="analytics-dashboard dashboard-loading">
        <div className="spinner"></div>
        <div>Loading analytics engine...</div>
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
          <span className="stat-value">{data.content?.knowledge_graph?.nodes?.length || 0}</span>
          <span className="stat-trend">Concepts extracted</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">📦 Total Ingestion</span>
          <span className="stat-value">{data.content?.total_docs || 0}</span>
          <span className="stat-trend">{data.content?.total_chunks || 0} Chunks</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">📡 Intent Signals</span>
          <span className="stat-value">{data.engagement?.intent_radar?.reduce((s: number, r: any) => s + (r.count || 0), 0) || 0}</span>
          <span className="stat-trend">Total interactions</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">🎯 Active Modes</span>
          <span className="stat-value">{data.engagement?.intent_radar?.length || 0}</span>
          <span className="stat-trend">Intent categories</span>
        </div>
      </div>

      {/* Advanced Telemetry Grid */}
      <div className="advanced-layout">
        {/* Row 1: Graph (Span 2) */}
        <div className="chart-section span-2" style={{ height: '550px' }}>
          <h3>Brain Visualizer</h3>
          <div className="chart-container">
            <KnowledgeGraphViewer data={data.content?.knowledge_graph} />
          </div>
        </div>

        {/* Row 2: Vector Space 3D (Span 2) - Showstopper */}
        <div className="chart-section span-2" style={{ height: '550px' }}>
          <h3>Semantic Vector Space (t-SNE)</h3>
          <div className="chart-container">
             <VectorSpace3D data={data.content?.vector_space_3d} />
          </div>
        </div>

        {/* Row 3: Treemap (Span 2) */}
        <div className="chart-section span-2" style={{ height: '450px' }}>
          <h3>Knowledge Hierarchy</h3>
          <div className="chart-container">
            <VectorTreemap data={data.content?.treemap} />
          </div>
        </div>

        {/* Row 4: Pipeline & Telemetry (Split) */}
        <div className="chart-section" style={{ height: '400px' }}>
          <h3>RAG Pipeline Flow</h3>
          <div className="chart-container">
            <SankeyPipeline data={data.content?.sankey_flow} />
          </div>
        </div>

        <div className="chart-section row-2">
          <h3>System Telemetry</h3>
          <div className="chart-container">
            <TelemetryCluster data={data.telemetry} />
          </div>
        </div>

        {/* Row 5: Intent & Heatmap (Split) */}
        <div className="chart-section" style={{ height: '400px' }}>
          <h3>Student Intent Profile</h3>
          <div className="chart-container">
            <IntentRadar data={data.engagement?.intent_radar} />
          </div>
        </div>

        <div className="chart-section span-2" style={{ height: '450px' }}>
          <h3>Engagement Heatmap</h3>
          <div className="chart-container">
            <StudyHeatmap data={data.engagement?.study_heatmap} />
          </div>
        </div>
      </div>
    </div>
  );
}
