import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Plus, 
  Calendar, 
  ChevronRight, 
  BookOpen, 
  Flame, 
  PenTool, 
  Send,
  Sparkles,
  HelpCircle,
  FolderOpen
} from 'lucide-react';
import { testsApi, coursesApi } from '../api';
import { useAuthStore } from '../store/authStore';
import './Assignments.css';

export default function Assignments() {
  const { token } = useAuthStore();
  const navigate = useNavigate();

  // Data state
  const [courses, setCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [passingPercentage, setPassingPercentage] = useState(40);

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);

    // Load courses first
    try {
      const coursesRes = await coursesApi.list();
      const coursesList = coursesRes.data || [];
      setCourses(coursesList);
      if (coursesList.length > 0) {
        setCourseId(coursesList[0].id);
      }
    } catch (err) {
      console.error('Error loading courses:', err);
    }

    // Load tests separately so a failure doesn't block the page
    try {
      const testsRes = await testsApi.listAllProfessorTests();
      const allTests = testsRes.data?.tests || [];
      const filteredAssignments = allTests.filter((t: any) => t.test_type === 'assignment');
      setAssignments(filteredAssignments);
    } catch (err) {
      console.error('Error loading tests:', err);
      setAssignments([]);
    }

    setIsLoading(false);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      alert('Please select a course.');
      return;
    }

    try {
      // Create assignment
      await testsApi.create({
        course_id: courseId,
        title,
        description,
        test_type: 'assignment',
        duration_minutes: durationMinutes,
        passing_percentage: passingPercentage,
        available_until: dueDate ? new Date(dueDate).toISOString() : undefined,
        available_from: new Date().toISOString()
      });

      setShowModal(false);
      setTitle('');
      setDescription('');
      setDueDate('');
      
      // Refresh
      loadData();
    } catch (err) {
      console.error('Failed to create assignment:', err);
      alert('Failed to create assignment');
    }
  };

  // Helper to format due date to "Due 8th May 2026"
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    let suffix = 'th';
    if (day === 1 || day === 21 || day === 31) suffix = 'st';
    else if (day === 2 || day === 22) suffix = 'nd';
    else if (day === 3 || day === 23) suffix = 'rd';
    
    return `Due ${day}${suffix} ${month} ${year}`;
  };

  // Helper to calculate days remaining
  const getDaysLeft = (dateStr: string) => {
    if (!dateStr) return '';
    const diffTime = new Date(dateStr).getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    return `${diffDays} Days Left`;
  };

  // Helper to determine course theme & icon
  const getSubjectMeta = (code: string, title: string) => {
    const cleanCode = (code || '').toUpperCase();
    const cleanTitle = (title || '').toLowerCase();

    if (cleanCode.includes('MAT') || cleanTitle.includes('math')) {
      return {
        icon: '📖',
        class: 'math-theme'
      };
    }
    if (cleanCode.includes('PHY') || cleanTitle.includes('physic')) {
      return {
        icon: '⚛',
        class: 'physics-theme'
      };
    }
    if (cleanCode.includes('CSE') || cleanCode.includes('CS') || cleanTitle.includes('comput') || cleanTitle.includes('data')) {
      return {
        icon: '⟨/⟩',
        class: 'cs-theme'
      };
    }
    return {
      icon: '📝',
      class: 'general-theme'
    };
  };

  // Metrics calculations
  const totalCount = assignments.length;
  const publishedAssignments = useMemo(() => assignments.filter(a => a.status === 'published'), [assignments]);
  const draftAssignments = useMemo(() => assignments.filter(a => a.status === 'draft'), [assignments]);
  
  const displayAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'draft' ? -1 : 1; // Drafts first
      if (!a.available_until) return 1;
      if (!b.available_until) return -1;
      return new Date(a.available_until).getTime() - new Date(b.available_until).getTime();
    });
  }, [assignments]);

  const draftCount = draftAssignments.length;
  const publishedCount = publishedAssignments.length;

  // Grouped assignments count by course
  const courseAssignmentCounts = useMemo(() => {
    return courses.map(c => {
      const count = assignments.filter(a => a.course_id === c.id).length;
      const meta = getSubjectMeta(c.code, c.title);
      return {
        id: c.id,
        title: c.title,
        code: c.code,
        count,
        themeClass: meta.class,
        icon: meta.icon
      };
    }).filter(c => c.count > 0);
  }, [courses, assignments]);

  return (
    <div className="assignments-container animate-in fade-in duration-300">
      
      {/* 1. Header Banner */}
      <div className="assignments-banner-card">
        <div className="banner-left">
          <div className="banner-icon-bg">
            <FileText size={32} />
          </div>
          <div className="banner-info">
            <h2>Assignments</h2>
            <p>Create, manage and track all your class assignments.</p>
          </div>
        </div>

        {/* Stats card */}
        <div className="banner-stats-card">
          <span className="stats-label">Total Assignments</span>
          <span className="stats-value">{totalCount}</span>
          <div className="stats-pill">
            <span>{draftCount} Drafts • {publishedCount} Published</span>
          </div>
        </div>

        {/* Floating clipboard deco */}
        <div className="banner-deco-floating">
          <div className="clipboard-3d">📋</div>
          <Sparkles className="sparkle-one" size={16} />
          <Sparkles className="sparkle-two" size={12} />
        </div>
      </div>

      {/* 2. Main Page Grid */}
      <div className="assignments-page-grid">
        
        {/* Left Column: Upcoming Assignments list */}
        <div className="assignments-main-column">
          <div className="column-header">
            <div className="header-title-block">
              <Calendar size={20} className="header-icon" />
              <h3>Your Assignments</h3>
            </div>
            {displayAssignments.length > 0 && (
              <button className="text-action-link">View All &gt;</button>
            )}
          </div>

          {isLoading ? (
            <div className="column-loading">Loading assignments...</div>
          ) : displayAssignments.length === 0 ? (
            <div className="column-empty-state">
              <FolderOpen size={48} className="empty-icon" />
              <p>No assignments found.</p>
              <span>Click "Create New Assignment" on the right to start.</span>
            </div>
          ) : (
            <div className="upcoming-list">
              {displayAssignments.map((ass) => {
                const meta = getSubjectMeta('', ass.course_title);
                const daysLeft = getDaysLeft(ass.available_until);
                const isOverdue = daysLeft === 'Overdue';
                const isDraft = ass.status === 'draft';

                return (
                  <div 
                    key={ass.id} 
                    className={`upcoming-card hover-lift ${meta.class}`}
                    onClick={() => navigate(`/professor/courses/${ass.course_id}/tests`)}
                  >
                    <div className="card-left-section">
                      <div className="subject-badge-icon">
                        {meta.icon}
                      </div>
                      <div className="card-details">
                        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                          <h4>{ass.title}</h4>
                          <span style={{fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', background: isDraft ? '#f1f3f4' : '#e6f4ea', color: isDraft ? '#5f6368' : '#1e8e3e'}}>
                            {isDraft ? 'DRAFT' : 'PUBLISHED'}
                          </span>
                        </div>
                        <span className="card-course-title">{ass.course_title}</span>
                      </div>
                    </div>

                    <div className="card-right-section">
                      <div className="card-dates-info">
                        <span className="due-date-text">{isDraft ? 'Not Published' : formatDate(ass.available_until)}</span>
                        {!isDraft && (
                          <span className={`days-left-tag ${isOverdue ? 'overdue' : ''}`}>
                            {daysLeft}
                          </span>
                        )}
                      </div>
                      <ChevronRight size={18} className="chevron-icon" />
                    </div>
                  </div>
                );
              })}

              <button 
                className="view-all-upcoming-btn"
                onClick={() => {
                  if (displayAssignments.length > 0) {
                    navigate(`/professor/courses/${displayAssignments[0].course_id}/tests`);
                  }
                }}
              >
                View All Assignments &gt;
              </button>
            </div>
          )}
        </div>

        {/* Right Column: CTA and Published List */}
        <div className="assignments-sidebar-column">
          
          {/* Create Assignment CTA */}
          <div className="create-cta-card">
            <div className="sidebar-header">
              <PenTool size={16} className="sidebar-header-icon" />
              <h4>Create an Assignment</h4>
            </div>

            <div className="cta-dashed-box" onClick={() => setShowModal(true)}>
              <div className="cta-plus-icon">
                <Plus size={20} />
              </div>
              <span className="cta-text">Create New Assignment</span>
            </div>
          </div>

          {/* Assignments summary list */}
          <div className="published-summary-card">
            <div className="sidebar-header-row">
              <div className="sidebar-header">
                <Send size={16} className="sidebar-header-icon" />
                <h4>Course Assignments</h4>
              </div>
              {courseAssignmentCounts.length > 0 && (
                <button className="text-action-link">View All &gt;</button>
              )}
            </div>

            {isLoading ? (
              <div className="sidebar-loading">Loading list...</div>
            ) : courseAssignmentCounts.length === 0 ? (
              <div className="sidebar-empty-state">
                <p>No published courses yet.</p>
              </div>
            ) : (
              <div className="published-courses-list">
                {courseAssignmentCounts.map((course) => (
                  <div 
                    key={course.id} 
                    className={`published-course-item hover-lift ${course.themeClass}`}
                    onClick={() => navigate(`/professor/courses/${course.id}/tests`)}
                  >
                    <div className="item-left">
                      <div className="course-icon-badge">{course.icon}</div>
                      <span className="course-item-title">{course.title}</span>
                    </div>
                    <div className="item-right">
                      <span className="published-count-badge">{course.count}</span>
                      <ChevronRight size={16} className="chevron-icon" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* 3. Create Assignment Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-container animate-in zoom-in-95 duration-200">
            <div className="modal-header">
              <h3>Create New Assignment</h3>
              <button onClick={() => setShowModal(false)} className="modal-close-btn">&times;</button>
            </div>
            
            <form onSubmit={handleCreateAssignment}>
              <div className="modal-body">
                
                {/* Course Selection */}
                <div className="form-group mb-4">
                  <label htmlFor="selectCourse">Select Class</label>
                  {courses.length === 0 ? (
                    <div className="no-courses-warning">
                      You must create a class before adding assignments!
                    </div>
                  ) : (
                    <select 
                      id="selectCourse" 
                      required 
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      className="modal-select"
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} ({c.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Assignment Title */}
                <div className="form-group mb-4">
                  <label htmlFor="assTitle">Assignment Title</label>
                  <input 
                    type="text" 
                    id="assTitle" 
                    required 
                    placeholder="e.g. Quadratic Equations Worksheet"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="modal-input"
                  />
                </div>

                {/* Description */}
                <div className="form-group mb-4">
                  <label htmlFor="assDesc">Description / Instructions</label>
                  <textarea 
                    id="assDesc" 
                    required
                    placeholder="Provide details about the assignment tasks, grading criteria, and steps to complete..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="modal-input"
                    rows={4}
                  />
                </div>

                {/* Due Date */}
                <div className="form-group mb-4">
                  <label htmlFor="dueDate">Due Date & Time</label>
                  <input 
                    type="datetime-local" 
                    id="dueDate" 
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="modal-input"
                  />
                </div>

                {/* Double Column Settings */}
                <div className="form-row-grid">
                  <div className="form-group">
                    <label htmlFor="duration">Duration (Minutes)</label>
                    <input 
                      type="number" 
                      id="duration" 
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                      className="modal-input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="passing">Passing Percentage (%)</label>
                    <input 
                      type="number" 
                      id="passing" 
                      min={0}
                      max={100}
                      value={passingPercentage}
                      onChange={(e) => setPassingPercentage(parseInt(e.target.value))}
                      className="modal-input"
                    />
                  </div>
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
                  disabled={courses.length === 0}
                  className="modal-btn-submit"
                >
                  Create Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
