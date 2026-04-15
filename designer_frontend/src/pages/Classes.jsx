import React from 'react';
import { MoreVertical, ChevronRight } from 'lucide-react';
import './Classes.css';

const classesData = [
  {
    id: 1,
    title: 'CS 101 Intro to AI',
    description: 'Lorem ipsum dolor sit amet, consectetur adipisicing and ant...',
    studentsCount: 27,
  },
  {
    id: 2,
    title: 'Data Structures',
    description: 'Lorem ipsum dolor sit amet, consectetur adipisicing and ant...',
    studentsCount: 17,
  },
  {
    id: 3,
    title: 'AI Ethics',
    description: 'Lorem ipsum dolor sit amet, consectetur adipisicing and an...',
    studentsCount: 7,
  },
  {
    id: 4,
    title: 'AI Third...',
    description: 'Lorem ipsum dolor sit amet, consectetur adipisicing and an...',
    studentsCount: 32,
  }
];

const Classes = () => {
  return (
    <div className="page-container classes-page">
      <h1 className="page-title">My classes</h1>
      
      <div className="classes-grid">
        {classesData.map((cls) => (
          <div key={cls.id} className="card class-card">
            <div className="class-card-header flex justify-between">
              <h3>{cls.title}</h3>
              <MoreVertical size={18} className="text-secondary" />
            </div>
            
            <p className="class-desc">{cls.description}</p>
            <span className="class-student-count">{cls.studentsCount} students</span>
            
            <div className="class-card-actions">
              <div className="action-row flex justify-between items-center">
                <span>View/Edit</span>
                <ChevronRight size={16} />
              </div>
              <div className="action-row flex justify-between items-center">
                <span>Add Notes / Re-index</span>
              </div>
            </div>
          </div>
        ))}
        
        <div className="card create-class-card flex flex-col justify-center items-center">
          <h3 className="text-black">Create new class</h3>
          <p className="text-black desc">goes to professor setup flow</p>
        </div>
      </div>
    </div>
  );
};

export default Classes;
