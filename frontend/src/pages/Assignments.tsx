import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Plus, 
  Calendar, 
  ChevronRight, 
  PenTool, 
  Send,
  Sparkles,
  FolderOpen
} from 'lucide-react';
import { testsApi, coursesApi } from '../api';
import { useAuthStore } from '../store/authStore';

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
        bg: 'bg-[#FFD166]'
      };
    }
    if (cleanCode.includes('PHY') || cleanTitle.includes('physic')) {
      return {
        icon: '⚛',
        bg: 'bg-[#EF476F]'
      };
    }
    if (cleanCode.includes('CSE') || cleanCode.includes('CS') || cleanTitle.includes('comput') || cleanTitle.includes('data')) {
      return {
        icon: '⟨/⟩',
        bg: 'bg-[#118AB2]'
      };
    }
    return {
      icon: '📝',
      bg: 'bg-[#06D6A0]'
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
        bg: meta.bg,
        icon: meta.icon
      };
    }).filter(c => c.count > 0);
  }, [courses, assignments]);

  return (
    <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] p-6 lg:p-8 space-y-8">
      
      {/* 1. Header Banner */}
      <div className="bg-[#EF476F] border-[3px] border-[#0A0A0A] rounded-3xl p-8 lg:p-10 shadow-[8px_8px_0_#0A0A0A] flex flex-col md:flex-row justify-between items-center relative overflow-hidden group">
        <div className="relative z-10 flex items-center gap-6">
          <div className="w-20 h-20 bg-white border-[3px] border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] flex items-center justify-center">
            <FileText size={40} className="text-[#0A0A0A] stroke-[2px]" />
          </div>
          <div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tight">Assignments</h2>
            <p className="text-lg font-bold font-['Inter'] text-white/90 mt-2">Create, manage and track all your class assignments.</p>
          </div>
        </div>

        {/* Stats card */}
        <div className="relative z-10 mt-6 md:mt-0 bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[6px_6px_0_#0A0A0A] flex flex-col items-center min-w-[200px]">
          <span className="text-sm font-black uppercase tracking-widest text-[#0A0A0A]/60">Total Assignments</span>
          <span className="text-5xl font-black text-[#0A0A0A] my-2">{totalCount}</span>
          <span className="px-3 py-1 bg-gray-100 border-2 border-[#0A0A0A] rounded font-black uppercase tracking-widest text-[10px]">
            {draftCount} Drafts • {publishedCount} Published
          </span>
        </div>

        {/* Floating clipboard deco */}
        <div className="absolute right-0 bottom-0 md:static mt-8 md:mt-0 opacity-20 md:opacity-100 transform translate-x-1/4 translate-y-1/4 md:translate-x-0 md:translate-y-0">
          <div className="text-[120px] filter drop-shadow-[4px_4px_0_#0A0A0A] group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500">📋</div>
          <Sparkles className="absolute top-0 right-0 text-[#FFD166]" size={32} />
        </div>
      </div>

      {/* 2. Main Page Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Upcoming Assignments list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b-[3px] border-[#0A0A0A]/10">
            <div className="flex items-center gap-3">
              <Calendar size={28} className="stroke-[3px]" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Your Assignments</h3>
            </div>
            {displayAssignments.length > 0 && (
              <button className="text-sm font-black uppercase tracking-widest text-[#118AB2] hover:underline">View All &gt;</button>
            )}
          </div>

          {isLoading ? (
            <div className="py-12 flex items-center justify-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Loading assignments...</div>
          ) : displayAssignments.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 text-[#0A0A0A]/50">
              <FolderOpen size={48} className="stroke-[1.5px]" />
              <p className="font-bold uppercase tracking-widest">No assignments found.</p>
              <span className="text-sm font-['Inter']">Click "Create New Assignment" on the right to start.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {displayAssignments.map((ass) => {
                const meta = getSubjectMeta('', ass.course_title);
                const daysLeft = getDaysLeft(ass.available_until);
                const isOverdue = daysLeft === 'Overdue';
                const isDraft = ass.status === 'draft';

                return (
                  <div 
                    key={ass.id} 
                    className={`${meta.bg} border-[3px] border-[#0A0A0A] rounded-2xl p-4 sm:p-6 shadow-[6px_6px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[8px_8px_0_#0A0A0A] transition-all cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group`}
                    onClick={() => navigate(`/professor/courses/${ass.course_id}/tests`)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[4px_4px_0_#0A0A0A] text-2xl font-black text-[#0A0A0A] shrink-0">
                        {meta.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-xl font-black uppercase tracking-tight text-[#0A0A0A] line-clamp-1">{ass.title}</h4>
                          <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-[#0A0A0A] rounded shadow-[2px_2px_0_#0A0A0A] ${isDraft ? 'bg-gray-100 text-[#0A0A0A]' : 'bg-[#06D6A0] text-[#0A0A0A]'}`}>
                            {isDraft ? 'DRAFT' : 'PUBLISHED'}
                          </span>
                        </div>
                        <span className="text-sm font-bold uppercase tracking-widest text-[#0A0A0A]/70">{ass.course_title}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full sm:w-auto gap-6 sm:gap-4 bg-white/50 sm:bg-transparent p-3 sm:p-0 border-2 border-[#0A0A0A] sm:border-0 rounded-xl sm:rounded-none mt-4 sm:mt-0">
                      <div className="flex flex-col sm:items-end">
                        <span className="text-sm font-bold font-['Inter'] text-[#0A0A0A]">{isDraft ? 'Not Published' : formatDate(ass.available_until)}</span>
                        {!isDraft && (
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-2 border-[#0A0A0A] rounded mt-1 shadow-[2px_2px_0_#0A0A0A] ${isOverdue ? 'bg-[#EF476F] text-white' : 'bg-white text-[#0A0A0A]'}`}>
                            {daysLeft}
                          </span>
                        )}
                      </div>
                      <div className="w-10 h-10 bg-white border-[3px] border-[#0A0A0A] rounded-lg flex items-center justify-center shadow-[4px_4px_0_#0A0A0A] group-hover:bg-[#0A0A0A] group-hover:text-white transition-colors">
                        <ChevronRight size={20} className="stroke-[3px]" />
                      </div>
                    </div>
                  </div>
                );
              })}

              <button 
                className="w-full py-4 bg-white border-[3px] border-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-sm shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all mt-4"
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
        <div className="space-y-8">
          
          {/* Create Assignment CTA */}
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A]">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <PenTool size={20} className="stroke-[3px]" />
              <h4 className="text-xl font-black uppercase tracking-tight">Create</h4>
            </div>

            <div 
              className="border-[3px] border-dashed border-[#0A0A0A]/30 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[#0A0A0A] hover:bg-[#FFD166]/20 transition-all group" 
              onClick={() => setShowModal(true)}
            >
              <div className="w-16 h-16 bg-white border-[3px] border-[#0A0A0A] rounded-full flex items-center justify-center mb-4 shadow-[4px_4px_0_#0A0A0A] group-hover:scale-110 transition-transform">
                <Plus size={32} className="text-[#0A0A0A] stroke-[3px]" />
              </div>
              <span className="text-lg font-black uppercase tracking-tight text-[#0A0A0A] text-center">Create New Assignment</span>
            </div>
          </div>

          {/* Assignments summary list */}
          <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-6 shadow-[8px_8px_0_#0A0A0A]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <div className="flex items-center gap-2">
                <Send size={20} className="stroke-[3px]" />
                <h4 className="text-xl font-black uppercase tracking-tight">By Course</h4>
              </div>
              {courseAssignmentCounts.length > 0 && (
                <button className="text-xs font-black uppercase tracking-widest text-[#118AB2] hover:underline">View All &gt;</button>
              )}
            </div>

            {isLoading ? (
              <div className="py-8 text-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest text-sm">Loading list...</div>
            ) : courseAssignmentCounts.length === 0 ? (
              <div className="py-8 text-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest text-sm">
                <p>No published courses yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {courseAssignmentCounts.map((course) => (
                  <div 
                    key={course.id} 
                    className={`${course.bg} border-2 border-[#0A0A0A] rounded-xl p-3 shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] transition-all cursor-pointer flex justify-between items-center group`}
                    onClick={() => navigate(`/professor/courses/${course.id}/tests`)}
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-10 h-10 bg-white border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center text-lg font-black shrink-0 shadow-[2px_2px_0_#0A0A0A]">
                        {course.icon}
                      </div>
                      <span className="font-black uppercase tracking-tight text-sm truncate">{course.title}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="w-8 h-8 bg-white border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center font-black shadow-[2px_2px_0_#0A0A0A]">
                        {course.count}
                      </span>
                      <ChevronRight size={18} className="stroke-[3px] opacity-50 group-hover:opacity-100 transition-opacity" />
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
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[4px] border-[#0A0A0A] rounded-3xl p-8 max-w-lg w-full shadow-[12px_12px_0_#0A0A0A] animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black uppercase tracking-tight">Create New Assignment</h3>
              <button 
                onClick={() => setShowModal(false)} 
                className="w-10 h-10 bg-gray-100 border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center text-2xl font-black shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleCreateAssignment}>
              <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
                
                {/* Course Selection */}
                <div className="space-y-2">
                  <label htmlFor="selectCourse" className="text-sm font-black uppercase tracking-widest">Select Class</label>
                  {courses.length === 0 ? (
                    <div className="p-4 bg-[#FFD166]/20 border-2 border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A]">
                      You must create a class before adding assignments!
                    </div>
                  ) : (
                    <select 
                      id="selectCourse" 
                      required 
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#EF476F]/20 transition-all appearance-none cursor-pointer"
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
                <div className="space-y-2">
                  <label htmlFor="assTitle" className="text-sm font-black uppercase tracking-widest">Assignment Title</label>
                  <input 
                    type="text" 
                    id="assTitle" 
                    required 
                    placeholder="e.g. Quadratic Equations Worksheet"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#EF476F]/20 transition-all"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label htmlFor="assDesc" className="text-sm font-black uppercase tracking-widest">Description / Instructions</label>
                  <textarea 
                    id="assDesc" 
                    required
                    placeholder="Provide details about the assignment tasks, grading criteria, and steps to complete..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#EF476F]/20 transition-all resize-y min-h-[100px]"
                    rows={4}
                  />
                </div>

                {/* Due Date */}
                <div className="space-y-2">
                  <label htmlFor="dueDate" className="text-sm font-black uppercase tracking-widest">Due Date & Time</label>
                  <input 
                    type="datetime-local" 
                    id="dueDate" 
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#EF476F]/20 transition-all cursor-pointer"
                  />
                </div>

                {/* Double Column Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="duration" className="text-sm font-black uppercase tracking-widest">Duration (Min)</label>
                    <input 
                      type="number" 
                      id="duration" 
                      min={5}
                      max={180}
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                      className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#EF476F]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="passing" className="text-sm font-black uppercase tracking-widest">Passing (%)</label>
                    <input 
                      type="number" 
                      id="passing" 
                      min={0}
                      max={100}
                      value={passingPercentage}
                      onChange={(e) => setPassingPercentage(parseInt(e.target.value))}
                      className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#EF476F]/20 transition-all"
                    />
                  </div>
                </div>

              </div>

              <div className="flex gap-4 pt-6 mt-4 border-t-[3px] border-[#0A0A0A]/10">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="flex-1 py-4 px-4 bg-white border-[3px] border-[#0A0A0A] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={courses.length === 0}
                  className="flex-1 py-4 px-4 bg-[#EF476F] border-[3px] border-[#0A0A0A] text-white rounded-xl font-black uppercase tracking-widest shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
