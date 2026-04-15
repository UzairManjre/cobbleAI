import React from 'react';
import { Search, Mail, Flag } from 'lucide-react';
import './Students.css';

const studentsData = [
  { id: 1, name: 'Alex Chen', bg: '32.jpg', cls: 'CS 101 Intro to AI', progress: 75, status: 'Struggling / Inactive', flagIcon: true },
  { id: 2, name: 'Sarah Kim', bg: '44.jpg', cls: 'CS 101 Intro to AI', progress: 85, status: 'Struggling / Inactive', flagIcon: false },
  { id: 3, name: 'David Nathan', bg: '68.jpg', cls: 'CS 101 Intro to AI', progress: 60, status: 'Struggling / Inactive', flagIcon: false },
  { id: 4, name: 'Lunia Joser', bg: '12.jpg', cls: 'CS 101', progress: 70, status: 'Struggling / Inactive', flagIcon: false },
  { id: 5, name: 'James Jamian', bg: '55.jpg', cls: 'CS 101 Intro to AI', progress: 40, status: 'Struggling / Inactive', flagIcon: false },
];

const Students = () => {
  return (
    <div className="page-container students-page">
      <h1 className="page-title">Students</h1>
      
      <div className="table-container">
        <div className="search-wrapper">
          <Search className="search-icon" size={18} />
          <input type="text" placeholder="Search" className="search-input table-search" />
        </div>
        
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
            {studentsData.map((student) => (
              <tr key={student.id} className="student-row">
                <td>
                  <div className="flex items-center gap-3">
                    <img src={`https://randomuser.me/api/portraits/men/${student.bg}`} alt={student.name} className="avatar" />
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
                  <div className="badge badge-purple flex flex-col items-start gap-1 p-2">
                    <span style={{fontWeight: 600, fontSize: '0.8rem'}}>Flag student?</span>
                    <span style={{fontSize: '0.7rem', opacity: 0.8}}>{student.status}</span>
                  </div>
                </td>
                <td>
                  {student.flagIcon ? (
                    <button className="badge badge-purple btn-flag">
                      <Flag size={14} fill="#e1c0fa" />
                    </button>
                  ) : (
                    <button className="btn badge-orange flex items-center gap-2 alert-btn">
                      <Mail size={14} />
                      <div className="flex flex-col items-start" style={{lineHeight: 1.2}}>
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
      </div>
    </div>
  );
};

export default Students;
