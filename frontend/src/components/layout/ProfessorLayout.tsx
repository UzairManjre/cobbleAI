import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './ProfessorLayout.css';

const ProfessorLayout = () => {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <div className="content-scrollable">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default ProfessorLayout;
