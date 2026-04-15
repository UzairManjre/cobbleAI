import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { MoreVertical, ChevronRight } from 'lucide-react';
import { coursesApi } from '../api';
import './Dashboard.css';

export default function Dashboard() {
  const { token, role } = useAuthStore();
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
      const res = await coursesApi.list();
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
      await coursesApi.create({ title: courseTitle, code: courseCode });
      setShowModal(false);
      setCourseTitle('');
      setCourseCode('');
      fetchCourses();
    } catch (err) {
      alert('Failed to create course');
    }
  };

  const handleJoinCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await coursesApi.join(inviteCode);
      setShowModal(false);
      setInviteCode('');
      fetchCourses();
    } catch (err) {
      alert('Invalid or expired invite code');
    }
  };

  return (
    <div className="page-container classes-page">
      <h1 className="page-title">My classes</h1>
      
      {isLoading ? (
        <div style={{ color: 'var(--designer-text-secondary)' }}>Loading classes...</div>
      ) : (
        <div className="classes-grid">
          {courses.map((cls) => (
            <div key={cls.id} className="designer-card class-card">
              <div className="class-card-header designer-flex designer-justify-between">
                <h3>{cls.title}</h3>
                <MoreVertical size={18} className="text-secondary" style={{cursor: 'pointer'}} />
              </div>
              
              <p className="class-desc">{cls.description || 'No description provided'}</p>
              <span className="class-student-count">{cls.students_count || 0} students</span>
              
              <div className="class-card-actions">
                <div 
                  className="action-row designer-flex designer-justify-between designer-items-center"
                  onClick={() => navigate(`/professor/courses/${cls.id}`)}
                >
                  <span>View/Edit</span>
                  <ChevronRight size={16} />
                </div>
                <div 
                  className="action-row designer-flex designer-justify-between designer-items-center"
                  onClick={() => navigate(`/professor/courses/${cls.id}/study`)}
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
            <h3>Create new class</h3>
            <p className="desc">Set up a new class</p>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">
              {role === 'professor' ? 'Create New Class' : 'Join a Class'}
            </h2>
            <form onSubmit={role === 'professor' ? handleCreateCourse : handleJoinCourse}>
              {role === 'professor' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Class Title</label>
                    <input
                      autoFocus
                      className="designer-search-input"
                      placeholder="e.g. Intro to AI"
                      value={courseTitle}
                      onChange={e => setCourseTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department Code</label>
                    <input
                      className="designer-search-input"
                      placeholder="e.g. CS-101"
                      value={courseCode}
                      onChange={e => setCourseCode(e.target.value)}
                      required
                    />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">Invitation Code</label>
                  <input
                    autoFocus
                    className="designer-search-input"
                    placeholder="Enter the 6-8 digit code"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="designer-btn">
                  Cancel
                </button>
                <button type="submit" className="designer-btn designer-btn-primary">
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
