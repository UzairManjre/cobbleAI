import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Topbar from './Topbar';
import { embedsTopbar } from './gradientPages';
import ResearchConsentBanner from '../common/ResearchConsent';
import { useAuthStore } from '../../store/authStore';
import './AppLayout.css';

const AppLayout = () => {
  const role = useAuthStore(s => s.role);
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // The content area (not the window) scrolls: start each new page at the top
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  // Gradient pages draw the bar inside their own header
  const embedded = embedsTopbar(role, pathname);

  return (
    <div className="app-container">
      {!embedded && <Topbar />}
      <div className="content-scrollable" ref={scrollRef}>
        {role === 'student' && <ResearchConsentBanner />}
        <Outlet />
      </div>
    </div>
  );
};

export default AppLayout;
