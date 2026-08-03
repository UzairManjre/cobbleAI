import { useAuthStore } from '../../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { coursesApi, documentsApi, graphsApi } from '../../api';
import { useGraphStore } from '../../store/graphStore';
import { useToastStore } from '../../store/toastStore';
import { ArrowLeft, Upload, Sparkles, FileText, Trash2, Loader2, BookOpen, Users, Flag, Map, Calendar, Zap, LayoutDashboard } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface GenerationProgress {
  step: number;
  totalSteps: number;
  message: string;
  detail: string;
  elapsed: number;
}

const STEP_LABELS = [
  'Processing documents',
  'Fetching documents',
  'Extracting text',
  'Analyzing content',
  'Merging graphs',
  'Enriching connections',
  'Finalizing graph',
];

const STEP_ICONS = ['📄', '📂', '📝', '🧠', '🔗', '✨', '✅'];

export default function CourseDetail() {
  const { courseId } = useParams();
  const { token, role } = useAuthStore();
  const navigate = useNavigate();
  const addToast = useToastStore(state => state.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);

  // Graph generation progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ nodes_count: number; edges_count: number; elapsed: number } | null>(null);
  const eventSourceRef = useRef<AbortController | null>(null);

  const {
    nodes: graphNodes,
    edges: graphEdges,
    fetchCourseGraph
  } = useGraphStore();

  useEffect(() => {
    if (courseId) {
      fetchCourseDetails();
      fetchDocuments();
      fetchCourseGraph(courseId);
      if (role === 'professor') {
        fetchStudents();
      }
    }
  }, [courseId, token]);

  useEffect(() => {
    const hasPendingDocs = documents.some(doc => doc.status === 'pending' || doc.status === 'processing');
    if (!hasPendingDocs || !courseId || !token) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, courseId, token]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.abort();
      }
    };
  }, []);

  const fetchCourseDetails = async () => {
    try {
      const res = await coursesApi.list();
      const current = res.data.find((c: any) => c.id === courseId);
      setCourse(current);
      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const res = await coursesApi.getProfessorStudents();
      const courseStudents = (res.data || []).filter((s: any) => s.course_id === courseId);
      setStudents(courseStudents);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    }
  };

  const fetchDocuments = async () => {
    if (!token) return;

    try {
      const res = await documentsApi.list(courseId || '');
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !token) return;

    setIsUploading(true);
    try {
      await documentsApi.upload(courseId || '', files);
      fetchDocuments();
    } catch (err: any) {
      console.error('Upload error:', err);
      addToast(err.response?.data?.detail || 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      await documentsApi.delete(docId);
      fetchDocuments();
    } catch (err) {
      console.error('Failed to delete document', err);
      addToast('Failed to delete document', 'error');
    }
  };

  const generateInvite = async () => {
    try {
      const res = await coursesApi.createInvite(courseId || '');
      setInviteCode(res.data.code);
    } catch (err) {
      addToast('Failed to generate invite', 'error');
    }
  };

  const generateGraph = () => {
    if (!courseId || !token) return;

    let userId = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub || '';
    } catch {
      console.error('Failed to decode JWT for user_id');
      return;
    }

    setIsGenerating(true);
    setProgress(null);
    setGenError(null);
    setGenResult(null);

    if (eventSourceRef.current) {
      eventSourceRef.current.abort();
    }

    const ctrl = new AbortController();
    eventSourceRef.current = ctrl;

    let isComplete = false;

    graphsApi.generateFromDocsStream(
      courseId, 
      userId, 
      token, 
      ctrl,
      (e) => {
        if (e.event === 'progress') {
          try {
            const data = JSON.parse(e.data);
            setProgress(data);
          } catch (err) {
            console.error('Failed to parse progress event:', err);
          }
        } else if (e.event === 'complete') {
          isComplete = true;
          try {
            const data = JSON.parse(e.data);
            setGenResult({
              nodes_count: data.nodes_count,
              edges_count: data.edges_count,
              elapsed: data.elapsed,
            });
            fetchCourseGraph(courseId).catch(err => console.error(err));
          } catch (err) {
            console.error('Failed to parse complete event:', err);
          }
        } else if (e.event === 'error') {
          if (isComplete) return;
          try {
            const data = JSON.parse(e.data);
            setGenError(data.message || 'Graph generation failed');
          } catch {
            setGenError('Graph generation failed');
          }
          if (eventSourceRef.current) {
            eventSourceRef.current.abort();
            eventSourceRef.current = null;
          }
          setIsGenerating(false);
        }
      },
      (err) => {
        if (isComplete) return;
        setGenError('Connection lost during graph generation. The graph may still be generating — please refresh in a minute.');
        eventSourceRef.current = null;
        setIsGenerating(false);
      },
      async () => {
        isComplete = true;
        try {
          // fetch latest on complete
          await fetchCourseGraph(courseId);
          setGenResult({
            nodes_count: 0,
            edges_count: 0,
            elapsed: 0
          });
        } catch (err) {
          console.error('Failed on complete:', err);
        }
        eventSourceRef.current = null;
        setIsGenerating(false);
      }
    );
  };

  const dismissOverlay = () => {
    setIsGenerating(false);
    setProgress(null);
    setGenError(null);
    setGenResult(null);
  };

  const cleanupDuplicates = async () => {
    if (!token) return;
    if (!confirm('This will remove duplicate documents. Continue?')) return;

    try {
      const res = await documentsApi.cleanupDuplicates();
      addToast(res.data.message, 'success');
      fetchDocuments();
    } catch (err: any) {
      console.error('Cleanup error:', err);
      addToast('Cleanup failed', 'error');
    }
  };

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}m ${sec}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#888888]" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-black text-white p-8 flex flex-col items-center justify-center space-y-6">
        <h2 className="text-3xl font-outfit font-light tracking-tight text-white">Course not found</h2>
        <Button
          onClick={() => navigate(role === 'professor' ? '/professor/dashboard' : '/student/dashboard')}
          variant="outline"
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </Button>
      </div>
    );
  }

  const progressPct = progress ? Math.round(((progress.step) / progress.totalSteps) * 100) : 0;

  return (
    <div className="min-h-screen bg-black text-white p-8 lg:p-12 relative overflow-hidden">

      {/* Graph Generation Progress Overlay */}
      {(isGenerating || genResult || genError) && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={dismissOverlay} />

          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-8 max-w-lg w-full relative z-10 shadow-2xl space-y-6">

            {/* Header */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-outfit font-medium tracking-tight text-white">
                {genResult ? 'Knowledge Graph Ready' : genError ? 'Generation Failed' : 'Building Knowledge Graph'}
              </h2>
              {!genResult && !genError && (
                <p className="text-sm text-[#888888]">
                  This may take a few minutes depending on document size.
                </p>
              )}
            </div>

            {/* Progress Content */}
            {!genResult && !genError && (
              <div className="space-y-6">
                <div>
                  <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden relative">
                    <div className="h-full bg-white transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="flex justify-between items-center text-xs mt-2 text-[#888888]">
                    <span>{progressPct}% Done</span>
                    {progress && (
                      <span className="flex items-center gap-1">
                        ⏱ {formatElapsed(progress.elapsed)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {STEP_LABELS.map((label, i) => {
                    const stepNum = i;
                    const currentStep = progress?.step ?? -1;
                    const isActive = currentStep === stepNum;
                    const isDone = currentStep > stepNum;

                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-3 rounded-lg transition-all ${isActive ? 'bg-[#111111]' : isDone ? 'opacity-50' : 'opacity-30'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm">
                            {isDone ? '✓' : STEP_ICONS[i]}
                          </span>
                          <div className="text-sm text-white">
                            <span>{label}</span>
                            {isActive && progress?.detail && (
                              <p className="text-xs text-[#888888] mt-0.5">{progress.detail}</p>
                            )}
                          </div>
                        </div>
                        {isActive && (
                          <Loader2 className="w-4 h-4 animate-spin text-[#888888]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Success Result */}
            {genResult && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 border border-[#1A1A1A] rounded-xl bg-[#050505] text-center">
                    <span className="block text-2xl font-light text-white mb-1">{genResult.nodes_count}</span>
                    <span className="text-[10px] uppercase tracking-widest text-[#888888]">Concepts</span>
                  </div>
                  <div className="p-4 border border-[#1A1A1A] rounded-xl bg-[#050505] text-center">
                    <span className="block text-2xl font-light text-white mb-1">{genResult.edges_count}</span>
                    <span className="text-[10px] uppercase tracking-widest text-[#888888]">Links</span>
                  </div>
                  <div className="p-4 border border-[#1A1A1A] rounded-xl bg-[#050505] text-center">
                    <span className="block text-2xl font-light text-white mb-1">{formatElapsed(genResult.elapsed)}</span>
                    <span className="text-[10px] uppercase tracking-widest text-[#888888]">Time</span>
                  </div>
                </div>

                <Button
                  onClick={() => {
                    dismissOverlay();
                    navigate(`/${role}/courses/${courseId}/map`);
                  }}
                  variant="primary"
                  className="w-full"
                >
                  <Sparkles size={16} />
                  <span>View Knowledge Graph</span>
                </Button>
              </div>
            )}

            {/* Error */}
            {genError && (
              <div className="space-y-4">
                <div className="p-4 border border-[#331111] bg-[#1A0505] text-[#FF4444] text-sm rounded-lg">
                  {genError}
                </div>
                <Button
                  onClick={dismissOverlay}
                  variant="outline"
                  className="w-full"
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-12 relative z-10">

        {/* Navigation & Header */}
        <div className="flex flex-col gap-6">
          <Button
            onClick={() => navigate(role === 'professor' ? '/professor/dashboard' : '/student/dashboard')}
            variant="ghost"
            className="w-fit -ml-4"
          >
            <ArrowLeft size={16} />
            Back to Dashboard
          </Button>

          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-outfit font-light text-white tracking-tight">
                {course.title}
              </h1>
              <div className="flex items-center gap-3 mt-3 text-sm font-medium">
                <span className="text-blue-500 uppercase tracking-widest text-[10px]">
                  {course.code}
                </span>
                <span className="text-[#333333]">•</span>
                <span className="text-[#888888]">
                  {role === 'professor' ? 'Professor Hub' : 'Student Study Center'}
                </span>
              </div>
            </div>

            {role === 'professor' && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={cleanupDuplicates}
                  variant="outline"
                >
                  Clean Duplicates
                </Button>
                <Button
                  onClick={generateGraph}
                  disabled={isGenerating}
                  variant="primary"
                >
                  <Zap size={14} />
                  {isGenerating ? 'Generating...' : 'Regenerate Graph'}
                </Button>
              </div>
            )}
          </header>
        </div>

        {/* Feature Navigation Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {role === 'professor' && (
            <div
              onClick={() => navigate(`/professor/courses/${courseId}/tests`)}
              className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
            >
              <LayoutDashboard className="w-6 h-6 text-[#888888] group-hover:text-white mb-3 transition-colors" />
              <span className="text-sm font-medium text-white">Manage Tests</span>
            </div>
          )}

          <div
            onClick={() => navigate(`/${role}/courses/${courseId}/map`)}
            className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
          >
            <Map className="w-6 h-6 text-[#888888] group-hover:text-blue-500 mb-3 transition-colors" />
            <span className="text-sm font-medium text-white">Visual Map</span>
          </div>

          <div
            onClick={() => navigate(`/${role}/courses/${courseId}/plan`)}
            className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
          >
            <Calendar className="w-6 h-6 text-[#888888] group-hover:text-purple-500 mb-3 transition-colors" />
            <span className="text-sm font-medium text-white">Study Plan</span>
          </div>

          <div
            onClick={() => navigate(`/${role}/courses/${courseId}/study`)}
            className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-white rounded-2xl p-5 cursor-pointer transition-all group flex flex-col items-center text-center justify-center min-h-[120px] md:col-span-2 lg:col-span-1"
          >
            <BookOpen className="w-6 h-6 text-white group-hover:scale-110 mb-3 transition-transform" />
            <span className="text-sm font-medium text-white">Enter Study Mode</span>
          </div>
        </div>

        {/* Main Split Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Learning Materials */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-[#1A1A1A]">
                <h3 className="text-lg font-outfit font-medium text-white">Learning Materials</h3>

                {role === 'professor' && (
                  <>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleUpload}
                      className="hidden"
                      accept=".pdf,.docx,.pptx"
                      multiple
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      variant="outline"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload size={14} />}
                      <span>{isUploading ? 'Uploading...' : 'Upload Files'}</span>
                    </Button>
                  </>
                )}
              </div>

              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id || doc._id} className="flex items-center justify-between p-4 rounded-xl hover:bg-[#111111] transition-colors border border-transparent hover:border-[#1A1A1A] group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#111111] border border-[#333333] rounded-lg flex items-center justify-center text-[10px] font-bold text-[#888888]">
                        {doc.filename.split('.').pop()?.toUpperCase() || 'DOC'}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-white truncate max-w-[200px] md:max-w-md">{doc.filename}</h4>
                        <p className="text-[10px] text-[#888888] mt-1">Added {new Date(doc.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${doc.status === 'processed' || doc.status === 'completed'
                          ? 'text-blue-500 border-blue-500/30'
                          : doc.status === 'processing'
                            ? 'text-purple-500 border-purple-500/30 animate-pulse'
                            : 'text-orange-500 border-orange-500/30'
                        }`}>
                        {doc.status}
                      </span>
                      {role === 'professor' && (
                        <button
                          onClick={() => handleDeleteDocument(doc.id || doc._id)}
                          className="p-1.5 text-[#888888] hover:text-[#FF4444] transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete document"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {documents.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-[#888888]">
                    <FileText size={32} className="mb-3 opacity-50" />
                    <p className="text-sm font-medium text-white mb-1">No materials added</p>
                    {role === 'professor' && (
                      <span className="text-xs">Upload syllabus or lectures to build the AI map.</span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Column: Intelligence & Student Access */}
          <div className="space-y-6">

            {/* Course Intelligence */}
            <Card className="p-6">
              <h3 className="text-lg font-outfit font-medium text-white mb-6">Intelligence Status</h3>

              <div className="space-y-4 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-[#1A1A1A]">
                  <span className="text-[#888888]">Total Concepts</span>
                  <span className="font-medium text-white">{graphNodes.length || '--'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#1A1A1A]">
                  <span className="text-[#888888]">Connections</span>
                  <span className="font-medium text-white">{graphEdges.length || '--'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#1A1A1A]">
                  <span className="text-[#888888]">Documents</span>
                  <span className="font-medium text-white">{documents.length}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#888888]">Status</span>
                  <span className={`text-xs font-medium ${graphNodes.length > 0 ? 'text-blue-500' : 'text-orange-500'
                    }`}>
                    {graphNodes.length > 0 ? 'Map Optimized' : 'Map Required'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Student Access Card */}
            {role === 'professor' && (
              <Card className="p-6">
                <h3 className="text-lg font-outfit font-medium text-white mb-4">Student Access</h3>

                <p className="text-xs text-[#888888] mb-6">
                  Provide this code to your students to grant them full access to this course's AI materials.
                </p>

                {inviteCode ? (
                  <div className="p-4 bg-[#111111] border border-[#333333] text-white font-medium text-xl text-center rounded-lg tracking-widest">
                    {inviteCode}
                  </div>
                ) : (
                  <Button
                    onClick={generateInvite}
                    variant="primary"
                    className="w-full"
                  >
                    Generate Invite Code
                  </Button>
                )}
              </Card>
            )}

            {/* Enrolled Students Card */}
            {role === 'professor' && (
              <Card className="p-6">
                <h3 className="text-lg font-outfit font-medium text-white mb-6">Enrolled Students</h3>
                <div className="space-y-4">
                  {students.length === 0 ? (
                    <div className="py-6 flex flex-col items-center justify-center text-[#888888] text-center">
                      <Users size={24} className="mb-2 opacity-50" />
                      <p className="text-sm font-medium text-white mb-1">No students yet</p>
                      <span className="text-xs">Share the invite code above.</span>
                    </div>
                  ) : (
                    students.map((student) => (
                      <div key={student.id} className="flex items-center justify-between p-3 rounded-lg bg-[#111111] border border-[#1A1A1A]">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#333333] flex items-center justify-center text-[#888888] text-xs font-medium shrink-0">
                            {(student.name || student.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div className="overflow-hidden">
                            <span className="block font-medium text-sm text-white truncate">{student.name || student.email || "Unknown Student"}</span>
                            <span className="block text-[10px] text-[#888888]">
                              Enrolled: {student.enrolled_at ? new Date(student.enrolled_at).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: 'numeric', minute: '2-digit', hour12: true
                              }) : 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`block text-[11px] font-medium px-2 py-0.5 rounded-full inline-block mb-1 ${student.flagIcon ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-[#1A1A1A] text-[#A3A3A3] border border-[#333333]'}`}>
                            {student.status}
                          </span>
                          <span className="block text-[10px] text-[#888888] font-medium">
                            {student.progress}% Completed
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
