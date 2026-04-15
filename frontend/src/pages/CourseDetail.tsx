import { useAuthStore } from '../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { coursesApi, documentsApi, graphsApi } from '../api';
import { useGraphStore } from '../store/graphStore';
import { ArrowLeft, Upload, Sparkles, Users, FileText, Brain } from 'lucide-react';
import './CourseDetail.css';

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

  const {
    generateGraph: generateFromDocs,
    isLoading: isGeneratingGraph,
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

  const generateGraph = async () => {
    if (!courseId || !token) return;

    try {
      await generateFromDocs(courseId);
      alert(`Graph generated successfully! ${useGraphStore.getState().nodes.length} concepts found.`);
    } catch (err: any) {
      console.error('Graph generation error:', err);
      alert('Graph generation failed');
    }
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

  return (
    <div className="prof-course-detail">
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
            disabled={isGeneratingGraph}
            className="prof-action-btn prof-action-btn-secondary"
          >
            {isGeneratingGraph ? 'Generating...' : 'Generate Graph'}
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
