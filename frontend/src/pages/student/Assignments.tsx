import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  FileText, 
  Plus, 
  Calendar, 
  ChevronRight, 
  PenTool, 
  Send,
  FolderOpen
} from 'lucide-react';
import { testsApi, coursesApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';

export default function Assignments() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const addToast = useToastStore(state => state.addToast);
  // Inside a course (its Tests tab) only that course's tests are listed
  const { courseId: scopedCourseId } = useParams();

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
  }, [token, scopedCourseId]);

  const loadData = async () => {
    if (!token) return;
    setIsLoading(true);

    let coursesList: any[] = [];
    try {
      const coursesRes = await coursesApi.list();
      coursesList = (coursesRes.data || []).filter((c: any) => !scopedCourseId || c.id === scopedCourseId);
      setCourses(coursesList);
      if (coursesList.length > 0) {
        setCourseId(coursesList[0].id);
      }
    } catch (err) {
      console.error('Error loading courses:', err);
    }

    try {
      let testsRes;
      if (user?.role === 'professor') {
        testsRes = await testsApi.listAllProfessorTests();
        const allTests = testsRes.data?.tests || [];
        const filteredAssignments = allTests.filter((t: any) => t.test_type === 'assignment');
        setAssignments(filteredAssignments);
      } else if (coursesList.length > 0) {
        // Fetch assignments for ALL enrolled courses for students
        const allTestsPromises = coursesList.map((c: any) => testsApi.getByCourse(c.id));
        const results = await Promise.all(allTestsPromises);
        // Students have no other page listing tests, so show every published test (quiz, exam, assignment)
        // the student list omits course_id; the per-course counts need it
        const allTests = results.flatMap((r: any, i: number) =>
          (r.data || []).map((t: any) => ({ ...t, course_id: t.course_id ?? coursesList[i].id })));
        setAssignments(allTests);
      } else {
        setAssignments([]);
      }
    } catch (err) {
      console.error('Error loading tests:', err);
      setAssignments([]);
    }

    setIsLoading(false);
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      addToast('Please select a course.', 'error');
      return;
    }

    try {
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
      
      loadData();
    } catch (err) {
      console.error('Failed to create assignment:', err);
      addToast('Failed to create assignment', 'error');
    }
  };

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

  const getDaysLeft = (dateStr: string) => {
    if (!dateStr) return '';
    const diffTime = new Date(dateStr).getTime() - new Date().getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Due today';
    return `${diffDays} Days Left`;
  };

  const totalCount = assignments.length;
  const publishedAssignments = useMemo(() => assignments.filter(a => a.status === 'published'), [assignments]);
  const draftAssignments = useMemo(() => assignments.filter(a => a.status === 'draft'), [assignments]);
  
  const displayAssignments = useMemo(() => {
    return [...assignments].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'draft' ? -1 : 1;
      if (!a.available_until) return 1;
      if (!b.available_until) return -1;
      return new Date(a.available_until).getTime() - new Date(b.available_until).getTime();
    });
  }, [assignments]);

  const draftCount = draftAssignments.length;
  const publishedCount = publishedAssignments.length;

  const courseAssignmentCounts = useMemo(() => {
    return courses.map(c => {
      const count = assignments.filter(a => a.course_id === c.id).length;
      return {
        id: c.id,
        title: c.title,
        code: c.code,
        count
      };
    }).filter(c => c.count > 0);
  }, [courses, assignments]);

  return (
    <div className="w-full px-5 md:px-8 lg:px-12">
      <div className={`max-w-6xl mx-auto ${scopedCourseId ? 'py-8' : 'pt-10 md:pt-14 pb-24'} space-y-12`}>

        {/* Header (the course page already has one) */}
        {!scopedCourseId && (
          <PageHeader
            title="assignments"
            lead="Tests and assignments from all your classes, soonest due first."
            actions={<span className="annot text-ink-3 tabular">{publishedCount} published · {totalCount} total</span>}
          />
        )}
        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Main List */}
          <div className={`${scopedCourseId ? 'lg:col-span-3' : 'lg:col-span-2'} space-y-6`}>
            <h2 className="font-display text-2xl tracking-[-0.03em] pb-3 border-b border-ink">{scopedCourseId ? 'tests in this course' : 'your tests'}</h2>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-ink-3">
                <div className="w-6 h-6 border-2 border-line border-t-accent rounded-full animate-spin mb-4" />
                <span className="text-sm tracking-wide">Loading assignments...</span>
              </div>
            ) : displayAssignments.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-ink-4 border border-line rounded-2xl bg-surface">
                <FolderOpen size={32} className="mb-4" />
                <p className="text-sm tracking-wide">No tests yet. Your professor has not published any.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayAssignments.map((ass) => {
                  const daysLeft = getDaysLeft(ass.available_until);
                  const isOverdue = daysLeft === 'Overdue';
                  const isDraft = ass.status === 'draft';

                  return (
                    <Card 
                      key={ass.id} 
                      variant="hoverable"
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5"
                      onClick={() => navigate(user?.role === 'professor' ? `/courses/${ass.course_id}/tests` : `/tests/${ass.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl border border-line bg-sunken flex items-center justify-center text-ink-3 shrink-0 group-hover:text-ink transition-colors">
                          <FileText size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="text-lg font-light text-ink tracking-wide">{ass.title}</h4>
                            <span className={`px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-md border ${
                              isDraft ? 'bg-sunken border-line-strong text-ink-3' : 'bg-sunken border-line-strong text-ink'
                            }`}>
                              {isDraft ? 'DRAFT' : 'PUBLISHED'}
                            </span>
                          </div>
                          <span className="text-sm text-ink-3 tracking-wide">{ass.course_title}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-ink-3 mb-1">{isDraft ? 'Not Published' : formatDate(ass.available_until)}</div>
                          {!isDraft && (
                            <span className={`text-xs ${isOverdue ? 'text-red-600' : 'text-ink'}`}>
                              {daysLeft}
                            </span>
                          )}
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-ink-4 group-hover:text-ink group-hover:bg-sunken-2 transition-all">
                          <ChevronRight size={18} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className={`space-y-8 ${scopedCourseId ? 'hidden' : ''}`}>
            
            {/* Create Action */}
            {user?.role === 'professor' && (
              <Card>
                <CardContent>
                  <div className="flex items-center gap-2 text-ink-3 mb-6">
                    <PenTool size={16} />
                    <h4 className="text-sm font-outfit font-medium tracking-widest uppercase text-ink">Create</h4>
                  </div>

                <button 
                  onClick={() => setShowModal(true)}
                  className="w-full flex flex-col items-center justify-center py-10 px-6 border border-dashed border-line-strong rounded-xl hover:border-accent hover:bg-sunken transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-sunken border border-line-strong flex items-center justify-center mb-4 group-hover:border-accent transition-colors">
                    <Plus size={20} className="text-ink-3 group-hover:text-ink" />
                  </div>
                  <span className="text-sm text-ink font-medium tracking-wide">New Assignment</span>
                </button>
                </CardContent>
              </Card>
            )}

            {/* By Course Summary */}
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 text-ink-3 mb-6">
                  <Send size={16} />
                  <h4 className="text-sm font-outfit font-medium tracking-widest uppercase text-ink">By Course</h4>
                </div>

              {isLoading ? (
                <div className="py-8 text-center text-ink-4 text-sm">Loading list...</div>
              ) : courseAssignmentCounts.length === 0 ? (
                <div className="py-8 text-center text-ink-4 text-sm">No courses yet.</div>
              ) : (
                <div className="space-y-2">
                  {courseAssignmentCounts.map((course) => (
                    <div 
                      key={course.id} 
                      className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-line hover:bg-surface transition-all cursor-pointer"
                      onClick={() => navigate(`/courses/${course.id}/tests`)}
                    >
                      <span className="text-sm text-ink tracking-wide truncate">{course.title}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink-3">{course.count} total</span>
                        <ChevronRight size={14} className="text-ink-4 group-hover:text-ink transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="p-8 max-w-lg w-full shadow-2xl">
            
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-outfit font-light text-ink tracking-wide">Create Assignment</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="text-ink-3 hover:text-ink transition-colors"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateAssignment} className="space-y-5">
              
              <div className="space-y-2">
                <label className="text-xs text-ink-3 uppercase tracking-widest">Select Class</label>
                <select 
                  required 
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full px-4 py-3 bg-sunken border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-accent transition-colors appearance-none cursor-pointer"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-ink-3 uppercase tracking-widest">Assignment Title</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Quadratic Equations Worksheet"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-sunken border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-ink-3 uppercase tracking-widest">Description</label>
                <textarea 
                  required
                  placeholder="Task details and instructions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-sunken border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-accent transition-colors resize-none"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-ink-3 uppercase tracking-widest">Due Date</label>
                <input 
                  type="datetime-local" 
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-3 bg-sunken border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-ink-3 uppercase tracking-widest">Duration (Min)</label>
                  <input 
                    type="number" 
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-sunken border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-ink-3 uppercase tracking-widest">Passing (%)</label>
                  <input 
                    type="number" 
                    min={0}
                    max={100}
                    value={passingPercentage}
                    onChange={(e) => setPassingPercentage(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-sunken border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4 mt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={courses.length === 0}>
                  Create
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

    </div>
  );
}
