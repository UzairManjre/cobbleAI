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
import './Dashboard.css';

export default function Dashboard() {
  const { token, role, logout } = useAuthStore();
  const navigate = useNavigate();

  // Data State
  const [courses, setCourses] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
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
      <div className="student-dashboard-grid animate-in fade-in duration-300 p-6">
        <div className="dashboard-main max-w-5xl mx-auto">
          <h1 className="welcome-title mb-6">Welcome back, {professorName}!</h1>
          
          {isLoading ? (
            <div style={{ color: 'var(--designer-text-secondary)' }}>Loading courses...</div>
          ) : (
            <div className="classes-grid">
              {courses.map((cls) => (
                <div key={cls.id} className="designer-card class-card">
                  <div className="class-card-header designer-flex designer-justify-between">
                    <h3>{cls.title}</h3>
                    <MoreVertical size={18} className="text-secondary" style={{cursor: 'pointer'}} />
                  </div>
                  
                  <p className="class-desc">{cls.description || 'No description provided'}</p>
                  
                  <div className="class-card-actions mt-4">
                    <div 
                      className="action-row designer-flex designer-justify-between designer-items-center"
                      onClick={() => navigate(`/student/courses/${cls.id}`)}
                    >
                      <span>View Course Material</span>
                      <ChevronRight size={16} />
                    </div>
                    <div 
                      className="action-row designer-flex designer-justify-between designer-items-center"
                      onClick={() => navigate(`/student/courses/${cls.id}/study`)}
                    >
                      <span>Enter Study Mode</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                </div>
              ))}
              
              <div 
                className="designer-card create-class-card designer-flex designer-flex-col designer-justify-center designer-items-center"
                onClick={() => setShowModal(true)}
              >
                <h3>Join a class</h3>
                <p className="desc">Enroll in a new course using a join code</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="professor-dashboard-grid animate-in fade-in duration-300">
      
      {/* LEFT COLUMN: Main dashboard */}
      <div className="dashboard-main">
        <div className="dashboard-welcome-row designer-flex designer-justify-between designer-items-center mb-6">
          <div>
            <h1 className="welcome-title">Overview Dashboard</h1>
          </div>
          <button onClick={() => setShowModal(true)} className="designer-btn designer-btn-primary add-class-btn shadow-sm">
            <Plus size={18} />
            <span>New Class</span>
          </button>
        </div>

        {/* Welcome Banner Card (Premium Professor View) */}
        <div className="welcome-banner-card mb-6">
          <div className="banner-text">
            <h2>Welcome back, {professorName}!</h2>
            <p>You have {stats.classesCount} active classes and {stats.totalDocumentsCount} study materials uploaded for your AI to learn.</p>
            <button 
              onClick={() => navigate('/professor/classes')} 
              className="banner-cta"
            >
              <span>Manage Classes & Materials</span>
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="banner-illustration">
            <div className="illustration-wrapper">
              <div className="blob blob-1"></div>
              <div className="blob blob-2"></div>
              <Sparkles className="banner-sparkle" size={32} />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="dashboard-stats-grid mb-6">
          <div 
            onClick={() => navigate('/professor/classes')}
            className="designer-card dashboard-stat-card classes hover-lift"
          >
            <div className="dashboard-stat-top">
              <div className="dashboard-stat-icon-wrapper classes-icon">
                <BookOpen size={22} />
              </div>
              <div className="dashboard-stat-data">
                <h3 className="dashboard-stat-value">{stats.classesCount}</h3>
                <span className="dashboard-stat-label">My Classes</span>
              </div>
            </div>
            <div className="dashboard-stat-footer classes">
              <span>View Classes Roster</span>
              <ArrowRight size={14} />
            </div>
          </div>

          <div 
            onClick={() => navigate('/professor/classes')}
            className="designer-card dashboard-stat-card docs hover-lift"
          >
            <div className="dashboard-stat-top">
              <div className="dashboard-stat-icon-wrapper docs-icon">
                <FolderOpen size={22} />
              </div>
              <div className="dashboard-stat-data">
                <h3 className="dashboard-stat-value">{stats.totalDocumentsCount}</h3>
                <span className="dashboard-stat-label">Total Documents</span>
              </div>
            </div>
            <div className="dashboard-stat-footer docs">
              <span>Manage Documents</span>
              <ArrowRight size={14} />
            </div>
          </div>

          <div 
            onClick={() => navigate('/professor/classes?tab=students')}
            className="designer-card dashboard-stat-card students hover-lift"
          >
            <div className="dashboard-stat-top">
              <div className="dashboard-stat-icon-wrapper students-icon">
                <Users size={22} />
              </div>
              <div className="dashboard-stat-data">
                <h3 className="dashboard-stat-value">{stats.uniqueStudents}</h3>
                <span className="dashboard-stat-label">Total Students</span>
              </div>
            </div>
            <div className="dashboard-stat-footer students">
              <span>View Students</span>
              <ArrowRight size={14} />
            </div>
          </div>

          <div 
            onClick={() => navigate('/professor/classes')}
            className="designer-card dashboard-stat-card progress hover-lift"
          >
            <div className="dashboard-stat-top">
              <div className="dashboard-stat-icon-wrapper progress-icon">
                <Award size={22} />
              </div>
              <div className="dashboard-stat-data">
                <h3 className="dashboard-stat-value">{stats.avgProgress}%</h3>
                <span className="dashboard-stat-label">Average Class Progress</span>
              </div>
            </div>
            <div className="dashboard-stat-footer progress">
              <span>View Progress Reports</span>
              <ArrowRight size={14} />
            </div>
          </div>
        </div>

        {/* Widgets section (Recent Documents & Class Overview side-by-side) */}
        <div className="widgets-container">
          
          {/* Recent Documents widget */}
          <div className="designer-card widget-card">
            <div className="widget-header designer-flex designer-justify-between designer-items-center mb-4">
              <h4>Recent Documents</h4>
              <button onClick={() => navigate('/professor/classes')} className="widget-header-link">
                View Classes
              </button>
            </div>
            
            {isLoading ? (
              <div className="widget-loading">Loading documents...</div>
            ) : recentDocuments.length === 0 ? (
              <div className="widget-empty">
                <FolderOpen size={32} />
                <p>No documents uploaded yet.</p>
                <button 
                  onClick={() => navigate('/professor/classes')} 
                  className="widget-empty-action"
                >
                  Upload one now
                </button>
              </div>
            ) : (
              <div className="recent-docs-list">
                {recentDocuments.map((item) => (
                  <div key={item.id} className="doc-item designer-flex designer-justify-between designer-items-center">
                    <div className="doc-info">
                      <h5>{item.name}</h5>
                      <span>{item.courseCode || item.courseTitle}</span>
                    </div>
                    <div className="doc-status text-right">
                      <span className={`doc-status-pill ${item.status || 'pending'}`}>
                        {item.status || 'pending'}
                      </span>
                      <p className="doc-date">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric'
                        }) : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI & Student Insights widget */}
          <div className="designer-card widget-card insights-card">
            <div className="widget-header designer-flex designer-justify-between designer-items-center mb-4">
              <h4>AI & Student Insights</h4>
              <div className="insights-tabs designer-flex gap-2">
                <button 
                  className={`insight-tab-btn ${activeInsightTab === 'kg' ? 'active' : ''}`}
                  onClick={() => setActiveInsightTab('kg')}
                >
                  Knowledge Graph
                </button>
                <button 
                  className={`insight-tab-btn ${activeInsightTab === 'intent' ? 'active' : ''}`}
                  onClick={() => setActiveInsightTab('intent')}
                >
                  Student Interactions
                </button>
              </div>
            </div>

            <div className="insight-chart-container">
              {isLoading ? (
                <div className="widget-loading">Loading insights...</div>
              ) : activeInsightTab === 'kg' ? (
                <KnowledgeGraphViewer data={analyticsData?.content?.knowledge_graph} />
              ) : (
                <IntentRadar data={analyticsData?.engagement?.intent_radar || []} />
              )}
            </div>
          </div>

        </div>
      </div>

      {/* RIGHT COLUMN: AI Brain Status & Quick Actions */}
      <aside className="dashboard-side">
        
        {/* AI Brain Status widget */}
        <div className="designer-card side-widget-card mb-6">
          <div className="side-widget-header designer-flex designer-justify-between designer-items-center mb-4">
            <h4 className="side-widget-title designer-flex designer-items-center gap-2">
              <Sparkles size={18} className="text-primary animate-pulse" />
              <span>AI Brain Status</span>
            </h4>
            <span className="overview-count">{courses.length} Brains</span>
          </div>

          {courses.length === 0 ? (
            <div className="widget-empty">
              <Sparkles size={32} />
              <p>No AI Brains active.</p>
              <span>Create a class and upload PDFs to begin training.</span>
            </div>
          ) : (
            <div className="ai-brains-list">
              {courses.map((c) => {
                const status = courseGraphStatuses[c.id] || 'no_documents';
                let statusLabel = 'No Materials';
                let statusClass = 'empty';
                
                if (status === 'ready') {
                  statusLabel = 'AI Trained';
                  statusClass = 'ready';
                } else if (status === 'processing') {
                  statusLabel = 'Training...';
                  statusClass = 'training';
                }

                return (
                  <div 
                    key={c.id} 
                    className="ai-brain-item hover-lift"
                    onClick={() => navigate(`/professor/courses/${c.id}`)}
                  >
                    <div className="brain-info">
                      <h5>{c.code}</h5>
                      <p>{c.title}</p>
                    </div>
                    <span className={`brain-status-badge ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Actions widget */}
        <div className="designer-card side-widget-card">
          <div className="side-widget-header mb-4">
            <h4 className="side-widget-title">Quick Actions</h4>
          </div>

          <div className="quick-actions-list">
            <button 
              onClick={() => navigate('/professor/classes')}
              className="quick-action-btn hover-lift"
            >
              <div className="btn-icon">📁</div>
              <div className="btn-text">
                <h5>Upload Materials</h5>
                <p>Add PDFs/notes to classes</p>
              </div>
              <ChevronRight size={16} />
            </button>

            <button 
              onClick={() => navigate('/professor/assignments')}
              className="quick-action-btn hover-lift"
            >
              <div className="btn-icon">📝</div>
              <div className="btn-text">
                <h5>Create Assignment</h5>
                <p>Set up tests & assignments</p>
              </div>
              <ChevronRight size={16} />
            </button>

            <button 
              onClick={() => navigate('/professor/classes?tab=students')}
              className="quick-action-btn hover-lift"
            >
              <div className="btn-icon">👥</div>
              <div className="btn-text">
                <h5>Student Roster</h5>
                <p>Manage enrolled students</p>
              </div>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </aside>

      {/* CREATE CLASS MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in zoom-in-95 duration-200">
            <h2 className="modal-title">Create New Class</h2>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div className="form-group">
                <label className="form-label">Class Title</label>
                <input
                  autoFocus
                  className="designer-search-input modal-input"
                  placeholder="e.g. Mathematics - Grade 10"
                  value={courseTitle}
                  onChange={e => setCourseTitle(e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label className="form-label">Department Code</label>
                <input
                  className="designer-search-input modal-input"
                  placeholder="e.g. MATH-101"
                  value={courseCode}
                  onChange={e => setCourseCode(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  className="designer-search-input modal-input"
                  placeholder="e.g. Quadratic Equations, Trigonometry"
                  value={courseDesc}
                  onChange={e => setCourseDesc(e.target.value)}
                />
              </div>



              <div className="modal-actions mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="designer-btn">
                  Cancel
                </button>
                <button type="submit" className="designer-btn designer-btn-primary">
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
