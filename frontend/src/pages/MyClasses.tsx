import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  GraduationCap, 
  ChevronRight, 
  Plus, 
  BookOpen, 
  Users, 
  FolderOpen,
  Search,
  Mail,
  Flag,
  ArrowRight
} from 'lucide-react';
import { coursesApi } from '../api';
import { useAuthStore } from '../store/authStore';

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
        bg: 'bg-[#FFD166]'
      };
    }
    if (cleanCode.includes('PHY') || cleanTitle.includes('physic')) {
      return {
        category: 'Physics',
        icon: '⚛',
        bg: 'bg-[#EF476F]'
      };
    }
    if (cleanCode.includes('CSE') || cleanCode.includes('CS') || cleanTitle.includes('comput') || cleanTitle.includes('data')) {
      return {
        category: 'Computer Science',
        icon: '⟨/⟩',
        bg: 'bg-[#118AB2]'
      };
    }
    return {
      category: cleanCode || 'General',
      icon: '📖',
      bg: 'bg-[#06D6A0]'
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
        bg: meta.bg
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
    <div className="min-h-screen bg-[#FCFCFC] font-['Outfit'] text-[#0A0A0A] p-6 lg:p-8 space-y-8">
      
      {/* 1. Header Banner */}
      <div className="bg-[#06D6A0] border-[3px] border-[#0A0A0A] rounded-3xl p-8 lg:p-10 shadow-[8px_8px_0_#0A0A0A] flex flex-col md:flex-row justify-between items-center relative overflow-hidden group">
        <div className="relative z-10 flex items-center gap-6">
          <div className="w-20 h-20 bg-white border-[3px] border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] flex items-center justify-center">
            <GraduationCap size={40} className="text-[#0A0A0A] stroke-[2px]" />
          </div>
          <div>
            <h2 className="text-4xl font-black text-[#0A0A0A] uppercase tracking-tight">Classes & Students</h2>
            <p className="text-lg font-bold font-['Inter'] text-[#0A0A0A]/80 mt-2">Manage your active courses and track student performance.</p>
          </div>
        </div>
        
        {/* Banner Stats Card */}
        <div className="relative z-10 mt-6 md:mt-0 bg-white border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[6px_6px_0_#0A0A0A] flex flex-col items-center min-w-[200px]">
          <span className="text-sm font-black uppercase tracking-widest text-[#0A0A0A]/60">Total Classes</span>
          <span className="text-5xl font-black text-[#0A0A0A] my-2">{courses.length}</span>
          <span className="text-sm font-bold uppercase tracking-widest text-[#118AB2]">{students.length} Students Enrolled</span>
        </div>
      </div>

      {/* 2. Beautiful Tab Switcher Switch */}
      <div className="flex flex-col sm:flex-row gap-4">
        <button 
          className={`flex-1 flex items-center justify-center gap-3 py-4 border-[3px] border-[#0A0A0A] rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${activeTab === 'classes' ? 'bg-[#0A0A0A] text-white shadow-[6px_6px_0_#FFD166]' : 'bg-white text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A]'}`}
          onClick={() => handleTabChange('classes')}
        >
          <BookOpen size={20} className={activeTab === 'classes' ? 'stroke-white' : 'stroke-[#0A0A0A]'} />
          <span>Active Classes ({courses.length})</span>
        </button>
        <button 
          className={`flex-1 flex items-center justify-center gap-3 py-4 border-[3px] border-[#0A0A0A] rounded-2xl font-black uppercase tracking-widest text-sm transition-all ${activeTab === 'students' ? 'bg-[#0A0A0A] text-white shadow-[6px_6px_0_#118AB2]' : 'bg-white text-[#0A0A0A] shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A]'}`}
          onClick={() => handleTabChange('students')}
        >
          <Users size={20} className={activeTab === 'students' ? 'stroke-white' : 'stroke-[#0A0A0A]'} />
          <span>Student Roster ({students.length})</span>
        </button>
      </div>

      {/* 3. Main Views depending on activeTab */}
      {activeTab === 'classes' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Side: Active Classes List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b-[3px] border-[#0A0A0A]/10">
              <BookOpen size={28} className="stroke-[3px]" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Active Classes</h3>
            </div>

            {isLoading ? (
              <div className="py-12 flex items-center justify-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Loading classes...</div>
            ) : activeClasses.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4 text-[#0A0A0A]/50">
                <FolderOpen size={48} className="stroke-[1.5px]" />
                <p className="font-bold uppercase tracking-widest">No active classes found.</p>
                <span className="text-sm font-['Inter']">Click "Add New Class" on the right to get started.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeClasses.map((course) => (
                  <div 
                    key={course.id} 
                    className={`${course.bg} border-[3px] border-[#0A0A0A] rounded-2xl p-6 shadow-[6px_6px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[8px_8px_0_#0A0A0A] transition-all cursor-pointer flex flex-col group`}
                    onClick={() => navigate(`/professor/courses/${course.id}`)}
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="w-14 h-14 bg-white border-[3px] border-[#0A0A0A] rounded-xl flex items-center justify-center shadow-[4px_4px_0_#0A0A0A] text-2xl font-black text-[#0A0A0A]">
                        {course.icon}
                      </div>
                      <span className={`px-3 py-1 text-xs font-black uppercase tracking-widest border-2 border-[#0A0A0A] rounded-lg bg-white text-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]`}>
                        {course.docsCount > 0 ? 'AI Trained' : 'No Materials'}
                      </span>
                    </div>
                    
                    <div className="mb-6 flex-1">
                      <span className="inline-block px-2 py-1 bg-[#0A0A0A] text-white text-[10px] font-black uppercase tracking-widest rounded mb-2">
                        {course.category}
                      </span>
                      <h4 className="text-xl font-black uppercase tracking-tight text-[#0A0A0A] line-clamp-2">{course.title}</h4>
                    </div>

                    <div className="flex items-center justify-between text-[#0A0A0A] font-bold text-sm bg-white/50 p-3 border-2 border-[#0A0A0A] rounded-xl">
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1.5" title="Documents">
                          <FolderOpen size={16} className="stroke-[2.5px]" />
                          <span>{course.docsCount}</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Students">
                          <Users size={16} className="stroke-[2.5px]" />
                          <span>{course.studentsCount}</span>
                        </div>
                      </div>
                      <ChevronRight size={20} className="stroke-[3px] opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Side: Add Class CTA */}
          <div className="space-y-6">
            <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-8 shadow-[8px_8px_0_#0A0A0A] flex flex-col text-center">
              <div className="w-20 h-20 bg-[#FFD166] border-[3px] border-[#0A0A0A] rounded-2xl shadow-[4px_4px_0_#0A0A0A] flex items-center justify-center mx-auto mb-6 relative">
                <span className="text-3xl">📂</span>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-[#EF476F] border-2 border-[#0A0A0A] rounded-full flex items-center justify-center text-white font-black shadow-[2px_2px_0_#0A0A0A]">
                  +
                </div>
              </div>
              <h5 className="text-2xl font-black uppercase tracking-tight mb-2">Create a New Class</h5>
              <p className="font-bold text-sm font-['Inter'] text-[#0A0A0A]/70 mb-8">Set up a new class and start managing your students</p>
              <button 
                onClick={() => setShowModal(true)} 
                className="w-full py-4 bg-[#0A0A0A] text-white border-[3px] border-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-sm shadow-[4px_4px_0_#FF4D5B] hover:-translate-y-1 hover:shadow-[6px_6px_0_#FF4D5B] active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <Plus size={20} className="stroke-[3px]" />
                <span>Add New Class</span>
              </button>
            </div>
          </div>

        </div>
      ) : (
        /* Tab: Student Roster */
        <div className="bg-white border-[3px] border-[#0A0A0A] rounded-3xl p-8 shadow-[8px_8px_0_#0A0A0A]">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b-[3px] border-[#0A0A0A]/10">
            <div className="flex items-center gap-3">
              <Users size={28} className="stroke-[3px]" />
              <h3 className="text-2xl font-black uppercase tracking-tight">Student Roster</h3>
            </div>
            
            {/* Search Box */}
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search size={18} className="text-[#0A0A0A]/50 stroke-[3px]" />
              </div>
              <input 
                type="text" 
                placeholder="Search students or classes..." 
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:ring-4 focus:ring-[#118AB2]/20 transition-all"
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex items-center justify-center font-bold text-[#0A0A0A]/50 uppercase tracking-widest">Loading student roster...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 text-[#0A0A0A]/50">
              <Users size={48} className="stroke-[1.5px]" />
              <p className="font-bold uppercase tracking-widest">
                {students.length === 0 ? "No students enrolled in your classes yet." : "No students match your search query."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border-2 border-[#0A0A0A]">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-[#0A0A0A] text-white font-black uppercase tracking-widest text-xs">
                    <th className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">Student Name</th>
                    <th className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">Class</th>
                    <th className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">Progress Bar</th>
                    <th className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">Flag Status</th>
                    <th className="p-4 border-b-2 border-[#0A0A0A]">Actions</th>
                  </tr>
                </thead>
                <tbody className="font-bold font-['Inter'] text-sm">
                  {filteredStudents.map((student, idx) => (
                    <tr key={student.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-[#118AB2]/10 transition-colors`}>
                      <td className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">
                        <div className="flex items-center gap-3">
                          <img 
                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random&color=fff&bold=true`} 
                            alt={student.name} 
                            className="w-10 h-10 rounded-lg border-2 border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                          />
                          <div>
                            <span className="block font-black text-[#0A0A0A] text-base">{student.name}</span>
                            <span className="block font-bold text-xs text-[#0A0A0A]/60">{student.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">
                        <span className="px-2 py-1 bg-gray-200 border-2 border-[#0A0A0A] rounded text-xs font-black uppercase tracking-widest shadow-[2px_2px_0_#0A0A0A]">{student.cls}</span>
                      </td>
                      <td className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-4 bg-gray-200 border-2 border-[#0A0A0A] rounded-full overflow-hidden">
                            <div 
                              className={`h-full border-r-2 border-[#0A0A0A] ${student.progress > 75 ? 'bg-[#06D6A0]' : student.progress > 40 ? 'bg-[#FFD166]' : 'bg-[#EF476F]'}`} 
                              style={{ width: `${student.progress}%` }}
                            ></div>
                          </div>
                          <span className="font-black text-sm min-w-[3ch]">{student.progress}%</span>
                        </div>
                      </td>
                      <td className="p-4 border-b-2 border-r-2 border-[#0A0A0A]">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#0A0A0A]/50">Flag Student?</span>
                          <span className="font-black capitalize">{student.status}</span>
                        </div>
                      </td>
                      <td className="p-4 border-b-2 border-[#0A0A0A]">
                        {student.flagIcon ? (
                          <button 
                            className="p-2 bg-[#EF476F] text-white border-2 border-[#0A0A0A] rounded-lg shadow-[2px_2px_0_#0A0A0A] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all" 
                            onClick={handleNudgeClick} 
                            title="Flagged"
                          >
                            <Flag size={18} className="stroke-[3px]" />
                          </button>
                        ) : (
                          <button 
                            className="flex items-center gap-2 px-3 py-2 bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-lg shadow-[2px_2px_0_#0A0A0A] font-black text-xs uppercase tracking-widest hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
                            onClick={handleNudgeClick}
                          >
                            <Mail size={16} className="stroke-[3px]" />
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
        <div className="fixed inset-0 bg-[#0A0A0A]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[4px] border-[#0A0A0A] rounded-3xl p-8 max-w-md w-full shadow-[12px_12px_0_#0A0A0A] animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6">Create New Class</h2>
            <form onSubmit={handleCreateCourse} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="courseTitle" className="text-sm font-black uppercase tracking-widest">Class Name</label>
                <input 
                  type="text" 
                  id="courseTitle" 
                  required 
                  placeholder="e.g. Introduction to Physics"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#06D6A0]/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="courseCode" className="text-sm font-black uppercase tracking-widest">Class Code</label>
                <input 
                  type="text" 
                  id="courseCode" 
                  required 
                  placeholder="e.g. PHY101"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#06D6A0]/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="courseDesc" className="text-sm font-black uppercase tracking-widest">Description (Optional)</label>
                <textarea 
                  id="courseDesc" 
                  placeholder="Brief description of the course..."
                  value={courseDesc}
                  onChange={(e) => setCourseDesc(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-[3px] border-[#0A0A0A] rounded-xl font-bold font-['Inter'] shadow-[4px_4px_0_#0A0A0A] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#06D6A0]/20 transition-all resize-y min-h-[100px]"
                  rows={3}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="flex-1 py-3 px-4 bg-white border-[3px] border-[#0A0A0A] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest shadow-[4px_4px_0_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0_#0A0A0A] active:translate-y-0 active:shadow-none transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 px-4 bg-[#0A0A0A] border-[3px] border-[#0A0A0A] text-white rounded-xl font-black uppercase tracking-widest shadow-[4px_4px_0_#06D6A0] hover:-translate-y-1 hover:shadow-[6px_6px_0_#06D6A0] active:translate-y-0 active:shadow-none transition-all"
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
