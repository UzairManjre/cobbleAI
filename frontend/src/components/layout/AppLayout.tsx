import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import './AppLayout.css';

const AppLayout = () => {
  return (
    <div className="app-container">
      <Topbar />
      <div className="content-scrollable">
        <Outlet />
      </div>
    </div>
  );
};

export default AppLayout;
