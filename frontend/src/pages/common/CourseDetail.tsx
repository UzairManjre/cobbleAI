import { useAuthStore } from '../../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { coursesApi, documentsApi, graphsApi } from '../../api';
import { useGraphStore } from '../../store/graphStore';
import { useToastStore } from '../../store/toastStore';
import { ArrowLeft, Upload, FileText, Trash2, Loader2, BookOpen, Users, Map, Calendar, Zap, LayoutDashboard, PlayCircle, MessageSquare, BarChart3, ClipboardCheck } from 'lucide-react';
import TutorPolicyCard from '../../components/tutor/TutorPolicyCard';
import CourseFAQ from '../../components/insights/CourseFAQ';
import CourseSetupPanel from '../../components/course/CourseSetupPanel';
import { useCourseSetup } from '../../hooks/useCourseSetup';
import { STAGE_LABELS, isActiveBuild } from '../../utils/buildProgress';
import { apiErrorDetail } from '../../utils/apiError';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export default function CourseDetail() {
  const { courseId } = useParams();
  const { token, role } = useAuthStore();
  const navigate = useNavigate();
  const addToast = useToastStore(state => state.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);

  const {
    nodes: graphNodes,
    edges: graphEdges,
    fetchCourseGraph
  } = useGraphStore();

  // Course setup: file processing and the concept-map build, which runs in the background
  const isProfessor = role === 'professor';
  const setupRef = useRef<HTMLDivElement>(null);
  const [startingBuild, setStartingBuild] = useState(false);
  const [cancellingBuild, setCancellingBuild] = useState(false);
  const { setup, refresh: refreshSetup } = useCourseSetup(courseId, isProfessor, build => {
    if (build.status === 'complete' && courseId) {
      fetchCourseGraph(courseId);
      addToast(`Concept map ready: ${build.nodes_count} concepts, ${build.edges_count} connections`, 'success');
    } else if (build.status === 'failed') {
      addToast('The concept map build failed. See Course setup for details.', 'error');
    }
  });
  const building = isActiveBuild(setup?.build);

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
    setUploadProgress(0);
    try {
      await documentsApi.upload(courseId || '', files, setUploadProgress);
      fetchDocuments();
      refreshSetup();
    } catch (err: any) {
      console.error('Upload error:', err);
      // documentsApi.upload throws Error(detail) from the server response
      addToast(err.response?.data?.detail || err.message || 'Upload failed', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
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
      refreshSetup();
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

  const startBuild = async () => {
    if (!courseId) return;
    setStartingBuild(true);
    try {
      const res = await graphsApi.startBuild(courseId);
      addToast(res.data.created ? 'Map build started. Its progress is shown under Course setup.' : 'A map build is already running.', 'success');
      refreshSetup();
      setupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not start the map build'), 'error');
    } finally {
      setStartingBuild(false);
    }
  };

  const cancelBuild = async (buildId: string) => {
    setCancellingBuild(true);
    try {
      await graphsApi.cancelBuild(buildId);
      refreshSetup();
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not cancel the build'), 'error');
    } finally {
      setCancellingBuild(false);
    }
  };

  const cleanupDuplicates = async () => {
    if (!token) return;
    if (!confirm('This will remove duplicate documents. Continue?')) return;

    try {
      const res = await documentsApi.cleanupDuplicates(courseId!);
      addToast(res.data.message, 'success');
      fetchDocuments();
    } catch (err: any) {
      console.error('Cleanup error:', err);
      addToast('Cleanup failed', 'error');
    }
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

  const mapStatus = (() => {
    if (setup?.build && building) {
      return { label: setup.build.status === 'queued' ? 'Map build queued' : `Building map · ${setup.build.percent}%`, tone: 'text-purple-400' };
    }
    if (setup?.phase === 'processing') return { label: 'Processing files', tone: 'text-purple-400' };
    if (graphNodes.length > 0) {
      return setup?.materials_changed.length
        ? { label: 'Map out of date', tone: 'text-orange-500' }
        : { label: 'Map ready', tone: 'text-blue-500' };
    }
    return { label: 'Map required', tone: 'text-orange-500' };
  })();

  return (
    <div className="min-h-screen bg-black text-white p-8 lg:p-12 relative overflow-hidden">

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
                  onClick={startBuild}
                  disabled={building || startingBuild || !setup?.documents.ready}
                  variant="primary"
                  title={setup && !setup.documents.ready ? 'Upload files and wait for them to be processed first' : undefined}
                >
                  {building ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {building
                    ? (setup?.build?.status === 'queued' ? 'Map build queued' : `Building map · ${setup?.build?.percent ?? 0}%`)
                    : graphNodes.length > 0 ? 'Rebuild Map' : 'Build Map'}
                </Button>
              </div>
            )}
          </header>
        </div>

        {isProfessor && setup && (
          <div ref={setupRef} className="scroll-mt-8">
            <CourseSetupPanel
              setup={setup}
              starting={startingBuild}
              cancelling={cancellingBuild}
              onBuild={startBuild}
              onCancel={cancelBuild}
              onViewMap={() => navigate(`/professor/courses/${courseId}/map`)}
              onUpload={() => fileInputRef.current?.click()}
            />
          </div>
        )}

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

          {role === 'student' && (
            /* Study plans are personal to each student; there is no professor version */
            <div
              onClick={() => navigate(`/student/courses/${courseId}/plan`)}
              className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
            >
              <Calendar className="w-6 h-6 text-[#888888] group-hover:text-purple-500 mb-3 transition-colors" />
              <span className="text-sm font-medium text-white">Study Plan</span>
            </div>
          )}

          {role === 'student' && (
            <div
              onClick={() => navigate(`/student/chat?course=${courseId}`)}
              className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
            >
              <MessageSquare className="w-6 h-6 text-[#888888] group-hover:text-emerald-500 mb-3 transition-colors" />
              <span className="text-sm font-medium text-white">Ask the Course</span>
            </div>
          )}

          {role === 'professor' && (
            <div
              onClick={() => navigate(`/professor/courses/${courseId}/insights`)}
              className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
            >
              <BarChart3 className="w-6 h-6 text-[#888888] group-hover:text-emerald-500 mb-3 transition-colors" />
              <span className="text-sm font-medium text-white">Course Insights</span>
            </div>
          )}

          {role === 'professor' && (
            <div
              onClick={() => navigate(`/professor/courses/${courseId}/review`)}
              className="bg-[#0A0A0A] border border-[#1A1A1A] hover:border-[#333333] rounded-2xl p-5 cursor-pointer transition-colors group flex flex-col items-center text-center justify-center min-h-[120px]"
            >
              <ClipboardCheck className="w-6 h-6 text-[#888888] group-hover:text-emerald-500 mb-3 transition-colors" />
              <span className="text-sm font-medium text-white">Review AI Grades</span>
            </div>
          )}

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
                      accept=".pdf,.docx,.pptx,.mp4,.webm,.mov,.mp3,.m4a,.wav"
                      multiple
                    />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      variant="outline"
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload size={14} />}
                      <span>{isUploading ? `Uploading${uploadProgress !== null ? ` ${Math.round(uploadProgress * 100)}%` : '...'}` : 'Upload Files'}</span>
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
                        <p className="text-[10px] text-[#888888] mt-1">
                          {doc.media_type === 'lecture' ? 'Lecture recording · ' : ''}Added {new Date(doc.created_at).toLocaleDateString()}
                          {doc.status === 'processing' && doc.stage && (
                            <span className="ml-2 text-purple-400">{STAGE_LABELS[doc.stage] || doc.stage}{doc.progress ? ` ${Math.round(doc.progress * 100)}%` : ''}</span>
                          )}
                          {doc.status === 'pending' && <span className="ml-2 text-orange-400">Waiting in queue</span>}
                          {doc.status === 'failed' && doc.error_message && (
                            <span className="block mt-1 text-red-400 line-clamp-2">{doc.error_message}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {doc.media_type === 'lecture' && (doc.status === 'ready' || role === 'professor') && (
                        <button
                          onClick={() => navigate(`/${role}/courses/${courseId}/lectures/${doc.id || doc._id}`)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest rounded-full border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                          title="Open the lecture: video, transcript, chapters and lecture chat"
                        >
                          <PlayCircle size={12} /> Open
                        </button>
                      )}
                      <span title={doc.status === 'failed' ? doc.error_message || undefined : undefined} className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${doc.status === 'ready'
                          ? 'text-blue-500 border-blue-500/30'
                          : doc.status === 'processing'
                            ? 'text-purple-500 border-purple-500/30 animate-pulse'
                            : doc.status === 'failed'
                              ? 'text-red-500 border-red-500/30'
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
                      <span className="text-xs">Upload slides, notes or lecture recordings to build the AI map.</span>
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
                  <span className={`text-xs font-medium ${mapStatus.tone}`}>
                    {mapStatus.label}
                  </span>
                </div>
              </div>
            </Card>

            {role === 'professor' && courseId && <TutorPolicyCard courseId={courseId} />}
            {role === 'student' && courseId && <CourseFAQ courseId={courseId} />}

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
