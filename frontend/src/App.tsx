import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ProfessorOnboarding from './pages/ProfessorOnboarding';
import StudentOnboarding from './pages/StudentOnboarding';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import CourseDetail from './pages/CourseDetail';
import MindMap from './pages/MindMap';
import Chat from './pages/Chat';
import StudyMode from './pages/StudyMode';
import StudyPlan from './pages/StudyPlan';
import ProfessorTests from './pages/ProfessorTests';
import TakeTest from './pages/TakeTest';
import { useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children, allowedRole, requireOnboarding = true }: { children: React.ReactNode, allowedRole?: 'professor' | 'student' | Array<'professor' | 'student'>, requireOnboarding?: boolean }) => {
  const { token, role, hasOnboarded } = useAuthStore();
  if (!token) return <Navigate to="/" replace />;
  
  // Handle onboarding redirect
  if (requireOnboarding && !hasOnboarded) {
    return <Navigate to={`/onboarding/${role}`} replace />;
  }

  if (allowedRole) {
    const allowed = Array.isArray(allowedRole) ? allowedRole.includes(role!) : role === allowedRole;
    if (!allowed) return <Navigate to={role === 'professor' ? '/dashboard' : '/chat'} replace />;
  }
  return <>{children}</>;
};

export default function App() {
  const initialize = useAuthStore(state => state.initialize);

  React.useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login/student" element={<Login role="student" />} />
        <Route path="/login/professor" element={<Login role="professor" />} />
        <Route path="/signup/student" element={<Signup role="student" />} />
        <Route path="/signup/professor" element={<Signup role="professor" />} />
        
        <Route 
          path="/onboarding/professor" 
          element={
            <ProtectedRoute requireOnboarding={false} allowedRole="professor">
              <ProfessorOnboarding />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/onboarding/student" 
          element={
            <ProtectedRoute requireOnboarding={false} allowedRole="student">
              <StudentOnboarding />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/course/:courseId" 
          element={
            <ProtectedRoute>
              <CourseDetail />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/course/:courseId/map" 
          element={
            <ProtectedRoute>
              <MindMap />
            </ProtectedRoute>
          } 
        />

        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        <Route
          path="/course/:courseId/study"
          element={
            <ProtectedRoute>
              <StudyMode />
            </ProtectedRoute>
          }
        />

        <Route
          path="/course/:courseId/plan"
          element={
            <ProtectedRoute>
              <StudyPlan />
            </ProtectedRoute>
          }
        />

        <Route
          path="/course/:courseId/tests"
          element={
            <ProtectedRoute>
              <ProfessorTests />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tests/:testId"
          element={
            <ProtectedRoute>
              <TakeTest />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
