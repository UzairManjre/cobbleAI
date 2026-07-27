import { useAuthStore } from '../../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { coursesApi, documentsApi, graphsApi } from '../../api';
import { useGraphStore } from '../../store/graphStore';
import { ArrowLeft, Upload, Sparkles, FileText } from 'lucide-react';
import './CourseDetail.css';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Graph generation progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<{ nodes_count: number; edges_count: number; elapsed: number } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
    }
  }, [courseId, token]);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
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
      alert(err.response?.data?.detail || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const generateInvite = async () => {
    try {
      const res = await coursesApi.createInvite(courseId || '');
      setInviteCode(res.data.code);
    } catch (err) {
      alert('Failed to generate invite');
    }
  };

  const generateGraph = () => {
    if (!courseId || !token) return;

    // Extract user_id from JWT payload (base64 decode the middle segment)
    let userId = '';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub || '';
    } catch {
      console.error('Failed to decode JWT for user_id');
      return;
    }

    // Reset state
    setIsGenerating(true);
    setProgress(null);
    setGenError(null);
    setGenResult(null);

    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = graphsApi.generateFromDocsStream(courseId, userId);
    eventSourceRef.current = es;

    es.addEventListener('progress', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setProgress(data);
      } catch (err) {
        console.error('Failed to parse progress event:', err);
      }
    });

    es.addEventListener('complete', async (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setGenResult({
          nodes_count: data.nodes_count,
          edges_count: data.edges_count,
          elapsed: data.elapsed,
        });
        // Refresh graph data
        await fetchCourseGraph(courseId);
      } catch (err) {
        console.error('Failed to parse complete event:', err);
      }
      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener('error', (e: any) => {
      // Check if this is a custom error event from the server
      if (e.data) {
        try {
          const data = JSON.parse(e.data);
          setGenError(data.message || 'Graph generation failed');
        } catch {
          setGenError('Graph generation failed');
        }
      } else {
        // EventSource connection error
        setGenError('Connection lost during graph generation. The graph may still be generating — please refresh in a minute.');
      }
      es.close();
      eventSourceRef.current = null;
      setIsGenerating(false);
    });
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
      alert(res.data.message);
      fetchDocuments();
    } catch (err: any) {
      console.error('Cleanup error:', err);
      alert('Cleanup failed');
    }
  };

  // Helper: format elapsed time
  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}m ${sec}s`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-[4px] border-[#0A0A0A] border-t-transparent"></div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] p-8 flex flex-col items-center justify-center space-y-6">
        <h2 className="text-3xl font-black uppercase tracking-tight text-[#0A0A0A]">Course not found</h2>
        <button 
          onClick={() => navigate(role === 'professor' ? '/professor/dashboard' : '/student/dashboard')}
          className="px-6 py-3 border-[3px] border-[#0A0A0A] bg-white rounded-xl font-black uppercase shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>
    );
  }

  // Compute progress percentage
  const progressPct = progress
    ? Math.round(((progress.step) / progress.totalSteps) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] p-6 lg:p-8 space-y-8">
      {/* Graph Generation Progress Overlay */}
      {(isGenerating || genResult || genError) && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4">
          <div className="absolute inset-0 bg-[#111827]/40 backdrop-blur-md" onClick={dismissOverlay} />
          
          <div className="bg-white border-[4px] border-[#0A0A0A] rounded-3xl p-8 max-w-lg w-full relative z-10 shadow-[10px_10px_0_#0A0A0A] space-y-6">
            
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-[#FFD166] border-[3px] border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] flex items-center justify-center mx-auto text-3xl">
                {genResult ? '🎉' : genError ? '❌' : '🧠'}
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-[#0A0A0A] pt-2">
                {genResult ? 'Knowledge Graph Ready!' : genError ? 'Generation Failed' : 'Building Knowledge Graph'}
              </h2>
              {!genResult && !genError && (
                <p className="text-xs font-bold text-[#0A0A0A]/50 font-['Inter']">
                  This may take a few minutes depending on document size.
                </p>
              )}
            </div>

            {/* Progress Content */}
            {!genResult && !genError && (
              <div className="space-y-6">
                {/* Progress Bar */}
                <div>
                  <div className="h-6 bg-gray-100 border-[3px] border-[#0A0A0A] rounded-full overflow-hidden relative shadow-[2px_2px_0_#0A0A0A]">
                    <div className="h-full bg-[#EF476F] transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="flex justify-between items-center font-black text-xs uppercase tracking-widest mt-2 text-[#0A0A0A]">
                    <span>{progressPct}% Done</span>
                    {progress && (
                      <span className="flex items-center gap-1">
                        ⏱ {formatElapsed(progress.elapsed)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Step List */}
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {STEP_LABELS.map((label, i) => {
                    const stepNum = i;
                    const currentStep = progress?.step ?? -1;
                    const isActive = currentStep === stepNum;
                    const isDone = currentStep > stepNum;
                    const isPending = currentStep < stepNum;

                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-3 border-2 border-[#0A0A0A] rounded-xl transition-all ${
                          isActive ? 'bg-[#FFD166] shadow-[2px_2px_0_#0A0A0A]' : isDone ? 'bg-[#06D6A0]/10 opacity-70' : 'bg-gray-50 opacity-40'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full border-2 border-[#0A0A0A] flex items-center justify-center text-xs font-black bg-white">
                            {isDone ? '✓' : STEP_ICONS[i]}
                          </span>
                          <div className="text-xs font-black uppercase">
                            <span>{label}</span>
                            {isActive && progress?.detail && (
                              <p className="text-[10px] font-bold font-['Inter'] text-[#0A0A0A]/60 mt-0.5 normal-case">{progress.detail}</p>
                            )}
                          </div>
                        </div>
                        {isActive && (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#0A0A0A] border-t-transparent" />
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
                  <div className="p-3 border-2 border-[#0A0A0A] rounded-xl bg-gray-50 text-center">
                    <span className="block text-2xl font-black text-[#0A0A0A]">{genResult.nodes_count}</span>
                    <span className="text-[10px] font-black uppercase text-[#0A0A0A]/50">Concepts</span>
                  </div>
                  <div className="p-3 border-2 border-[#0A0A0A] rounded-xl bg-gray-50 text-center">
                    <span className="block text-2xl font-black text-[#0A0A0A]">{genResult.edges_count}</span>
                    <span className="text-[10px] font-black uppercase text-[#0A0A0A]/50">Links</span>
                  </div>
                  <div className="p-3 border-2 border-[#0A0A0A] rounded-xl bg-gray-50 text-center">
                    <span className="block text-2xl font-black text-[#0A0A0A]">{formatElapsed(genResult.elapsed)}</span>
                    <span className="text-[10px] font-black uppercase text-[#0A0A0A]/50">Time</span>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    dismissOverlay();
                    navigate(`/${role}/courses/${courseId}/map`);
                  }}
                  className="w-full py-4 border-[3px] border-[#0A0A0A] bg-[#0A0A0A] text-white font-black uppercase tracking-wider text-xs rounded-xl shadow-[4px_4px_0_#06D6A0] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#06D6A0] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  <span>View Knowledge Graph</span>
                </button>
              </div>
            )}

            {/* Error */}
            {genError && (
              <div className="space-y-4">
                <div className="p-4 border-[3px] border-[#0A0A0A] bg-[#EF476F]/10 text-[#EF476F] font-bold text-sm rounded-xl">
                  {genError}
                </div>
                <button 
                  onClick={dismissOverlay}
                  className="w-full py-3 border-[3px] border-[#0A0A0A] bg-[#0A0A0A] text-white font-black uppercase tracking-wider text-xs rounded-xl"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header Back Button */}
      <button 
        onClick={() => navigate(role === 'professor' ? '/professor/classes' : '/student/dashboard')}
        className="px-4 py-2 border-[3px] border-[#0A0A0A] bg-white rounded-xl font-black uppercase text-xs shadow-[3px_3px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-1.5 w-fit"
      >
        <ArrowLeft size={14} className="stroke-[3px]" />
        <span>Back to {role === 'professor' ? 'Classes' : 'Dashboard'}</span>
      </button>

      {/* Header Banner */}
      <div className="bg-[#118AB2] border-[3px] border-[#0A0A0A] rounded-3xl p-8 lg:p-10 shadow-[8px_8px_0_#0A0A0A] flex flex-col md:flex-row justify-between items-center relative overflow-hidden group">
        <div className="relative z-10 flex items-center gap-6">
          <div className="w-20 h-20 bg-white border-[3px] border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] flex items-center justify-center text-4xl">
            📖
          </div>
          <div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tight">{course.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="px-3 py-1 bg-[#0A0A0A] text-white text-xs font-black uppercase tracking-widest rounded-lg border-2 border-white/20">
                {course.code}
              </span>
              <span className="px-3 py-1 bg-white text-[#0A0A0A] text-xs font-black uppercase tracking-widest rounded-lg border-2 border-[#0A0A0A]">
                {role === 'professor' ? 'Professor View' : 'Student Study Center'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Navigation Action Bar */}
      <div className="flex flex-wrap gap-4 items-center">
        {role === 'professor' && (
          <>
            <button 
              onClick={cleanupDuplicates}
              className="px-5 py-3 border-[3px] border-[#0A0A0A] bg-[#FFD166] text-[#0A0A0A] rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2"
            >
              🧹 Clean Duplicates
            </button>
            <button 
              onClick={generateGraph}
              disabled={isGenerating}
              className="px-5 py-3 border-[3px] border-[#0A0A0A] bg-[#EF476F] text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2 disabled:opacity-50"
            >
              🧠 {isGenerating ? 'Generating...' : 'Re-Generate Graph'}
            </button>
            <button 
              onClick={() => navigate(`/professor/courses/${courseId}/tests`)}
              className="px-5 py-3 border-[3px] border-[#0A0A0A] bg-[#06D6A0] text-[#0A0A0A] rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2"
            >
              📝 Create & Manage Tests
            </button>
          </>
        )}
        
        <button 
          onClick={() => navigate(`/${role}/courses/${courseId}/map`)}
          className="px-5 py-3 border-[3px] border-[#0A0A0A] bg-white text-[#0A0A0A] rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2"
        >
          🕸 Visual Mind Map
        </button>
        <button 
          onClick={() => navigate(`/${role}/courses/${courseId}/plan`)}
          className="px-5 py-3 border-[3px] border-[#0A0A0A] bg-white text-[#0A0A0A] rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2"
        >
          📅 Study Plan
        </button>
        <button 
          onClick={() => navigate(`/${role}/courses/${courseId}/study`)}
          className="px-6 py-3.5 border-[3px] border-[#0A0A0A] bg-[#0A0A0A] text-white rounded-xl font-black uppercase tracking-wider text-xs shadow-[4px_4px_0_#06D6A0] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#06D6A0] active:translate-y-0 active:shadow-none transition-all flex items-center gap-2 md:ml-auto"
        >
          🚀 Enter Study Mode
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Learning Materials */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A] space-y-6">
            <div className="flex items-center justify-between pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📚</span>
                <h3 className="text-xl font-black uppercase tracking-tight text-[#0A0A0A]">Learning Materials</h3>
              </div>
              
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
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 border-[3px] border-[#0A0A0A] bg-[#0A0A0A] text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-[3px_3px_0_#EF476F] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#EF476F] active:translate-y-0 active:shadow-none transition-all flex items-center gap-1.5"
                  >
                    <Upload size={14} className="stroke-[3px]" />
                    <span>{isUploading ? 'Uploading...' : 'Add Materials'}</span>
                  </button>
                </>
              )}
            </div>
            
            <div className="space-y-4">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 border-[3px] border-[#0A0A0A] rounded-2xl bg-[#FCFCFC] shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center font-black uppercase text-xs text-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]">
                      {doc.filename.split('.').pop()?.toUpperCase() || 'DOC'}
                    </div>
                    <div>
                      <h4 className="font-black text-[#0A0A0A] line-clamp-1">{doc.filename}</h4>
                      <p className="text-xs font-bold text-[#0A0A0A]/50 font-['Inter'] mt-0.5">Added {new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <span className={`px-3 py-1 text-xs font-black uppercase border-[3px] border-[#0A0A0A] rounded-xl shadow-[2px_2px_0_#0A0A0A] ${
                    doc.status === 'processed' || doc.status === 'completed'
                      ? 'bg-[#06D6A0] text-[#0A0A0A]' 
                      : doc.status === 'processing'
                      ? 'bg-[#FFD166] text-[#0A0A0A] animate-pulse'
                      : 'bg-[#EF476F] text-white'
                  }`}>
                    {doc.status}
                  </span>
                </div>
              ))}
              
              {documents.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-[#0A0A0A]/40 text-center">
                  <FileText size={48} className="stroke-[1.5px]" />
                  <p className="font-black uppercase tracking-widest text-sm">No materials added yet</p>
                  {role === 'professor' && (
                    <span className="text-xs font-bold font-['Inter']">Upload syllabus or course lecture notes to power the AI.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Right Column: Intelligence & Student Access */}
        <div className="space-y-8">
          {/* Course Intelligence Card */}
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A] space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <span className="text-2xl">🧠</span>
              <h3 className="text-xl font-black uppercase tracking-tight text-[#0A0A0A]">Course Intelligence</h3>
            </div>
            
            <div className="space-y-4 font-bold text-sm">
              <div className="flex justify-between items-center p-3 border-2 border-[#0A0A0A] rounded-xl bg-[#FCFCFC]">
                <span className="text-[#0A0A0A]/60">Total Concepts</span>
                <span className="font-black text-base">{graphNodes.length || '--'}</span>
              </div>
              <div className="flex justify-between items-center p-3 border-2 border-[#0A0A0A] rounded-xl bg-[#FCFCFC]">
                <span className="text-[#0A0A0A]/60">Study Synapses</span>
                <span className="font-black text-base">{graphEdges.length || '--'}</span>
              </div>
              <div className="flex justify-between items-center p-3 border-2 border-[#0A0A0A] rounded-xl bg-[#FCFCFC]">
                <span className="text-[#0A0A0A]/60">Document Count</span>
                <span className="font-black text-base">{documents.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 border-2 border-[#0A0A0A] rounded-xl bg-[#FCFCFC]">
                <span className="text-[#0A0A0A]/60">Intelligence Status</span>
                <span className={`px-2.5 py-0.5 border-2 border-[#0A0A0A] rounded-lg text-xs font-black uppercase ${
                  graphNodes.length > 0 ? 'bg-[#06D6A0] text-[#0A0A0A]' : 'bg-[#FFD166] text-[#0A0A0A]'
                }`}>
                  {graphNodes.length > 0 ? 'Map Optimized' : 'Map Required'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Student Access Card */}
          {role === 'professor' && (
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A] space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b-[3px] border-[#0A0A0A]/10">
                <span className="text-2xl">🎟</span>
                <h3 className="text-xl font-black uppercase tracking-tight text-[#0A0A0A]">Student Access</h3>
              </div>
              
              <p className="text-sm font-bold font-['Inter'] text-[#0A0A0A]/60 leading-relaxed">
                Provide this invitation code to your students to grant them full access to this course's AI materials.
              </p>
              
              {inviteCode ? (
                <div className="p-4 border-[3px] border-[#0A0A0A] bg-[#FFD166] text-[#0A0A0A] font-black text-2xl text-center rounded-2xl tracking-widest shadow-[4px_4px_0_#0A0A0A]">
                  {inviteCode}
                </div>
              ) : (
                <button 
                  onClick={generateInvite} 
                  className="w-full py-4 border-[3px] border-[#0A0A0A] bg-[#0A0A0A] text-white font-black uppercase tracking-wider text-xs rounded-xl shadow-[4px_4px_0_#06D6A0] hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#06D6A0] active:translate-y-0 active:shadow-none transition-all"
                >
                  Generate Invitation Code
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
