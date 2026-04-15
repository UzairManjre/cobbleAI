import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { MoreVertical, X } from 'lucide-react';
import './Layout.css';

const Layout = () => {
  const [showInsights, setShowInsights] = useState(false);

  return (
    <div className="app-container">
      <div onClick={() => setShowInsights(prev => !prev)} className="ai-insights-trigger" style={{ position: 'absolute', bottom: '2rem', left: '1rem', width: '230px', height: '50px', cursor: 'pointer', zIndex: 10 }}></div>
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <div className="content-scrollable">
          <Outlet />
        </div>
      </div>

      {showInsights && (
        <div className="insights-modal">
          <div className="insights-header">
            <h3>AI Insights</h3>
            <button className="icon-btn" onClick={() => setShowInsights(false)}>
              <X size={20} />
            </button>
          </div>
          
          <div className="insights-body">
            <div className="topic-heatmap">
              <h4>Topic Heatmap</h4>
              <div className="heatmap-grid-container">
                <div className="heatmap-grid">
                  {/* Mocking heatmap cells */}
                  {Array.from({length: 40}).map((_, i) => (
                    <div key={i} className={`heatmap-cell intensity-${Math.floor(Math.random() * 5)}`}></div>
                  ))}
                </div>
                <div className="heatmap-labels">
                  <span>Consectetors</span>
                  <span>Common questions</span>
                  <span>Data Structures</span>
                  <span>AI Ethics</span>
                  <span>Common doubts</span>
                </div>
              </div>
            </div>

            <div className="confusion-alert-card card">
              <div className="flex justify-between items-center">
                <h4>Confusion alert</h4>
                <MoreVertical size={16} />
              </div>
              <p>Topics needing review</p>
              <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span>Export report</span>
                  <small style={{ color: 'inherit', opacity: 0.7 }}>(PDF summary)</small>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
