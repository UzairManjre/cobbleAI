import { NavLink } from 'react-router-dom';
import { Home, GraduationCap, FileText, Lightbulb, Brain } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './Sidebar.css';

const Sidebar = () => {
  const { role } = useAuthStore();
  const baseRoute = role === 'professor' ? '/professor' : '/student';

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
            <path d="M4 6H14L10 14H20" stroke="#ff4f54" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="brand-name">CobbleAI</span>
      </div>
      
      <nav className="sidebar-nav">
        <NavLink 
          to={`${baseRoute}/dashboard`} 
          end 
          className={({isActive}) => `nav-item ${isActive ? 'active-dashboard' : ''}`}
        >
          <Home size={20} className="nav-icon" />
          <div className="nav-text">
            <span className="nav-title">Dashboard</span>
            <span className="nav-subtitle">Overview & Schedule</span>
          </div>
        </NavLink>

        {role === 'student' && (
          <NavLink 
            to="/student/chat" 
            className={({isActive}) => `nav-item ${isActive ? 'active-chat' : ''}`}
          >
            <Brain size={20} className="nav-icon" />
            <div className="nav-text">
              <span className="nav-title">AI Tutor</span>
              <span className="nav-subtitle">Personal chat assistant</span>
            </div>
          </NavLink>
        )}

        {role === 'professor' && (
          <>
            <NavLink 
              to="/professor/classes" 
              className={({isActive}) => `nav-item ${isActive ? 'active-classes' : ''}`}
            >
              <GraduationCap size={20} className="nav-icon" />
              <div className="nav-text">
                <span className="nav-title">My classes</span>
                <span className="nav-subtitle">All active classes</span>
              </div>
            </NavLink>

            <NavLink 
              to="/professor/assignments" 
              className={({isActive}) => `nav-item ${isActive ? 'active-assignments' : ''}`}
            >
              <FileText size={20} className="nav-icon" />
              <div className="nav-text">
                <span className="nav-title">Assignments</span>
                <span className="nav-subtitle">Manage and grade</span>
              </div>
            </NavLink>

            <NavLink 
              to="/professor/analytics" 
              className={({isActive}) => `nav-item ${isActive ? 'active-analytics' : ''}`}
            >
              <Lightbulb size={20} className="nav-icon" />
              <div className="nav-text">
                <span className="nav-title">Analytics</span>
                <span className="nav-subtitle">System & Insights</span>
              </div>
            </NavLink>
          </>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;
