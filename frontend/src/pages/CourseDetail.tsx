import { useAuthStore } from '../store/authStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useGraphStore } from '../store/graphStore';

const API_URL = 'http://127.0.0.1:8000';

export default function CourseDetail() {
  const { courseId } = useParams();
  const { token, role } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  
  const { 
    generateFromDocs, 
    isLoading: isGeneratingGraph,
    nodes: graphNodes,
    edges: graphEdges,
    fetchCourseGraph
  } = useGraphStore();

  useEffect(() => {
    fetchCourseDetails();
    fetchDocuments();
    if (courseId) {
      fetchCourseGraph(courseId);
    }
  }, [courseId, token]);

  const fetchCourseDetails = async () => {
    try {
      // For now finding from list, but could be a direct GET /courses/{id}
      const res = await axios.get(`${API_URL}/courses/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const current = res.data.find((c: any) => c.id === courseId);
      setCourse(current);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDocuments = async () => {
    if (!token) return;
    
    try {
      const res = await axios.get(`${API_URL}/documents`, {
        params: { course_id: courseId },
        headers: { Authorization: `Bearer ${token}` }
      });
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !token) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('course_id', courseId || '');
    
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      await axios.post(`${API_URL}/documents/upload`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
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
      const res = await axios.post(`${API_URL}/courses/${courseId}/invite`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
      const res = await axios.post(`${API_URL}/documents/cleanup-duplicates`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.message);
      fetchDocuments();
    } catch (err: any) {
      console.error('Cleanup error:', err);
      alert('Cleanup failed');
    }
  };

  if (!course) return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-white/20">Loading course...</div>;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              &larr;
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
                <span className="text-[12px] font-mono text-white/20 px-2 py-0.5 border border-white/5 rounded-md uppercase">{course.code}</span>
              </div>
               <p className="text-sm text-white/40 mt-1">Course Mission Control & Laboratory</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={cleanupDuplicates}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 rounded-xl text-sm font-medium transition-all"
            >
              Clean Duplicates
            </button>
            <button
              onClick={generateGraph}
              disabled={isGeneratingGraph}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {isGeneratingGraph ? 'Generating...' : 'Generate Graph'}
            </button>
            <button
              onClick={() => navigate(`/course/${courseId}/map`)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-sm font-medium transition-all"
            >
              Visual Mind Map
            </button>
            <button
              onClick={() => navigate(`/course/${courseId}/plan`)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 rounded-xl text-sm font-medium transition-all"
            >
              📋 Study Plan
            </button>
            <button
              onClick={() => navigate(`/course/${courseId}/tests`)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 rounded-xl text-sm font-medium transition-all"
            >
              📝 Tests
            </button>
            <button
              onClick={() => navigate(`/course/${courseId}/study`)}
              className="px-4 py-2 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] rounded-xl text-sm font-semibold transition-all"
            >
              Enter Study Mode
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content: Documents */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-medium text-white/60">Learning Materials</h2>
              {role === 'professor' && (
                <>
                  <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept=".pdf,.docx,.pptx" multiple />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-[12px] text-white hover:underline disabled:opacity-50"
                  >
                    {isUploading ? 'Uploading...' : '+ Add Documents'}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-white/[0.03] border border-white/[0.05] rounded-2xl p-4 flex items-center justify-between group hover:bg-white/[0.05] transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center text-white/20">
                      {doc.filename.split('.').pop()?.toUpperCase() || 'FILE'}
                    </div>
                    <div>
                      <h4 className="text-[14px] font-medium group-hover:text-white transition-colors">{doc.filename}</h4>
                      <p className="text-[11px] text-white/20">Added {new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full uppercase tracking-wider ${
                    doc.status === 'ready' ? 'text-emerald-400 bg-emerald-500/5' : 
                    doc.status === 'failed' ? 'text-red-400 bg-red-500/5' :
                    'text-amber-400 bg-amber-500/5'
                  }`}>
                    {doc.status}
                  </span>
                </div>
              ))}
              {documents.length === 0 && (
                <div className="py-20 text-center border border-dashed border-white/5 rounded-3xl text-white/10 text-[13px]">
                  No documents available for this course yet.
                </div>
              )}
            </div>
          </div>

          {/* Sidebar: Stats & Management */}
          <div className="space-y-6">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-3xl p-6">
              <h3 className="text-[13px] font-medium text-white/60 mb-4">Course Intelligence</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-white/30">Total Concepts</span>
                  <span className="text-[14px] font-mono text-white/80">{graphNodes.length || '--'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-white/30">Study Synapses</span>
                  <span className="text-[14px] font-mono text-white/80">{graphEdges.length || '--'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-white/30">Document Count</span>
                  <span className="text-[14px] font-mono text-white/80">{documents.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-white/30">Intelligence Status</span>
                  <span className={`text-[12px] ${graphNodes.length > 0 ? 'text-emerald-400' : 'text-white/20'}`}>
                    {graphNodes.length > 0 ? 'Map Optimized' : 'Map Required'}
                  </span>
                </div>
              </div>
            </div>

            {role === 'professor' && (
              <div className="bg-[#111] border border-white/5 rounded-3xl p-6">
                <h3 className="text-[13px] font-medium text-white/60 mb-2">Student Access</h3>
                <p className="text-[11px] text-white/30 mb-4">Provide this code to your students to grant access to this course.</p>
                {inviteCode ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center font-mono text-lg tracking-[0.2em] text-white">
                    {inviteCode}
                  </div>
                ) : (
                  <button onClick={generateInvite} className="w-full bg-white text-black py-2.5 rounded-xl text-[12px] font-medium hover:bg-white/90">
                    Generate Invitation Code
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
