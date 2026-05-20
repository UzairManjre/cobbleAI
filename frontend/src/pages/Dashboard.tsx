import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  FileText, 
  Users, 
  Award, 
  Calendar, 
  Clock, 
  Plus, 
  ChevronRight, 
  ChevronLeft, 
  MoreVertical,
  ArrowRight,
  Sparkles,
  FolderOpen
} from 'lucide-react';
import { coursesApi, testsApi, authApi, documentsApi, graphsApi, analyticsApi } from '../api';
import KnowledgeGraphViewer from '../components/analytics/KnowledgeGraphViewer';
import IntentRadar from '../components/analytics/IntentRadar';
import { useAuthStore } from '../store/authStore';

export default function Dashboard() {
  const { token, role, logout } = useAuthStore();
  const navigate = useNavigate();

  // Data State
  const [courses, setCourses] = useState<any[]>([]);
  const [_tests, setTests] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [professorName, setProfessorName] = useState('Professor');
  const [isLoading, setIsLoading] = useState(true);
  const [recentDocuments, setRecentDocuments] = useState<any[]>([]);
  const [courseGraphStatuses, setCourseGraphStatuses] = useState<Record<string, string>>({});
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [activeInsightTab, setActiveInsightTab] = useState<'kg' | 'intent'>('kg');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseDesc, setCourseDesc] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, [token, role]);

  const loadDashboardData = async () => {
    if (!token) return;
    setIsLoading(true);
    
    // 1. Load user details
    try {
      const userRes = await authApi.getCurrentUser();
      if (userRes.data && userRes.data.name) {
        setProfessorName(userRes.data.name);
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }

    // 2. Load courses
    let activeCourses: any[] = [];
    try {
      const coursesRes = await coursesApi.list();
      activeCourses = coursesRes.data || [];
      setCourses(activeCourses);
    } catch (err) {
      console.error('Error loading courses:', err);
      setCourses([]);
    }

    // 3. Load tests (Professor Only)
    if (role === 'professor') {
      try {
        const testsRes = await testsApi.listAllProfessorTests();
        setTests(testsRes.data?.tests || []);
      } catch (err) {
        console.error('Error loading tests:', err);
        setTests([]);
      }
    }

    // 4. Load students (Professor Only)
    if (role === 'professor') {
      try {
        const studentsRes = await coursesApi.getProfessorStudents();
        setStudents(studentsRes.data || []);
      } catch (err) {
        console.error('Error loading students:', err);
        setStudents([]);
      }
    }

    // 5. Load documents & graph statuses for all courses in parallel
    if (activeCourses.length > 0) {
      try {
        const docPromises = activeCourses.map(async (c: any) => {
          try {
            const docsRes = await documentsApi.list(c.id);
            return (docsRes.data || []).map((d: any) => ({
              ...d,
              courseTitle: c.title,
              courseCode: c.code,
              courseId: c.id
            }));
          } catch {
            return [];
          }
        });
        const docsResults = await Promise.all(docPromises);
        const mergedDocs = docsResults.flat();
        mergedDocs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentDocuments(mergedDocs.slice(0, 5));
      } catch (err) {
        console.error('Error fetching documents:', err);
      }

      try {
        const statusPromises = activeCourses.map(async (c: any) => {
          try {
            const statusRes = await graphsApi.getStatus(c.id);
            return { id: c.id, status: statusRes.data.status };
          } catch {
            return { id: c.id, status: 'no_documents' };
          }
        });
        const statuses = await Promise.all(statusPromises);
        const statusMap = statuses.reduce((acc, curr) => {
          acc[curr.id] = curr.status;
          return acc;
        }, {} as Record<string, string>);
        setCourseGraphStatuses(statusMap);
      } catch (err) {
        console.error('Error fetching graph statuses:', err);
      }
    } else {
      setRecentDocuments([]);
      setCourseGraphStatuses({});
    }

    // 6. Load analytics data (Professor Only)
    if (role === 'professor') {
      try {
        const analyticsRes = await analyticsApi.getDashboardData();
        setAnalyticsData(analyticsRes.data || null);
      } catch (err) {
        console.error('Error fetching analytics data:', err);
        setAnalyticsData(null);
      }
    }

    setIsLoading(false);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await coursesApi.create({ 
        title: courseTitle, 
        code: courseCode,
        description: courseDesc || undefined
      } as any);
      
      setShowModal(false);
      setCourseTitle('');
      setCourseCode('');
      setCourseDesc('');
      
      // Refresh dashboard data
      loadDashboardData();
    } catch (err) {
      alert('Failed to create course');
    }
  };

  // Compute Stats
  const stats = useMemo(() => {
    const classesCount = courses.length;
    const totalDocumentsCount = courses.reduce((sum, c) => sum + (c.docs_count || 0), 0);
    const uniqueStudents = new Set(students.map(s => s.name)).size;
    const progressSum = students.reduce((sum, s) => sum + (s.progress || 0), 0);
    const avgProgress = students.length > 0 ? Math.round(progressSum / students.length) : 0;

    return {
      classesCount,
      totalDocumentsCount,
      uniqueStudents,
      avgProgress
    };
  }, [courses, students]);

  if (role === 'student') {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] p-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <h1 className="text-4xl font-black uppercase tracking-tight">Welcome back, {professorName}!</h1>
          
          {isLoading ? (
            <div className="text-[#0A0A0A]/50 font-bold uppercase tracking-widest text-sm">Loading courses...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((cls) => (
                <div key={cls.id} className="bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[6px_6px_0_#0A0A0A] flex flex-col hover:-translate-y-1 hover:shadow-[8px_8px_0_#0A0A0A] transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-black uppercase tracking-tight">{cls.title}</h3>
                    <MoreVertical size={20} className="text-[#0A0A0A]/40 cursor-pointer hover:text-[#0A0A0A]" />
                  </div>
                  
                  <p className="text-sm font-bold font-['Inter'] text-[#0A0A0A]/70 mb-6 flex-1">
                    {cls.description || 'No description provided'}
                  </p>
                  
                  <div className="space-y-3 mt-auto">
                    <button 
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#FFD166] text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-black shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all uppercase text-sm tracking-wider"
                      onClick={() => navigate(`/student/courses/${cls.id}`)}
                    >
                      <span>Course Material</span>
                      <ChevronRight size={18} className="stroke-[3px]" />
                    </button>
                    <button 
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#118AB2] text-white border-2 border-[#0A0A0A] rounded-xl font-black shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all uppercase text-sm tracking-wider"
                      onClick={() => navigate(`/student/courses/${cls.id}/study`)}
                    >
                      <span>Study Mode</span>
                      <ChevronRight size={18} className="stroke-[3px]" />
                    </button>
                  </div>
                </div>
              ))}
              
              <div 
                className="bg-[#06D6A0]/10 border-[3px] border-dashed border-[#0A0A0A]/30 rounded-2xl p-6 flex flex-col justify-center items-center cursor-pointer hover:border-[#0A0A0A] hover:bg-[#06D6A0]/20 transition-colors group"
                onClick={() => setShowModal(true)}
              >
                <div className="w-16 h-16 bg-white border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mb-4 shadow-[4px_4px_0_#0A0A0A] group-hover:scale-110 transition-transform">
                  <Plus size={32} className="text-[#0A0A0A] stroke-[3px]" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-[#0A0A0A] mb-2">Join a class</h3>
                <p className="text-sm font-bold text-[#0A0A0A]/50 uppercase tracking-widest text-center">Enroll using a code</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] p-6 lg:p-8">
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* LEFT COLUMN: Main dashboard */}
        <div className="lg:col-span-3 space-y-8">
          <div className="flex justify-between items-center bg-white border-[3px] border-[#0A0A0A] p-6 rounded-2xl shadow-[6px_6px_0_#0A0A0A]">
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tight">Overview Dashboard</h1>
            </div>
            <button 
              onClick={() => setShowModal(true)} 
              className="flex items-center gap-2 px-6 py-3 bg-[#FF4D5B] text-white border-[3px] border-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-sm shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
            >
              <Plus size={20} className="stroke-[3px]" />
              <span>New Class</span>
            </button>
          </div>

          {/* Welcome Banner Card (Premium Professor View) */}
          <div className="bg-[#118AB2] border-[3px] border-[#0A0A0A] rounded-3xl p-8 lg:p-10 shadow-[8px_8px_0_#0A0A0A] flex flex-col md:flex-row justify-between items-center relative overflow-hidden group">
            <div className="relative z-10 space-y-4 max-w-lg">
              <h2 className="text-4xl font-black text-white uppercase tracking-tight">Welcome back, {professorName}!</h2>
              <p className="text-lg font-bold font-['Inter'] text-white/90">
                You have {stats.classesCount} active classes and {stats.totalDocumentsCount} study materials uploaded for your AI to learn.
              </p>
              <button 
                onClick={() => navigate('/professor/classes')} 
                className="mt-6 flex items-center gap-3 px-6 py-3 bg-white text-[#0A0A0A] border-[3px] border-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-sm shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all w-fit"
              >
                <span>Manage Classes & Materials</span>
                <ArrowRight size={18} className="stroke-[3px]" />
              </button>
            </div>
            <div className="absolute right-0 bottom-0 md:static mt-8 md:mt-0 opacity-20 md:opacity-100 transform translate-x-1/4 translate-y-1/4 md:translate-x-0 md:translate-y-0">
              <Sparkles className="w-48 h-48 text-[#FFD166] group-hover:rotate-12 transition-transform duration-500 stroke-1" />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div 
              onClick={() => navigate('/professor/classes')}
              className="bg-[#06D6A0] border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] transition-all cursor-pointer flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[2px_2px_0_#0A0A0A]">
                  <BookOpen size={24} className="text-[#0A0A0A] stroke-[2.5px]" />
                </div>
              </div>
              <div className="space-y-1 mb-6 mt-auto">
                <h3 className="text-4xl font-black text-[#0A0A0A]">{stats.classesCount}</h3>
                <span className="text-sm font-black uppercase tracking-widest text-[#0A0A0A]/80">My Classes</span>
              </div>
              <div className="flex items-center justify-between text-[#0A0A0A] font-bold text-sm uppercase tracking-wider border-t-[3px] border-[#0A0A0A]/20 pt-3">
                <span>View Roster</span>
                <ArrowRight size={16} className="stroke-[3px]" />
              </div>
            </div>

            <div 
              onClick={() => navigate('/professor/classes')}
              className="bg-[#FFD166] border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] transition-all cursor-pointer flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[2px_2px_0_#0A0A0A]">
                  <FolderOpen size={24} className="text-[#0A0A0A] stroke-[2.5px]" />
                </div>
              </div>
              <div className="space-y-1 mb-6 mt-auto">
                <h3 className="text-4xl font-black text-[#0A0A0A]">{stats.totalDocumentsCount}</h3>
                <span className="text-sm font-black uppercase tracking-widest text-[#0A0A0A]/80">Documents</span>
              </div>
              <div className="flex items-center justify-between text-[#0A0A0A] font-bold text-sm uppercase tracking-wider border-t-[3px] border-[#0A0A0A]/20 pt-3">
                <span>Manage</span>
                <ArrowRight size={16} className="stroke-[3px]" />
              </div>
            </div>

            <div 
              onClick={() => navigate('/professor/classes?tab=students')}
              className="bg-[#EF476F] border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] transition-all cursor-pointer flex flex-col text-white"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[2px_2px_0_#0A0A0A]">
                  <Users size={24} className="text-[#0A0A0A] stroke-[2.5px]" />
                </div>
              </div>
              <div className="space-y-1 mb-6 mt-auto">
                <h3 className="text-4xl font-black text-white">{stats.uniqueStudents}</h3>
                <span className="text-sm font-black uppercase tracking-widest text-white/90">Students</span>
              </div>
              <div className="flex items-center justify-between text-white font-bold text-sm uppercase tracking-wider border-t-[3px] border-white/30 pt-3">
                <span>View All</span>
                <ArrowRight size={16} className="stroke-[3px]" />
              </div>
            </div>

            <div 
              onClick={() => navigate('/professor/classes')}
              className="bg-purple-400 border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] transition-all cursor-pointer flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[2px_2px_0_#0A0A0A]">
                  <Award size={24} className="text-[#0A0A0A] stroke-[2.5px]" />
                </div>
              </div>
              <div className="space-y-1 mb-6 mt-auto">
                <h3 className="text-4xl font-black text-[#0A0A0A]">{stats.avgProgress}%</h3>
                <span className="text-sm font-black uppercase tracking-widest text-[#0A0A0A]/80">Avg Progress</span>
              </div>
              <div className="flex items-center justify-between text-[#0A0A0A] font-bold text-sm uppercase tracking-wider border-t-[3px] border-[#0A0A0A]/20 pt-3">
                <span>Reports</span>
                <ArrowRight size={16} className="stroke-[3px]" />
              </div>
            </div>
          </div>

          {/* Widgets section */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            
            {/* Recent Documents */}
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A] flex flex-col">
              <div className="flex justify-between items-center mb-6 pb-4 border-b-[3px] border-[#0A0A0A]/10">
                <h4 className="text-2xl font-black uppercase tracking-tight">Recent Documents</h4>
                <button 
                  onClick={() => navigate('/professor/classes')} 
                  className="px-4 py-2 bg-[#0A0A0A] text-white rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-[#333] transition-colors"
                >
                  View All
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="h-full flex items-center justify-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Loading documents...</div>
                ) : recentDocuments.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-[#0A0A0A]/50 space-y-4">
                    <FolderOpen size={48} className="stroke-[1.5px]" />
                    <p className="font-bold uppercase tracking-widest text-center">No documents uploaded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentDocuments.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-4 bg-gray-50 border-2 border-[#0A0A0A] rounded-xl hover:bg-[#FFD166]/20 transition-colors">
                        <div>
                          <h5 className="font-black text-lg text-[#0A0A0A] truncate max-w-[200px] sm:max-w-xs">{item.name}</h5>
                          <span className="text-xs font-bold uppercase tracking-widest text-[#0A0A0A]/50">{item.courseCode || item.courseTitle}</span>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <span className={`px-2 py-1 text-[10px] font-black uppercase tracking-widest rounded border-2 border-[#0A0A0A] ${item.status === 'processed' ? 'bg-[#06D6A0] text-[#0A0A0A]' : 'bg-amber-300 text-[#0A0A0A]'}`}>
                            {item.status || 'pending'}
                          </span>
                          <span className="text-xs font-bold text-[#0A0A0A]/50">
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI & Student Insights */}
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A] flex flex-col">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 pb-4 border-b-[3px] border-[#0A0A0A]/10">
                <h4 className="text-2xl font-black uppercase tracking-tight">AI & Student Insights</h4>
                <div className="flex gap-2">
                  <button 
                    className={`px-3 py-1.5 border-2 border-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeInsightTab === 'kg' ? 'bg-[#FF4D5B] text-white shadow-[2px_2px_0_#0A0A0A]' : 'bg-gray-100 text-[#0A0A0A]/50 hover:bg-gray-200 shadow-none'}`}
                    onClick={() => setActiveInsightTab('kg')}
                  >
                    Knowledge Graph
                  </button>
                  <button 
                    className={`px-3 py-1.5 border-2 border-[#0A0A0A] rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeInsightTab === 'intent' ? 'bg-[#118AB2] text-white shadow-[2px_2px_0_#0A0A0A]' : 'bg-gray-100 text-[#0A0A0A]/50 hover:bg-gray-200 shadow-none'}`}
                    onClick={() => setActiveInsightTab('intent')}
                  >
                    Interactions
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-[300px] border-[3px] border-[#0A0A0A] rounded-xl bg-gray-50/50 overflow-hidden relative p-2">
                {isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Loading insights...</div>
                ) : activeInsightTab === 'kg' ? (
                  <div className="absolute inset-0">
                    <KnowledgeGraphViewer data={analyticsData?.content?.knowledge_graph} />
                  </div>
                ) : (
                  <div className="absolute inset-0">
                    <IntentRadar data={analyticsData?.engagement?.intent_radar || []} />
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN: AI Brain Status & Quick Actions */}
        <aside className="space-y-8">
          
          {/* AI Brain Status widget */}
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <h4 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                <Sparkles size={24} className="text-[#FF4D5B] fill-[#FF4D5B]" />
                <span>AI Brains</span>
              </h4>
              <span className="px-2 py-1 bg-[#0A0A0A] text-white text-[10px] font-black uppercase tracking-widest rounded border-2 border-[#0A0A0A]">
                {courses.length} Active
              </span>
            </div>

            {courses.length === 0 ? (
              <div className="text-center py-8 space-y-4">
                <Sparkles size={48} className="mx-auto text-[#0A0A0A]/20" />
                <p className="font-bold text-sm text-[#0A0A0A]/50 uppercase tracking-widest">No AI Brains active.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {courses.map((c) => {
                  const status = courseGraphStatuses[c.id] || 'no_documents';
                  let statusLabel = 'No Materials';
                  let statusClass = 'bg-gray-100 text-[#0A0A0A]/50 border-gray-300';
                  
                  if (status === 'ready') {
                    statusLabel = 'AI Trained';
                    statusClass = 'bg-[#06D6A0] text-[#0A0A0A] border-[#0A0A0A]';
                  } else if (status === 'processing') {
                    statusLabel = 'Training...';
                    statusClass = 'bg-[#FFD166] text-[#0A0A0A] border-[#0A0A0A] animate-pulse';
                  } else if (c.docs_count > 0) {
                    statusLabel = 'Ready to Train';
                    statusClass = 'bg-[#FFD166] text-[#0A0A0A] border-[#0A0A0A]';
                  }

                  return (
                    <div 
                      key={c.id} 
                      className="flex items-center justify-between p-3 border-2 border-[#0A0A0A] rounded-xl hover:bg-gray-50 cursor-pointer group transition-colors"
                      onClick={() => navigate(`/professor/courses/${c.id}`)}
                    >
                      <div className="truncate pr-4">
                        <h5 className="font-black text-sm uppercase tracking-tight">{c.code}</h5>
                        <p className="text-[11px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest truncate max-w-[120px]">{c.title}</p>
                      </div>
                      <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest border-2 rounded ${statusClass} whitespace-nowrap`}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions widget */}
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A]">
            <div className="mb-6 pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <h4 className="text-xl font-black uppercase tracking-tight">Quick Actions</h4>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => navigate('/professor/classes')}
                className="w-full flex items-center gap-4 p-4 bg-white border-[3px] border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all group"
              >
                <div className="w-10 h-10 bg-[#FFD166] border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center text-xl shrink-0">
                  📁
                </div>
                <div className="text-left flex-1">
                  <h5 className="font-black text-[15px] uppercase tracking-tight">Upload Materials</h5>
                  <p className="text-[11px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Add PDFs/notes</p>
                </div>
                <ChevronRight size={20} className="stroke-[3px] text-[#0A0A0A]/30 group-hover:text-[#0A0A0A]" />
              </button>

              <button 
                onClick={() => navigate('/professor/assignments')}
                className="w-full flex items-center gap-4 p-4 bg-white border-[3px] border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all group"
              >
                <div className="w-10 h-10 bg-[#EF476F] border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center text-xl shrink-0">
                  📝
                </div>
                <div className="text-left flex-1">
                  <h5 className="font-black text-[15px] uppercase tracking-tight">Create Assignment</h5>
                  <p className="text-[11px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Set up tests</p>
                </div>
                <ChevronRight size={20} className="stroke-[3px] text-[#0A0A0A]/30 group-hover:text-[#0A0A0A]" />
              </button>

              <button 
                onClick={() => navigate('/professor/classes?tab=students')}
                className="w-full flex items-center gap-4 p-4 bg-white border-[3px] border-[#0A0A0A] rounded-xl shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all group"
              >
                <div className="w-10 h-10 bg-[#118AB2] border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center text-xl shrink-0">
                  👥
                </div>
                <div className="text-left flex-1">
                  <h5 className="font-black text-[15px] uppercase tracking-tight">Student Roster</h5>
                  <p className="text-[11px] font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Manage enrolled</p>
                </div>
                <ChevronRight size={20} className="stroke-[3px] text-[#0A0A0A]/30 group-hover:text-[#0A0A0A]" />
              </button>
            </div>
          </div>

        </aside>

      </div>

      {/* CREATE CLASS MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[4px] border-[#0A0A0A] rounded-3xl p-8 max-w-md w-full shadow-[12px_12px_0_#0A0A0A]">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Create New Class</h2>
            <form onSubmit={handleCreateCourse} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-black uppercase tracking-widest">Class Title</label>
                <input
                  autoFocus
                  className="w-full px-4 py-3 bg-white border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:ring-4 focus:ring-[#FF4D5B]/20"
                  placeholder="e.g. Mathematics - Grade 10"
                  value={courseTitle}
                  onChange={e => setCourseTitle(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-black uppercase tracking-widest">Department Code</label>
                <input
                  className="w-full px-4 py-3 bg-white border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:ring-4 focus:ring-[#FF4D5B]/20"
                  placeholder="e.g. MATH-101"
                  value={courseCode}
                  onChange={e => setCourseCode(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-black uppercase tracking-widest">Description</label>
                <input
                  className="w-full px-4 py-3 bg-white border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:ring-4 focus:ring-[#FF4D5B]/20"
                  placeholder="e.g. Quadratic Equations, Trigonometry"
                  value={courseDesc}
                  onChange={e => setCourseDesc(e.target.value)}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="flex-1 py-3 px-4 bg-white border-[3px] border-[#0A0A0A] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 px-4 bg-[#FF4D5B] border-[3px] border-[#0A0A0A] text-white rounded-xl font-black uppercase tracking-widest shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
