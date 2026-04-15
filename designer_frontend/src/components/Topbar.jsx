import React from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';
import './Topbar.css';

const Topbar = () => {
  return (
    <div className="topbar">
      <div className="search-container">
        <Search className="search-icon" size={18} />
        <input type="text" placeholder="Search..." className="search-input" />
      </div>

      <div className="topbar-actions">
        <div className="notification-bell">
          <Bell size={20} />
          <span className="notification-dot"></span>
        </div>
        
        <div className="profile-menu">
          <img 
            src="https://randomuser.me/api/portraits/men/32.jpg" 
            alt="Profile" 
            className="avatar"
          />
          <span className="profile-name">Profile</span>
          <ChevronDown size={16} className="chevron" />
        </div>
      </div>
    </div>
  );
};

export default Topbar;
