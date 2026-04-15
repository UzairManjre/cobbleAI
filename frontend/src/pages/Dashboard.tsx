import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000';

export default function Dashboard() {
  const { logout, token, role } = useAuthStore();
  const navigate = useNavigate();
  
  const [courses, setCourses] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create / Join State
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    fetchCourses();
  }, [token]);

  const fetchCourses = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/courses/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCourses(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/courses/`, 
        { title: courseTitle, code: courseCode },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setShowModal(false);
      fetchCourses();
    } catch (err) {
      alert('Failed to create course');
    }
  };

  const handleJoinCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/courses/join`, 
        { code: inviteCode },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setShowModal(false);
      fetchCourses();
    } catch (err) {
      alert('Invalid or expired invite code');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-white/[0.06] flex flex-col p-5">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-surface)] border border-[var(--accent-border)] flex items-center justify-center">
            <span className="text-sm font-bold text-[var(--accent)]">C</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Cobble AI</span>
        </div>

        <nav className="flex-1 space-y-1 text-[13px]">
          <div className="px-3 py-2.5 bg-white/[0.06] text-white rounded-lg font-medium cursor-pointer">My Courses</div>
          <div className="px-3 py-2.5 text-white/40 rounded-lg hover:text-white/60 hover:bg-white/[0.03] cursor-pointer transition-colors">Analytics</div>
          <div className="px-3 py-2.5 text-white/40 rounded-lg hover:text-white/60 hover:bg-white/[0.03] cursor-pointer transition-colors">Settings</div>
        </nav>

        <button onClick={handleLogout} className="text-[12px] text-white/30 hover:text-white/60 text-left px-3 transition-colors">
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8">
        <div className="max-w-5xl">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
              <p className="text-sm text-white/40 mt-1">
                {role === 'professor' ? 'Manage your students and materials' : 'Continue your learning journey'}
              </p>
            </div>
            <button 
              onClick={() => setShowModal(true)}
              className="bg-[var(--accent)] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all duration-150"
            >
              {role === 'professor' ? '+ New Course' : 'Join Course'}
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-20 text-white/20">Loading courses...</div>
          ) : courses.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl">
              <p className="text-white/30 text-[14px]">No courses found. {role === 'professor' ? 'Create your first course to begin.' : 'Ask your professor for an invite code.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map(course => (
                <div 
                  key={course.id} 
                  onClick={() => navigate(`/course/${course.id}`)}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] hover:bg-white/[0.05] cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[13px] font-mono text-white/60 uppercase">
                      {course.code.slice(0, 2)}
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {course.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold mb-1 group-hover:text-white transition-colors">{course.title}</h3>
                  <p className="text-[11px] text-white/30 font-mono">{course.code}</p>
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-[12px] text-white/40">{course.docs_count} documents</span>
                    <span className="text-[11px] text-white/20 group-hover:text-white/40 transition-colors">View →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111] border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-medium mb-6">{role === 'professor' ? 'Create New Course' : 'Join a Course'}</h2>
            <form onSubmit={role === 'professor' ? handleCreateCourse : handleJoinCourse} className="space-y-4">
              {role === 'professor' ? (
                <>
                  <div>
                    <label className="block text-[11px] text-white/40 uppercase mb-2">Course Title</label>
                    <input 
                      autoFocus
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20"
                      placeholder="e.g. Advanced Machine Learning"
                      value={courseTitle}
                      onChange={e => setCourseTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/40 uppercase mb-2">Department Code</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20"
                      placeholder="e.g. CS-401"
                      value={courseCode}
                      onChange={e => setCourseCode(e.target.value)}
                      required
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[11px] text-white/40 uppercase mb-2">Invitiation Code</label>
                  <input 
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/20 font-mono"
                    placeholder="Enter the 6-8 digit code"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-sm hover:bg-white/5">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-white text-black text-sm font-medium hover:bg-white/90">
                  {role === 'professor' ? 'Create' : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
