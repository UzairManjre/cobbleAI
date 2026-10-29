import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import ResearchConsentBanner from '../common/ResearchConsent';
import { useAuthStore } from '../../store/authStore';
import './AppLayout.css';

const AppLayout = () => {
  const role = useAuthStore(s => s.role);
  return (
    <div className="app-container">
      <Topbar />
      <div className="content-scrollable">
        {role === 'student' && <ResearchConsentBanner />}
        <Outlet />
      </div>
    </div>
  );
};

export default AppLayout;
