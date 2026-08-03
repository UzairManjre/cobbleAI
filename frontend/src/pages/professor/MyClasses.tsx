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
  ArrowRight,
  Loader2
} from 'lucide-react';
import { coursesApi } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';

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
  const addToast = useToastStore(state => state.addToast);
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
    
    try {
      const coursesRes = await coursesApi.list();
      setCourses(coursesRes.data || []);
    } catch (err) {
      console.error('Error loading courses:', err);
      setCourses([]);
    }

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
      
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to create course', 'error');
    }
  };

  const handleNudgeClick = (studentName: string) => {
    addToast(`Nudge sent to ${studentName}!`, 'success');
  };

  const activeClasses = useMemo(() => {
    return courses.map(c => {
      const courseStudents = students.filter(s => s.course_id === c.id);
      const studentCount = courseStudents.length;

      return {
        id: c.id,
        title: c.title,
        code: c.code,
        docsCount: c.docs_count || 0,
        studentsCount: studentCount,
      };
    });
  }, [courses, students]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => 
      (s.name || '').toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
      (s.cls || '').toLowerCase().includes(studentSearchQuery.toLowerCase())
    );
  }, [students, studentSearchQuery]);

  return (
    <div className="min-h-screen bg-black text-white p-8 lg:p-12 relative overflow-hidden">
      
      <div className="max-w-6xl mx-auto space-y-12 relative z-10">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
          <div>
            <h1 className="text-4xl font-outfit font-light text-white tracking-tight">
              Directory
            </h1>
            <p className="text-sm text-[#888888] mt-3 font-medium tracking-wide max-w-lg leading-relaxed">
              Manage your active environments and track student performance.
            </p>
          </div>
          <button 
            onClick={() => setShowModal(true)} 
            className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-gray-200 text-black rounded-full font-medium text-sm transition-all active:scale-95"
          >
            <Plus size={16} /> Create Class
          </button>
        </header>

        {/* Tab Switcher */}
        <div className="flex items-center gap-6 border-b border-[#1A1A1A]">
          <button 
            onClick={() => handleTabChange('classes')}
            className={`pb-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'classes' 
                ? 'border-white text-white' 
                : 'border-transparent text-[#888888] hover:text-white'
            }`}
          >
            Classes ({courses.length})
          </button>
          <button 
            onClick={() => handleTabChange('students')}
            className={`pb-4 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'students' 
                ? 'border-white text-white' 
                : 'border-transparent text-[#888888] hover:text-white'
            }`}
          >
            Students ({students.length})
          </button>
        </div>

        {/* Views */}
        {activeTab === 'classes' ? (
          <div>
            {isLoading ? (
              <div className="flex justify-center py-24 text-[#888888]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : activeClasses.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-[#888888]">
                <FolderOpen size={48} className="mb-4 opacity-50" />
                <p className="text-sm font-medium text-white mb-1">No active classes</p>
                <p className="text-xs">Click "Create Class" to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeClasses.map((course) => (
                  <div 
                    key={course.id} 
                    onClick={() => navigate(`/professor/courses/${course.id}`)}
                    className="group bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-6 hover:border-[#333333] transition-all cursor-pointer"
                  >
                    <span className="text-[10px] font-bold text-[#888888] uppercase tracking-widest block mb-2">{course.code}</span>
                    <h3 className="text-xl font-medium text-white mb-6 group-hover:text-blue-500 transition-colors">{course.title}</h3>
                    <div className="flex items-center gap-4 mb-6 text-xs text-[#888888]">
                      <span className="flex items-center gap-1.5"><Users size={14} /> {course.studentsCount} Enrolled</span>
                      <span className="flex items-center gap-1.5"><BookOpen size={14} /> {course.docsCount} Docs</span>
                    </div>
                    <div className="border-t border-[#1A1A1A] pt-4 flex justify-between items-center">
                      <span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full border ${course.docsCount > 0 ? 'text-blue-500 border-blue-500/30' : 'text-[#888888] border-[#1A1A1A]'}`}>
                        {course.docsCount > 0 ? 'AI Ready' : 'Setup Required'}
                      </span>
                      <ArrowRight size={16} className="text-[#333333] group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Tab: Student Roster */
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-[#1A1A1A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-outfit font-medium text-white">Student Roster</h2>
              
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={14} className="text-[#888888]" />
                </div>
                <input 
                  type="text" 
                  placeholder="Search students..." 
                  className="w-full pl-9 pr-4 py-2 bg-[#111111] border border-[#1A1A1A] rounded-lg text-sm text-white focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888]"
                  value={studentSearchQuery}
                  onChange={(e) => setStudentSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-24 text-[#888888]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-[#888888]">
                <Users size={48} className="mb-4 opacity-50" />
                <p className="text-sm font-medium text-white mb-1">No students found</p>
                <p className="text-xs">Adjust your search query.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#111111] text-[#888888] uppercase tracking-widest text-[10px] font-semibold">
                      <th className="p-4 border-b border-[#1A1A1A]">Student</th>
                      <th className="p-4 border-b border-[#1A1A1A]">Class</th>
                      <th className="p-4 border-b border-[#1A1A1A]">Progress</th>
                      <th className="p-4 border-b border-[#1A1A1A]">Status</th>
                      <th className="p-4 border-b border-[#1A1A1A] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-[#111111] transition-colors border-b border-[#1A1A1A] last:border-0">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#333333] flex items-center justify-center text-[#888888] text-xs font-medium">
                              {(student.name || student.email || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="block font-medium text-white">{student.name || student.email || "Unknown Student"}</span>
                              <span className="block text-[11px] text-[#888888]">{student.email || ""}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-[#888888] font-medium">{student.cls}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${student.progress > 75 ? 'bg-blue-500' : student.progress > 40 ? 'bg-orange-500' : 'bg-red-500'}`} 
                                style={{ width: `${student.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-[#888888] font-medium">{student.progress}%</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`capitalize text-xs font-medium ${student.flagIcon ? 'text-red-500' : 'text-[#888888]'}`}>
                            {student.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-[#333333] text-[#888888] hover:text-white hover:bg-[#1A1A1A] rounded-md text-xs font-medium transition-all"
                            onClick={() => handleNudgeClick(student.name)}
                          >
                            <Mail size={12} />
                            Nudge
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-light text-white mb-6">Create New Class</h2>
            <form onSubmit={handleCreateCourse} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Class Title</label>
                <input className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888]" placeholder="e.g. Intro to ML" value={courseTitle} onChange={e => setCourseTitle(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Department Code</label>
                <input className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888]" placeholder="e.g. CS-101" value={courseCode} onChange={e => setCourseCode(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#888888] uppercase tracking-widest">Description</label>
                <textarea className="w-full px-4 py-3 bg-[#111111] border border-[#1A1A1A] rounded-xl text-sm text-white h-24 focus:outline-none focus:border-[#333333] transition-all placeholder:text-[#888888] resize-none" placeholder="Brief overview..." value={courseDesc} onChange={e => setCourseDesc(e.target.value)} />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-transparent text-[#888888] hover:text-white rounded-xl text-sm font-medium transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-white text-black hover:bg-gray-200 rounded-xl text-sm font-semibold transition-colors">Create Class</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
