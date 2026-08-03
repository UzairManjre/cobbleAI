import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  ArrowRight,
  BookOpen,
  Sparkles,
  MoreVertical,
  Loader2,
  Users,
  FolderOpen,
  Award,
  FileText
} from 'lucide-react';
import { coursesApi } from '../../api/courses';
import { documentsApi, graphsApi, authApi } from '../../api';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';

export default function Dashboard() {
  const { token, role } = useAuthStore();
  const addToast = useToastStore(state => state.addToast);
  const navigate = useNavigate();

  // Data State
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [professorName, setProfessorName] = useState('Professor');
  const [isLoading, setIsLoading] = useState(true);
  const [courseGraphStatuses, setCourseGraphStatuses] = useState<Record<string, string>>({});
  const [recentDocuments, setRecentDocuments] = useState<any[]>([]);

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
    
    try {
      const userRes = await authApi.getCurrentUser();
      if (userRes.data?.name) setProfessorName(userRes.data.name);
    } catch (err) {
      console.error('Error loading user:', err);
    }

    let activeCourses: any[] = [];
    try {
      const coursesRes = await coursesApi.list();
      activeCourses = coursesRes.data || [];
      setCourses(activeCourses);
    } catch (err) {
      console.error('Error loading courses:', err);
      setCourses([]);
    }

    if (role === 'professor') {
      try {
        const studentsRes = await coursesApi.getProfessorStudents();
        setStudents(studentsRes.data || []);
      } catch (err) {
        console.error('Error loading students:', err);
        setStudents([]);
      }
    }

    if (activeCourses.length > 0) {
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
        const statusMap = statuses.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.status }), {});
        setCourseGraphStatuses(statusMap);
      } catch (err) {
        console.error('Error fetching graph statuses:', err);
      }

      if (role === 'professor') {
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
      }
    } else {
      setCourseGraphStatuses({});
      setRecentDocuments([]);
    }

    setIsLoading(false);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (role === 'student') {
        await coursesApi.join(courseCode);
      } else {
        await coursesApi.create({ title: courseTitle, code: courseCode, description: courseDesc });
      }
      setShowModal(false);
      setCourseTitle('');
      setCourseCode('');
      setCourseDesc('');
      loadDashboardData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to create/join class', 'error');
    }
  };

  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good morning';
    if (hours < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const stats = useMemo(() => {
    const classesCount = courses.length;
    const totalDocumentsCount = courses.reduce((sum, c) => sum + (c.docs_count || 0), 0);
    const uniqueStudents = new Set(students.map(s => s.name)).size;
    const progressSum = students.reduce((sum, s) => sum + (s.progress || 0), 0);
    const avgProgress = students.length > 0 ? Math.round(progressSum / students.length) : 0;

    return { classesCount, totalDocumentsCount, uniqueStudents, avgProgress };
  }, [courses, students]);

  if (role === 'student') {
    return (
      <div className="min-h-screen bg-black text-white p-8 lg:p-12 relative overflow-hidden">
        <div className="max-w-6xl mx-auto space-y-12 relative z-10">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8">
            <div>
              <h1 className="text-4xl font-outfit font-light text-white tracking-tight">
                {greeting}, <span className="font-bold">{professorName}</span>
              </h1>
            </div>
            <Button variant="secondary" className="rounded-full" onClick={() => setShowModal(true)} leftIcon={<Plus size={16} />}>
              Join Class
            </Button>
          </header>

          {isLoading ? <div className="flex justify-center py-20 text-[#888888]"><Loader2 className="w-8 h-8 animate-spin" /></div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((cls) => (
                <Card key={cls.id} variant="hoverable" onClick={() => navigate(`/student/courses/${cls.id}`)}>
                  <CardContent className="flex flex-col h-full">
                    <span className="text-xs font-semibold text-blue-500 uppercase mb-2 block">{cls.code}</span>
                    <h3 className="text-xl font-medium text-white mb-6">{cls.title}</h3>
                    <div className="mt-auto pt-4 border-t border-[#1A1A1A] flex justify-between text-[#888888] group-hover:text-white transition-colors">
                      <span className="text-xs font-medium uppercase tracking-widest">Enter Course</span>
                      <ArrowRight size={16} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="p-8 max-w-md w-full">
              <h2 className="text-2xl font-light text-white mb-6">Join Class</h2>
              <form onSubmit={handleCreateCourse} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Invite Code</label>
                  <input className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888]" placeholder="e.g. ABCDEF" value={courseCode} onChange={e => setCourseCode(e.target.value)} required />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" className="flex-1">Join Class</Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8 lg:p-12 relative overflow-hidden">
      
      <div className="max-w-6xl mx-auto space-y-12 relative z-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
          <div>
            <h1 className="text-4xl font-outfit font-light text-white tracking-tight">
              {greeting}, <span className="font-medium">Professor {professorName.split(' ')[0]}</span>
            </h1>
            <p className="text-sm text-[#888888] mt-3 font-medium tracking-wide max-w-lg leading-relaxed">
              Welcome to your centralized intelligence hub. You have <span className="text-white font-medium">{stats.classesCount} active classes</span> training on your materials.
            </p>
          </div>
          <Button variant="primary" className="rounded-full" onClick={() => setShowModal(true)} leftIcon={<Plus size={16} />}>
            Create Class
          </Button>
        </header>

        {/* Top Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card variant="hoverable" className="p-5 flex flex-col justify-between h-32" onClick={() => navigate('/professor/classes')}>
            <div className="flex justify-between items-start text-[#888888]">
              <span className="text-xs font-semibold uppercase tracking-widest">Classes</span>
              <BookOpen size={18} />
            </div>
            <h3 className="text-3xl font-light text-white">{stats.classesCount}</h3>
          </Card>
          <Card className="p-5 flex flex-col justify-between h-32">
            <div className="flex justify-between items-start text-[#888888]">
              <span className="text-xs font-semibold uppercase tracking-widest">Documents</span>
              <FolderOpen size={18} />
            </div>
            <h3 className="text-3xl font-light text-white">{stats.totalDocumentsCount}</h3>
          </Card>
          <Card className="p-5 flex flex-col justify-between h-32">
            <div className="flex justify-between items-start text-[#888888]">
              <span className="text-xs font-semibold uppercase tracking-widest">Students</span>
              <Users size={18} />
            </div>
            <h3 className="text-3xl font-light text-white">{stats.uniqueStudents}</h3>
          </Card>
          <Card className="p-5 flex flex-col justify-between h-32">
            <div className="flex justify-between items-start text-[#888888]">
              <span className="text-xs font-semibold uppercase tracking-widest">Avg Progress</span>
              <Award size={18} />
            </div>
            <h3 className="text-3xl font-light text-white">{stats.avgProgress}%</h3>
          </Card>
        </div>

        {/* Main Grid: Classes (2/3) & Recent Activity (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Active Classes */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-outfit font-medium text-white tracking-tight">Active Environments</h2>
            
            {isLoading ? <div className="flex justify-center py-24 text-[#888888]"><Loader2 className="w-8 h-8 animate-spin" /></div> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {courses.map((c) => {
                  const status = courseGraphStatuses[c.id] || 'no_documents';
                  const courseStudents = students.filter(s => s.course_id === c.id).length;
                  let statusLabel = 'Setup Required';
                  let statusColor = 'text-[#888888] border-[#1A1A1A]';
                  
                  if (status === 'ready') { statusLabel = 'AI Ready'; statusColor = 'text-accent border-accent-border'; }
                  else if (status === 'processing') { statusLabel = 'Training AI...'; statusColor = 'text-purple-400 border-purple-500/30 animate-pulse'; }
                  else if (c.docs_count > 0) { statusLabel = 'Needs Training'; statusColor = 'text-amber-400 border-amber-500/30'; }

                  return (
                    <Card key={c.id} variant="hoverable" onClick={() => navigate(`/professor/courses/${c.id}`)}>
                      <CardContent>
                        <span className="text-[10px] font-bold text-[#888888] uppercase tracking-widest block mb-2">{c.code}</span>
                        <h3 className="text-xl font-medium text-white mb-6 group-hover:text-blue-500 transition-colors">{c.title}</h3>
                        <div className="flex items-center gap-4 mb-6 text-xs text-[#888888]">
                          <span className="flex items-center gap-1.5"><Users size={14} /> {courseStudents} Enrolled</span>
                          <span className="flex items-center gap-1.5"><BookOpen size={14} /> {c.docs_count || 0} Docs</span>
                        </div>
                        <div className="border-t border-[#1A1A1A] pt-4 flex justify-between items-center">
                          <span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${statusColor}`}>{statusLabel}</span>
                          <ArrowRight size={16} className="text-[#333333] group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Documents */}
          <div className="space-y-6">
            <h2 className="text-lg font-outfit font-medium text-white tracking-tight">Recent Documents</h2>
            
            <Card className="h-[calc(100%-3rem)] flex flex-col">
              <CardContent className="flex-1 flex flex-col">
                {recentDocuments.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#888888]">
                    <FileText size={32} className="mb-3 opacity-50" />
                    <p className="text-sm font-medium">No documents uploaded.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentDocuments.map((doc, index) => (
                      <div key={doc.id || doc._id || index} className="flex items-center gap-4 p-3 rounded-xl hover:bg-[#111111] cursor-pointer transition-colors -mx-3" onClick={() => navigate(`/professor/courses/${doc.courseId}`)}>
                        <div className="w-10 h-10 rounded-lg bg-[#1A1A1A] border border-[#333333] flex items-center justify-center text-[#888888]">
                          <FileText size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-white truncate">{doc.filename}</h4>
                          <p className="text-[10px] text-[#888888] uppercase tracking-widest mt-0.5">{doc.courseCode}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="p-8 max-w-md w-full">
            <h2 className="text-2xl font-light text-white mb-6">Create New Class</h2>
            <form onSubmit={handleCreateCourse} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Class Title</label>
                <input className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888]" placeholder="e.g. Intro to ML" value={courseTitle} onChange={e => setCourseTitle(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Department Code</label>
                <input className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888]" placeholder="e.g. CS-101" value={courseCode} onChange={e => setCourseCode(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Description</label>
                <textarea className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white h-24 focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888] resize-none" placeholder="Brief overview..." value={courseDesc} onChange={e => setCourseDesc(e.target.value)} />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" variant="primary" className="flex-1">Create Class</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
