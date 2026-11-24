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
import { Loader2, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Page, PageHeader } from '../../components/ui/PageHeader';

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
      <Page>
        <div className="flex items-center gap-3 text-ink-3" aria-busy="true">
          <Loader2 className="w-5 h-5 animate-spin" /> <span>Loading analytics</span>
        </div>
      </Page>
    );
  }

  const panel = (title: string, note: string, body: ReactNode, wide = false, minH = 420) => (
    <section className={`border-t border-ink pt-4 flex flex-col ${wide ? 'lg:col-span-2' : ''}`} style={{ minHeight: minH }}>
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <h2 className="font-display text-xl tracking-[-0.025em]">{title}</h2>
        <span className="annot text-ink-3 text-right">{note}</span>
      </div>
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden">{body}</div>
    </section>
  );

  const events = data.engagement?.intent_radar?.reduce((s: number, r: any) => s + (r.count || 0), 0) || 0;

  return (
    <Page>
      <PageHeader
        title="analytics"
        lead="What your students are doing with the tutor, and what your materials cover. Panels without data say so."
        actions={
          <div className="flex flex-col items-end gap-2">
            <label htmlFor="analytics-course" className="sr-only">Course</label>
            <select
              id="analytics-course"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="h-11 min-w-64 bg-surface border border-line-strong text-ink text-sm rounded-full px-4 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="">All courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {selectedCourse && (
              <Link to={`/courses/${selectedCourse}/insights`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
                Question insights and reports <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        }
      />

      <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-14">
        {panel('Concepts students struggle with', 'With reasons', <ConfusionFlagsList flags={data.engagement?.confusion_flags} />, true, 220)}
        {panel('Concept map', `${data.content?.knowledge_graph?.nodes?.length || 0} concepts`, <KnowledgeGraphViewer data={data.content?.knowledge_graph} />, true, 560)}
        {panel('How the tutor answered', 'Retrieval to answer', <SankeyPipeline data={data.content?.sankey_flow} />)}
        {panel('What students asked for', `${events} tutor events`, <div className="h-full flex items-center justify-center p-4"><IntentRadar data={data.engagement?.intent_radar} /></div>)}
        {panel('When students study', 'Hour by day', <StudyHeatmap data={data.engagement?.study_heatmap} />, true, 460)}
        {panel('Material by topic', `${data.content?.total_docs || 0} files · ${data.content?.total_chunks || 0} passages`, <VectorTreemap data={data.content?.treemap} />)}
        {panel('System', 'Response times and load', <TelemetryCluster data={data.telemetry} />)}
        {panel('Passages in meaning space', '3D projection of embeddings', <VectorSpace3D data={data.content?.vector_space_3d} />, true, 560)}
      </div>
    </Page>
  );
}