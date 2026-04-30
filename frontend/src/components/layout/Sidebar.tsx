import React from 'react';
import { NavLink } from 'react-router-dom';
import { AppWindow, Users, FileText, Lightbulb } from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
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
        <NavLink to="/professor/dashboard" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <AppWindow size={20} className="nav-icon" />
          <div className="nav-text">
            <span className="nav-title">My classes</span>
            <span className="nav-subtitle">All active classes</span>
          </div>
        </NavLink>

        <NavLink to="/professor/students" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users size={20} className="nav-icon" />
          <div className="nav-text">
            <span className="nav-title">Students</span>
            <span className="nav-subtitle">Roster and progress</span>
          </div>
        </NavLink>

        <NavLink to="/professor/assignments" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
          <FileText size={20} className="nav-icon" />
          <div className="nav-text">
            <span className="nav-title">Assignments</span>
            <span className="nav-subtitle">Manage and grade</span>
          </div>
        </NavLink>

        <NavLink to="/professor/analytics" className={({isActive}) => `nav-item ${isActive ? 'active' : ''} ai-insights-nav`}>
          <Lightbulb size={20} className="nav-icon" />
          <div className="nav-text">
            <span className="nav-title">Analytics</span>
            <span className="nav-subtitle">System & Insights</span>
          </div>
        </NavLink>
      </nav>
    </div>
  );
};

export default Sidebar;
