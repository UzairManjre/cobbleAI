import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, ChevronDown } from 'lucide-react';
import './Topbar.css';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';

const Topbar = () => {
  const { role, token, logout } = useAuthStore();
  const [userName, setUserName] = useState('');
  const baseRoute = role === 'professor' ? '/professor' : '/student';

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

  return (
    <div className="topbar-wrapper">
      <div className="topbar">
        <div className="topbar-brand">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <path d="M4 6H14L10 14H20" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="brand-name font-outfit">Cobble</span>
        </div>

        <nav className="topbar-nav font-outfit">
          <NavLink to={`${baseRoute}/dashboard`} end className={({isActive}) => `topnav-item ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>

          {role === 'student' && (
            <>
              <NavLink to="/student/assignments" className={({isActive}) => `topnav-item ${isActive ? 'active' : ''}`}>
                Assignments
              </NavLink>
              <NavLink to="/student/chat" className={({isActive}) => `topnav-item ${isActive ? 'active' : ''}`}>
                Tutor
              </NavLink>
            </>
          )}

          {role === 'professor' && (
            <>
              <NavLink to="/professor/classes" className={({isActive}) => `topnav-item ${isActive ? 'active' : ''}`}>
                Classes
              </NavLink>
              <NavLink to="/professor/analytics" className={({isActive}) => `topnav-item ${isActive ? 'active' : ''}`}>
                Analytics
              </NavLink>
            </>
          )}
        </nav>

        <div className="topbar-actions">
          <div className="notification-bell">
            <Bell size={16} />
            <span className="notification-dot"></span>
          </div>
          
          <div className="profile-menu" onClick={logout}>
            <img 
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName || 'User')}&background=0A0A0A&color=fff`} 
              alt="Profile" 
              className="designer-avatar-small"
            />
            <ChevronDown size={14} className="chevron" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Topbar;
