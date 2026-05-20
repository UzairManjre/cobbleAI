import React, { useState, useEffect, useMemo } from 'react';
import { Search, Bell, ChevronDown } from 'lucide-react';
import './Topbar.css';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';

const Topbar = () => {
  const { token, logout } = useAuthStore();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (!token) return;
    const fetchUser = async () => {
      try {
        const res = await authApi.getCurrentUser();
        if (res.data && res.data.name) {
          setUserName(res.data.name);
        }
      } catch (err) {
        console.error('Failed to fetch user in Topbar:', err);
      }
    };
    fetchUser();
  }, [token]);

  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Morning';
    if (hours < 17) return 'Afternoon';
    return 'Evening';
  }, []);

  return (
    <div className="topbar">
      <div className="topbar-greeting">
        {greeting} {userName ? userName.split(' ')[0] : 'Professor'},
      </div>

      <div className="topbar-actions">
        <div className="notification-bell">
          <Bell size={20} />
          <span className="notification-dot"></span>
        </div>
        
        <div className="profile-menu" onClick={logout}>
          <img 
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'Professor')}&background=random&color=fff`} 
            alt="Profile" 
            className="designer-avatar"
          />
          <span className="profile-name">Log out</span>
          <ChevronDown size={16} className="chevron" />
        </div>
      </div>
    </div>
  );
};

export default Topbar;
