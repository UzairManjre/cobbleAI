import React, { useState, useEffect } from 'react';
import { Search, Mail, Flag } from 'lucide-react';
import { coursesApi } from '../api';
import './Students.css';

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

const Students = () => {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await coursesApi.getProfessorStudents();
      setStudents(res.data);
    } catch (err) {
      console.error('Failed to fetch students roster', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNudgeClick = () => {
    alert("Feature coming soon!");
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.cls.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-container students-page">
      <h1 className="page-title">Students</h1>
      
      <div className="table-container">
        <div className="search-wrapper">
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            placeholder="Search students or classes..." 
            className="table-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        {isLoading ? (
          <div style={{ padding: '2rem', color: 'var(--designer-text-secondary)', textAlign: 'center' }}>
            Loading student roster...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ padding: '2rem', color: 'var(--designer-text-secondary)', textAlign: 'center' }}>
            {students.length === 0 ? "You have no students enrolled in your active classes yet." : "No students match your search."}
          </div>
        ) : (
          <table className="students-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Class</th>
                <th>Progress Bar</th>
                <th>Flag Status</th>
                <th>Nudge Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => (
                <tr key={student.id} className="student-row">
                  <td>
                    <div className="designer-flex designer-items-center designer-gap-3">
                      <img src={`https://randomuser.me/api/portraits/men/${student.bg}`} alt={student.name} className="designer-avatar" />
                      <span>{student.name}</span>
                    </div>
                  </td>
                  <td>{student.cls}</td>
                  <td>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${student.progress}%` }}></div>
                    </div>
                  </td>
                  <td>
                    <div className="designer-badge designer-badge-purple designer-flex designer-flex-col designer-items-center" style={{alignItems: 'flex-start', gap: '0.25rem', padding: '0.5rem'}}>
                      <span style={{fontWeight: 600, fontSize: '0.8rem'}}>Flag student?</span>
                      <span style={{fontSize: '0.7rem', opacity: 0.8}}>{student.status}</span>
                    </div>
                  </td>
                  <td>
                    {student.flagIcon ? (
                      <button className="designer-badge designer-badge-purple btn-flag" onClick={handleNudgeClick}>
                        <Flag size={14} fill="#e1c0fa" />
                      </button>
                    ) : (
                      <button className="designer-btn alert-btn" onClick={handleNudgeClick}>
                        <Mail size={14} />
                        <div className="designer-flex designer-flex-col" style={{alignItems: 'flex-start', lineHeight: 1.2}}>
                          <span style={{fontWeight: 600, fontSize: '0.8rem'}}>Send nudge</span>
                          <span style={{fontSize: '0.65rem'}}>(Alert or message)</span>
                        </div>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Students;
