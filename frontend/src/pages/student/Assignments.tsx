import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function Assignments() {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const addToast = useToastStore(state => state.addToast);

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

    let coursesList: any[] = [];
    try {
      const coursesRes = await coursesApi.list();
      coursesList = coursesRes.data || [];
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
        const allTests = results.flatMap((r: any) => r.data || []);
        const filteredAssignments = allTests.filter((t: any) => t.test_type === 'assignment');
        setAssignments(filteredAssignments);
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
    <div className="min-h-screen bg-black text-white p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#1A1A1A]">
          <div>
            <h1 className="text-4xl font-outfit font-light text-white tracking-tight mb-2">
              Assignments
            </h1>
            <p className="text-sm text-[#888888] font-medium tracking-wide">
              Create, manage, and track class assignments.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="text-right">
              <div className="text-sm text-[#A3A3A3] tracking-wide mb-1 uppercase">Total</div>
              <div className="text-2xl font-light text-white">{totalCount}</div>
            </div>
            <div className="w-px h-12 bg-[#1A1A1A]" />
            <div className="text-right">
              <div className="text-sm text-[#A3A3A3] tracking-wide mb-1 uppercase">Published</div>
              <div className="text-2xl font-light text-white">{publishedCount}</div>
            </div>
          </div>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          
          {/* Main List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3 text-[#888888] mb-6">
              <Calendar size={18} />
              <h3 className="text-sm font-outfit font-medium tracking-widest uppercase text-white">Your Assignments</h3>
            </div>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-[#888888]">
                <div className="w-6 h-6 border-2 border-[#1A1A1A] border-t-white rounded-full animate-spin mb-4" />
                <span className="text-sm tracking-wide">Loading assignments...</span>
              </div>
            ) : displayAssignments.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center text-[#444444] border border-[#1A1A1A] rounded-2xl bg-[#050505]">
                <FolderOpen size={32} className="mb-4" />
                <p className="text-sm tracking-wide">No assignments found.</p>
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
                      onClick={() => navigate(user?.role === 'professor' ? `/professor/courses/${ass.course_id}/tests` : `/tests/${ass.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl border border-[#1A1A1A] bg-[#111111] flex items-center justify-center text-[#888888] shrink-0 group-hover:text-white transition-colors">
                          <FileText size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="text-lg font-light text-white tracking-wide">{ass.title}</h4>
                            <span className={`px-2 py-0.5 text-[10px] uppercase tracking-widest rounded-md border ${
                              isDraft ? 'bg-[#111111] border-[#333333] text-[#888888]' : 'bg-[#111111] border-[#333333] text-white'
                            }`}>
                              {isDraft ? 'DRAFT' : 'PUBLISHED'}
                            </span>
                          </div>
                          <span className="text-sm text-[#A3A3A3] tracking-wide">{ass.course_title}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-[#888888] mb-1">{isDraft ? 'Not Published' : formatDate(ass.available_until)}</div>
                          {!isDraft && (
                            <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-white'}`}>
                              {daysLeft}
                            </span>
                          )}
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#444444] group-hover:text-white group-hover:bg-[#1A1A1A] transition-all">
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
          <div className="space-y-8">
            
            {/* Create Action */}
            {user?.role === 'professor' && (
              <Card>
                <CardContent>
                  <div className="flex items-center gap-2 text-[#888888] mb-6">
                    <PenTool size={16} />
                    <h4 className="text-sm font-outfit font-medium tracking-widest uppercase text-white">Create</h4>
                  </div>

                <button 
                  onClick={() => setShowModal(true)}
                  className="w-full flex flex-col items-center justify-center py-10 px-6 border border-dashed border-[#333333] rounded-xl hover:border-white hover:bg-[#111111] transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-[#111111] border border-[#333333] flex items-center justify-center mb-4 group-hover:border-white transition-colors">
                    <Plus size={20} className="text-[#888888] group-hover:text-white" />
                  </div>
                  <span className="text-sm text-white font-medium tracking-wide">New Assignment</span>
                </button>
                </CardContent>
              </Card>
            )}

            {/* By Course Summary */}
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 text-[#888888] mb-6">
                  <Send size={16} />
                  <h4 className="text-sm font-outfit font-medium tracking-widest uppercase text-white">By Course</h4>
                </div>

              {isLoading ? (
                <div className="py-8 text-center text-[#444444] text-sm">Loading list...</div>
              ) : courseAssignmentCounts.length === 0 ? (
                <div className="py-8 text-center text-[#444444] text-sm">No courses yet.</div>
              ) : (
                <div className="space-y-2">
                  {courseAssignmentCounts.map((course) => (
                    <div 
                      key={course.id} 
                      className="group flex items-center justify-between p-3 rounded-lg border border-transparent hover:border-[#1A1A1A] hover:bg-[#050505] transition-all cursor-pointer"
                      onClick={() => navigate(user?.role === 'professor' ? `/professor/courses/${course.id}/tests` : `/student/courses/${course.id}`)}
                    >
                      <span className="text-sm text-white tracking-wide truncate">{course.title}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#888888]">{course.count} total</span>
                        <ChevronRight size={14} className="text-[#444444] group-hover:text-white transition-colors" />
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="p-8 max-w-lg w-full shadow-2xl">
            
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-outfit font-light text-white tracking-wide">Create Assignment</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="text-[#A3A3A3] hover:text-white transition-colors"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateAssignment} className="space-y-5">
              
              <div className="space-y-2">
                <label className="text-xs text-[#888888] uppercase tracking-widest">Select Class</label>
                <select 
                  required 
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-white text-sm focus:outline-none focus:border-white transition-colors appearance-none cursor-pointer"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#888888] uppercase tracking-widest">Assignment Title</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Quadratic Equations Worksheet"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-white text-sm focus:outline-none focus:border-white transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#888888] uppercase tracking-widest">Description</label>
                <textarea 
                  required
                  placeholder="Task details and instructions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-white text-sm focus:outline-none focus:border-white transition-colors resize-none"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-[#888888] uppercase tracking-widest">Due Date</label>
                <input 
                  type="datetime-local" 
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-white text-sm focus:outline-none focus:border-white transition-colors"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-[#888888] uppercase tracking-widest">Duration (Min)</label>
                  <input 
                    type="number" 
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-white text-sm focus:outline-none focus:border-white transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-[#888888] uppercase tracking-widest">Passing (%)</label>
                  <input 
                    type="number" 
                    min={0}
                    max={100}
                    value={passingPercentage}
                    onChange={(e) => setPassingPercentage(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-white text-sm focus:outline-none focus:border-white transition-colors"
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
