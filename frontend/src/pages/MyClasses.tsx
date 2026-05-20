import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  GraduationCap, 
  ChevronRight, 
  Plus, 
  BookOpen, 
  Calendar, 
  Users, 
  FolderOpen,
  Search,
  Mail,
  Flag
} from 'lucide-react';
import { coursesApi } from '../api';
import { useAuthStore } from '../store/authStore';
import './MyClasses.css';

interface StudentData {
  id: string;
  student_id: string;
  course_id: string;
  name: string;
  email: string;
  bg: string;
  cls: string;
  progress: number;
  status: string;
  flagIcon: boolean;
}

export default function MyClasses() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'classes' | 'students'>(
    tabParam === 'students' ? 'students' : 'classes'
  );

  // Data State
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search State for Students
  const [studentSearchQuery, setStudentSearchQuery] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseDesc, setCourseDesc] = useState('');

  // Sync tab with URL search parameter
  useEffect(() => {
    if (tabParam === 'students') {
      setActiveTab('students');
    } else {
      setActiveTab('classes');
    }
  }, [tabParam]);

  const handleTabChange = (tab: 'classes' | 'students') => {
    setActiveTab(tab);
    if (tab === 'students') {
      setSearchParams({ tab: 'students' });
    } else {
      setSearchParams({});
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);
    
    // Load courses
    try {
      const coursesRes = await coursesApi.list();
      setCourses(coursesRes.data || []);
    } catch (err) {
      console.error('Error loading courses:', err);
      setCourses([]);
    }

    // Load students
    try {
      const studentsRes = await coursesApi.getProfessorStudents();
      setStudents(studentsRes.data || []);
    } catch (err) {
      console.error('Error loading students:', err);
      setStudents([]);
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
      
      // Refresh data
      loadData();
    } catch (err) {
      alert('Failed to create course');
    }
  };

  const handleNudgeClick = () => {
    alert("Feature coming soon!");
  };

  // Helper to get nice icons & colors depending on subject
  const getSubjectMeta = (code: string, title: string) => {
    const cleanCode = code.toUpperCase();
    const cleanTitle = title.toLowerCase();

    if (cleanCode.includes('MAT') || cleanTitle.includes('math')) {
      return {
        category: 'Mathematics',
        icon: '√x',
        class: 'math-theme'
      };
    }
    if (cleanCode.includes('PHY') || cleanTitle.includes('physic')) {
      return {
        category: 'Physics',
        icon: '⚛',
        class: 'physics-theme'
      };
    }
    if (cleanCode.includes('CSE') || cleanCode.includes('CS') || cleanTitle.includes('comput') || cleanTitle.includes('data')) {
      return {
        category: 'Computer Science',
        icon: '⟨/⟩',
        class: 'cs-theme'
      };
    }
    return {
      category: cleanCode || 'General',
      icon: '📖',
      class: 'general-theme'
    };
  };

  // Compute active classes mapping
  const activeClasses = useMemo(() => {
    return courses.map(c => {
      const courseStudents = students.filter(s => s.course_id === c.id);
      const studentCount = courseStudents.length;
      const meta = getSubjectMeta(c.code, c.title);

      return {
        id: c.id,
        title: c.title,
        code: c.code,
        docsCount: c.docs_count || 0,
        studentsCount: studentCount,
        category: meta.category,
        icon: meta.icon,
        themeClass: meta.class
      };
    });
  }, [courses, students]);

  // Compute filtered students roster
  const filteredStudents = useMemo(() => {
    return students.filter(s => 
      s.name.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      s.cls.toLowerCase().includes(studentSearchQuery.toLowerCase())
    );
  }, [students, studentSearchQuery]);

  return (
    <div className="my-classes-container animate-in fade-in duration-300">
      
      {/* 1. Header Banner */}
      <div className="classes-banner-card">
        <div className="banner-left">
          <div className="banner-icon-bg">
            <GraduationCap size={32} />
          </div>
          <div className="banner-info">
            <h2>Classes & Students</h2>
            <p>Manage your active courses and track student performance in one place.</p>
          </div>
        </div>
        
        {/* Banner Stats Card */}
        <div className="banner-stats-card">
          <span className="stats-label">Total Classes</span>
          <span className="stats-value">{courses.length}</span>
          <span className="stats-subtag">{students.length} Students</span>
        </div>
        
        {/* Decorative elements */}
        <div className="banner-bg-decoration">
          <div className="banner-books-deco">📚</div>
          <div className="banner-plant-deco">🌱</div>
        </div>
      </div>

      {/* 2. Beautiful Tab Switcher Switch */}
      <div className="classes-tabs-bar">
        <button 
          className={`tab-switch-btn ${activeTab === 'classes' ? 'active' : ''}`}
          onClick={() => handleTabChange('classes')}
        >
          <BookOpen size={18} />
          <span>Active Classes ({courses.length})</span>
        </button>
        <button 
          className={`tab-switch-btn ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => handleTabChange('students')}
        >
          <Users size={18} />
          <span>Student Roster ({students.length})</span>
        </button>
      </div>

      {/* 3. Main Views depending on activeTab */}
      {activeTab === 'classes' ? (
        <div className="my-classes-grid">
          
          {/* Left Side: Active Classes List */}
          <div className="classes-list-section">
            <div className="section-header">
              <BookOpen size={20} className="header-icon" />
              <h3>Active Classes</h3>
            </div>

            {isLoading ? (
              <div className="classes-loading">Loading classes...</div>
            ) : activeClasses.length === 0 ? (
              <div className="classes-empty-state">
                <FolderOpen size={48} className="empty-state-icon" />
                <p>No active classes found.</p>
                <span>Click "Add New Class" on the right to get started.</span>
              </div>
            ) : (
              <div className="classes-cards-list">
                {activeClasses.map((course) => (
                  <div 
                    key={course.id} 
                    className={`class-item-card hover-lift ${course.themeClass}`}
                    onClick={() => navigate(`/professor/courses/${course.id}`)}
                  >
                    <div className="class-card-left">
                      <div className="class-subject-icon">
                        {course.icon}
                      </div>
                      <div className="class-card-details">
                        <span className="class-category-tag">{course.category}</span>
                        <h4>{course.title}</h4>
                        <div className="class-card-meta">
                          <div className="meta-info-item">
                            <FolderOpen size={14} />
                            <span>{course.docsCount} {course.docsCount === 1 ? 'Document' : 'Documents'}</span>
                          </div>
                          <div className="meta-info-item">
                            <Users size={14} />
                            <span>{course.studentsCount} Students</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="class-card-right" onClick={(e) => e.stopPropagation()}>
                      <span className={`class-status-badge ${course.docsCount > 0 ? 'trained' : 'empty'}`}>
                        {course.docsCount > 0 ? 'AI Trained' : 'No Materials'}
                      </span>
                      <button 
                        className="class-card-action-btn"
                        onClick={() => navigate(`/professor/courses/${course.id}`)}
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Side: Add Class CTA */}
          <div className="classes-sidebar-section">
            <div className="add-class-sidebar-card">
              <div className="sidebar-card-header">
                <div className="header-add-icon">
                  <Plus size={16} />
                </div>
                <h4>Add Class</h4>
              </div>

              <div className="sidebar-card-body">
                <div className="card-illustration-wrapper">
                  <div className="folder-illustration">📂</div>
                  <div className="illustration-plus">+</div>
                </div>
                <h5>Create a New Class</h5>
                <p>Set up a new class and start managing your students</p>
                <button 
                  onClick={() => setShowModal(true)} 
                  className="add-new-class-sidebar-btn"
                >
                  <Plus size={16} />
                  <span>Add New Class</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      ) : (
        /* Tab: Student Roster */
        <div className="students-roster-section animate-in fade-in duration-200">
          
          <div className="roster-header-container">
            <div className="section-header">
              <Users size={20} className="header-icon" />
              <h3>Student Roster</h3>
            </div>
            
            {/* Search Box */}
            <div className="roster-search-wrapper">
              <Search className="roster-search-icon" size={16} />
              <input 
                type="text" 
                placeholder="Search students or classes..." 
                className="roster-search-input"
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="classes-loading">Loading student roster...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="classes-empty-state">
              <Users size={48} className="empty-state-icon" />
              <p>{students.length === 0 ? "No students enrolled in your classes yet." : "No students match your search query."}</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Progress Bar</th>
                    <th>Flag Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="roster-row">
                      <td>
                        <div className="student-profile-info">
                          <img 
                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random&color=fff`} 
                            alt={student.name} 
                            className="student-avatar-img"
                          />
                          <div className="student-name-details">
                            <span className="student-name-text">{student.name}</span>
                            <span className="student-email-text">{student.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="student-class-tag">{student.cls}</span>
                      </td>
                      <td>
                        <div className="roster-progress-container">
                          <div className="roster-progress-bar-bg">
                            <div 
                              className="roster-progress-bar-fill" 
                              style={{ width: `${student.progress}%` }}
                            ></div>
                          </div>
                          <span className="roster-progress-text">{student.progress}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="roster-flag-badge">
                          <span className="flag-badge-title">Flag Student?</span>
                          <span className="flag-badge-status">{student.status}</span>
                        </div>
                      </td>
                      <td>
                        {student.flagIcon ? (
                          <button className="roster-flag-btn" onClick={handleNudgeClick} title="Flagged">
                            <Flag size={14} className="flagged-icon" />
                          </button>
                        ) : (
                          <button className="roster-nudge-btn" onClick={handleNudgeClick}>
                            <Mail size={14} />
                            <span>Send Nudge</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. New Class Modal Popup */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-container animate-in zoom-in-95 duration-200">
            <div className="modal-header">
              <h3>Create New Class</h3>
              <button onClick={() => setShowModal(false)} className="modal-close-btn">&times;</button>
            </div>
            <form onSubmit={handleCreateCourse}>
              <div className="modal-body">
                <div className="form-group mb-4">
                  <label htmlFor="courseTitle">Class Name</label>
                  <input 
                    type="text" 
                    id="courseTitle" 
                    required 
                    placeholder="e.g. Introduction to Physics"
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    className="modal-input"
                  />
                </div>
                <div className="form-group mb-4">
                  <label htmlFor="courseCode">Class Code</label>
                  <input 
                    type="text" 
                    id="courseCode" 
                    required 
                    placeholder="e.g. PHY101"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    className="modal-input"
                  />
                </div>
                <div className="form-group mb-4">
                  <label htmlFor="courseDesc">Description (Optional)</label>
                  <textarea 
                    id="courseDesc" 
                    placeholder="Brief description of the course..."
                    value={courseDesc}
                    onChange={(e) => setCourseDesc(e.target.value)}
                    className="modal-input"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="modal-btn-cancel"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="modal-btn-submit"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
