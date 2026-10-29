import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, coursesApi } from '../../api';
import KnowledgeGraphViewer from '../../components/analytics/KnowledgeGraphViewer';
import TelemetryCluster from '../../components/analytics/TelemetryCluster';
import StudyHeatmap from '../../components/analytics/StudyHeatmap';
import SankeyPipeline from '../../components/analytics/SankeyPipeline';
import VectorTreemap from '../../components/analytics/VectorTreemap';
import VectorSpace3D from '../../components/analytics/VectorSpace3D';
import IntentRadar from '../../components/analytics/IntentRadar';
import ConfusionFlagsList from '../../components/analytics/ConfusionFlagsList';
import { Loader2, Brain, Box, Activity, Target } from 'lucide-react';

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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-[#888888]">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <div className="text-sm font-medium tracking-wide">Loading intelligence engine...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8 lg:p-12 relative overflow-hidden">
      
      <div className="max-w-7xl mx-auto space-y-10 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-[#1A1A1A]">
          <div>
            <h1 className="text-4xl font-outfit font-light text-white tracking-tight mb-2">
              Intelligence Center
            </h1>
            <p className="text-sm text-[#888888] font-medium tracking-wide">
              Real-time telemetry and semantic insights.
            </p>
          </div>
          
          <div className="w-full md:w-64 space-y-2">
            {selectedCourse && (
              <Link to={`/professor/courses/${selectedCourse}/insights`} className="block text-right text-xs text-[#888888] hover:text-white">
                Question insights, coverage gaps and reports →
              </Link>
            )}
            <select 
              value={selectedCourse} 
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full bg-[#0A0A0A] border border-[#1A1A1A] text-white text-sm rounded-lg px-4 py-3 focus:outline-none focus:border-[#333333] transition-all appearance-none font-medium"
            >
              <option value="">Global Network (All Courses)</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col justify-between hover:border-[#333333] transition-colors">
            <div className="flex justify-between items-start text-[#888888] mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">Knowledge Graph</span>
              <Brain size={16} />
            </div>
            <div>
              <span className="block text-3xl font-light text-white mb-1">{data.content?.knowledge_graph?.nodes?.length || 0}</span>
              <span className="text-xs text-[#888888]">Concepts extracted</span>
            </div>
          </div>
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col justify-between hover:border-[#333333] transition-colors">
            <div className="flex justify-between items-start text-[#888888] mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">Total Ingestion</span>
              <Box size={16} />
            </div>
            <div>
              <span className="block text-3xl font-light text-white mb-1">{data.content?.total_docs || 0}</span>
              <span className="text-xs text-[#888888]">{data.content?.total_chunks || 0} Chunks processed</span>
            </div>
          </div>
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col justify-between hover:border-[#333333] transition-colors">
            <div className="flex justify-between items-start text-[#888888] mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">Intent Signals</span>
              <Activity size={16} />
            </div>
            <div>
              <span className="block text-3xl font-light text-white mb-1">{data.engagement?.intent_radar?.reduce((s: number, r: any) => s + (r.count || 0), 0) || 0}</span>
              <span className="text-xs text-[#888888]">Total telemetry events</span>
            </div>
          </div>
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col justify-between hover:border-[#333333] transition-colors">
            <div className="flex justify-between items-start text-[#888888] mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">Active Modes</span>
              <Target size={16} />
            </div>
            <div>
              <span className="block text-3xl font-light text-white mb-1">{data.engagement?.intent_radar?.length || 0}</span>
              <span className="text-xs text-[#888888]">Intent categories mapped</span>
            </div>
          </div>
        </div>

        {/* Telemetry Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Brain Visualizer (Full Width) */}
          <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '600px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Brain Visualizer</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
              <KnowledgeGraphViewer data={data.content?.knowledge_graph} />
            </div>
          </div>

          {/* Vector Space 3D (Full Width) */}
          <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '600px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Semantic Vector Space</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
               <VectorSpace3D data={data.content?.vector_space_3d} />
            </div>
          </div>

          {/* Knowledge Hierarchy */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '450px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Knowledge Hierarchy</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
              <VectorTreemap data={data.content?.treemap} />
            </div>
          </div>

          {/* RAG Pipeline Flow */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '450px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Tutor Answer Flow</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
              <SankeyPipeline data={data.content?.sankey_flow} />
            </div>
          </div>

          {/* System Telemetry */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '450px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">System Telemetry</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
              <TelemetryCluster data={data.telemetry} />
            </div>
          </div>

          {/* Intent Profile */}
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '450px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Intent Profile</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505] flex items-center justify-center p-4">
              <IntentRadar data={data.engagement?.intent_radar} />
            </div>
          </div>

          {/* Engagement Heatmap (Full Width) */}
          <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '500px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Global Heatmap</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
              <StudyHeatmap data={data.engagement?.study_heatmap} />
            </div>
          </div>

          {/* Concepts students struggle with, and why */}
          <div className="lg:col-span-2 bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 flex flex-col" style={{ minHeight: '240px' }}>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
              <h3 className="text-sm font-outfit font-medium text-white tracking-widest uppercase">Concepts Students Struggle With</h3>
            </div>
            <div className="flex-1 rounded-xl overflow-hidden border border-[#1A1A1A] bg-[#050505]">
              <ConfusionFlagsList flags={data.engagement?.confusion_flags} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
