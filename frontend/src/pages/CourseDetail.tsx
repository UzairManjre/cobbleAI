import { useAuthStore } from '../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { coursesApi, documentsApi, graphsApi } from '../api';
import { useGraphStore } from '../store/graphStore';
import { ArrowLeft, Upload, Sparkles, Users, FileText, Brain } from 'lucide-react';
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
      <div className="prof-course-loading">
        <p>Loading course...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="prof-course-empty">
        <h2>Course not found</h2>
        <button onClick={() => navigate('/professor/dashboard')} className="prof-btn-back">
          <ArrowLeft size={16} />
          Back to Classes
        </button>
      </div>
    );
  }

  // Compute progress percentage
  const progressPct = progress
    ? Math.round(((progress.step) / progress.totalSteps) * 100)
    : 0;

  return (
    <div className="prof-course-detail">
      {/* Graph Generation Progress Overlay */}
      {(isGenerating || genResult || genError) && (
        <div className="gen-overlay">
          <div className="gen-overlay-backdrop" />
          <div className="gen-modal">
            {/* Header */}
            <div className="gen-modal-header">
              <div className="gen-modal-icon">
                {genResult ? '🎉' : genError ? '❌' : '🧠'}
              </div>
              <h2>
                {genResult
                  ? 'Knowledge Graph Ready!'
                  : genError
                  ? 'Generation Failed'
                  : 'Building Knowledge Graph'}
              </h2>
              {!genResult && !genError && (
                <p className="gen-modal-subtitle">
                  This may take a few minutes depending on document size
                </p>
              )}
            </div>

            {/* Progress Content */}
            {!genResult && !genError && (
              <div className="gen-progress-content">
                {/* Progress Bar */}
                <div className="gen-progress-bar-container">
                  <div className="gen-progress-bar" style={{ width: `${progressPct}%` }}>
                    <div className="gen-progress-bar-glow" />
                  </div>
                </div>
                <div className="gen-progress-meta">
                  <span className="gen-progress-pct">{progressPct}%</span>
                  {progress && (
                    <span className="gen-progress-time">
                      ⏱ {formatElapsed(progress.elapsed)}
                    </span>
                  )}
                </div>

                {/* Step List */}
                <div className="gen-steps">
                  {STEP_LABELS.map((label, i) => {
                    const stepNum = i; // step 0-6
                    const currentStep = progress?.step ?? -1;
                    const isActive = currentStep === stepNum;
                    const isDone = currentStep > stepNum;
                    const isPending = currentStep < stepNum;

                    return (
                      <div
                        key={i}
                        className={`gen-step ${isActive ? 'gen-step-active' : ''} ${isDone ? 'gen-step-done' : ''} ${isPending ? 'gen-step-pending' : ''}`}
                      >
                        <span className="gen-step-icon">
                          {isDone ? '✓' : STEP_ICONS[i]}
                        </span>
                        <div className="gen-step-text">
                          <span className="gen-step-label">{label}</span>
                          {isActive && progress?.detail && (
                            <span className="gen-step-detail">{progress.detail}</span>
                          )}
                        </div>
                        {isActive && (
                          <div className="gen-step-spinner" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Success Result */}
            {genResult && (
              <div className="gen-result">
                <div className="gen-result-stats">
                  <div className="gen-result-stat">
                    <span className="gen-result-stat-value">{genResult.nodes_count}</span>
                    <span className="gen-result-stat-label">Concepts</span>
                  </div>
                  <div className="gen-result-stat">
                    <span className="gen-result-stat-value">{genResult.edges_count}</span>
                    <span className="gen-result-stat-label">Connections</span>
                  </div>
                  <div className="gen-result-stat">
                    <span className="gen-result-stat-value">{formatElapsed(genResult.elapsed)}</span>
                    <span className="gen-result-stat-label">Time</span>
                  </div>
                </div>
                <button onClick={dismissOverlay} className="gen-result-btn">
                  <Sparkles size={16} />
                  View Knowledge Graph
                </button>
              </div>
            )}

            {/* Error */}
            {genError && (
              <div className="gen-error">
                <p>{genError}</p>
                <button onClick={dismissOverlay} className="gen-error-btn">
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="prof-course-header">
        <button onClick={() => navigate('/professor/dashboard')} className="prof-back-btn">
          <ArrowLeft size={18} />
          <span>Back to Classes</span>
        </button>
        
        <div className="prof-course-title-section">
          <h1>{course.title}</h1>
          <span className="prof-course-code">{course.code}</span>
        </div>

        <div className="prof-course-actions">
          <button onClick={cleanupDuplicates} className="prof-action-btn">
            Clean Duplicates
          </button>
          <button
            onClick={generateGraph}
            disabled={isGenerating}
            className="prof-action-btn prof-action-btn-secondary"
          >
            {isGenerating ? 'Generating...' : 'Generate Graph'}
          </button>
          <button
            onClick={() => navigate(`/course/${courseId}/map`)}
            className="prof-action-btn prof-action-btn-secondary"
          >
            Visual Mind Map
          </button>
          <button
            onClick={() => navigate(`/course/${courseId}/plan`)}
            className="prof-action-btn prof-action-btn-secondary"
          >
            Study Plan
          </button>
          <button
            onClick={() => navigate(`/course/${courseId}/tests`)}
            className="prof-action-btn prof-action-btn-secondary"
          >
            Tests
          </button>
          <button
            onClick={() => navigate(`/course/${courseId}/study`)}
            className="prof-action-btn prof-action-btn-primary"
          >
            Enter Study Mode
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="prof-course-grid">
        {/* Left: Documents */}
        <div className="prof-course-main">
          <div className="prof-section-header">
            <h2>Learning Materials</h2>
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
                  className="prof-add-doc-btn"
                >
                  <Upload size={14} />
                  {isUploading ? 'Uploading...' : 'Add Documents'}
                </button>
              </>
            )}
          </div>

          <div className="prof-documents-list">
            {documents.map((doc) => (
              <div key={doc.id} className="prof-document-item">
                <div className="prof-doc-info">
                  <div className="prof-doc-icon">
                    {doc.filename.split('.').pop()?.toUpperCase() || 'FILE'}
                  </div>
                  <div>
                    <h4>{doc.filename}</h4>
                    <p>Added {new Date(doc.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`prof-doc-status prof-doc-status-${doc.status}`}>
                  {doc.status}
                </span>
              </div>
            ))}
            
            {documents.length === 0 && (
              <div className="prof-empty-docs">
                <FileText size={32} />
                <p>No documents available for this course yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="prof-course-sidebar">
          {/* Stats Card */}
          <div className="prof-sidebar-card">
            <h3>Course Intelligence</h3>
            <div className="prof-stats">
              <div className="prof-stat-row">
                <span>Total Concepts</span>
                <span className="prof-stat-value">{graphNodes.length || '--'}</span>
              </div>
              <div className="prof-stat-row">
                <span>Study Synapses</span>
                <span className="prof-stat-value">{graphEdges.length || '--'}</span>
              </div>
              <div className="prof-stat-row">
                <span>Document Count</span>
                <span className="prof-stat-value">{documents.length}</span>
              </div>
              <div className="prof-stat-row">
                <span>Intelligence Status</span>
                <span className={`prof-stat-value ${graphNodes.length > 0 ? 'prof-status-ready' : 'prof-status-pending'}`}>
                  {graphNodes.length > 0 ? 'Map Optimized' : 'Map Required'}
                </span>
              </div>
            </div>
          </div>

          {/* Student Access Card */}
          {role === 'professor' && (
            <div className="prof-sidebar-card">
              <h3>Student Access</h3>
              <p>Provide this code to your students to grant access to this course.</p>
              {inviteCode ? (
                <div className="prof-invite-code">
                  {inviteCode}
                </div>
              ) : (
                <button onClick={generateInvite} className="prof-btn-submit">
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
