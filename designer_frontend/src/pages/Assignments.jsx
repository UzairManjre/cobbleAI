import React from 'react';
import './Assignments.css';

const assignmentsData = [
  {
    id: 1,
    title: 'CS 101 - Project Part 1',
    description: 'Consectetur adipisicing elit dolor... students.',
    count: 28,
    isRecent: true
  },
  {
    id: 2,
    title: 'CS 101 - Project Part 2',
    description: 'Some in a commoner students.',
    count: null,
    isPublished: true
  },
  {
    id: 3,
    title: 'CS 101 - Project Part 3',
    description: 'Some in a commoner students.',
    count: null,
    isPublished: true
  }
];

const Assignments = () => {
  return (
    <div className="page-container assignments-page flex justify-center items-center">
      {/* We make this look like the large popup in the center of the UI shown in design */}
      <div className="assignments-panel">
        <h2 className="panel-title">Upcoming Assignments</h2>
        <span className="recent-label">Recent</span>
        
        <div className="assignments-list">
          {assignmentsData.map((task) => (
            <div key={task.id} className="assignment-item flex justify-between items-center card">
              <div className="task-info">
                <h4>{task.title}</h4>
                <p>{task.description}</p>
                {task.count && <span className="student-count">{task.count} students</span>}
              </div>
              
              <div className="task-actions flex flex-col items-center">
                {task.isRecent ? (
                  <>
                    <span className="view-subs-text">View submissions<br/><small>(per student)</small></span>
                    <button className="btn btn-primary create-assignment-btn flex flex-col items-center">
                      <span>Create assignment</span>
                      <small>(Title, desc, deadline)</small>
                    </button>
                  </>
                ) : (
                  <button className="btn published-btn">
                    Published to class
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Assignments;
