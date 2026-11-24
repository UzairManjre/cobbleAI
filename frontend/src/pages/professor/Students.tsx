import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, Loader2 } from 'lucide-react';
import { coursesApi } from '../../api';
import { PageHeader } from '../../components/ui/PageHeader';

interface StudentRow {
  id: string;
  course_id: string;
  name: string;
  email: string;
  cls: string;
  progress: number;
  status: string;
  flagIcon: boolean;
}

/** Every student enrolled in any of the professor's courses. */
export default function Students() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    coursesApi.getProfessorStudents()
      .then(res => setStudents(res.data || []))
      .catch(err => { console.error('Error loading students:', err); setStudents([]); })
      .finally(() => setIsLoading(false));
  }, []);

  const shown = useMemo(() => {
    const q = query.toLowerCase();
    return students.filter(s => [s.name, s.email, s.cls].some(v => (v || '').toLowerCase().includes(q)));
  }, [students, query]);

  return (
    <div className="w-full px-5 md:px-8 lg:px-12">
      <div className="max-w-6xl mx-auto pt-10 md:pt-14 pb-24 space-y-12">
        <PageHeader title="students" lead="Everyone enrolled in your courses. Open a course to share its invite code." />

        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-outfit font-medium">{students.length} enrolled</h2>
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search students</span>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                placeholder="Search by name, email or course"
                className="w-full pl-9 pr-4 py-2 bg-sunken border border-line rounded-lg text-sm text-ink focus:outline-none focus:border-line-strong placeholder:text-ink-4"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </label>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-24 text-ink-3"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : shown.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-ink-3">
              <Users size={48} className="mb-4 opacity-50" />
              <p className="text-sm font-medium text-ink mb-1">{students.length ? 'No students match' : 'No students yet'}</p>
              <p className="text-xs">{students.length ? 'Try a different search.' : 'Share a course invite code from the course page.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-sunken text-ink-3 uppercase tracking-widest text-[10px] font-semibold">
                    <th className="p-4 border-b border-line">Student</th>
                    <th className="p-4 border-b border-line">Course</th>
                    <th className="p-4 border-b border-line">Progress</th>
                    <th className="p-4 border-b border-line">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {shown.map(s => (
                    <tr key={s.id} className="hover:bg-sunken transition-colors border-b border-line last:border-0">
                      <td className="p-4">
                        <span className="block font-medium">{s.name || s.email || 'Unknown student'}</span>
                        <span className="block text-[11px] text-ink-3">{s.email}</span>
                      </td>
                      <td className="p-4">
                        <Link to={`/courses/${s.course_id}`} className="text-ink-3 hover:text-ink">{s.cls}</Link>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-24 h-1.5 bg-sunken-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${s.progress > 75 ? 'bg-accent' : s.progress > 40 ? 'bg-orange-500' : 'bg-red-500'}`}
                              style={{ width: `${s.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-ink-3">{s.progress}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`capitalize text-xs font-medium ${s.flagIcon ? 'text-red-600' : 'text-ink-3'}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
