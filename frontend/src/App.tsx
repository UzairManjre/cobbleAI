import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ProfessorOnboarding from './pages/ProfessorOnboarding';
import StudentOnboarding from './pages/StudentOnboarding';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Assignments from './pages/Assignments';
import CourseDetail from './pages/CourseDetail';
import MindMap from './pages/MindMap';
import Chat from './pages/Chat';
import StudyMode from './pages/StudyMode';
import StudyPlan from './pages/StudyPlan';
import ProfessorTests from './pages/ProfessorTests';
import TakeTest from './pages/TakeTest';
import ProfessorLayout from './components/layout/ProfessorLayout';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
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
    if (!allowed) return <Navigate to={role === 'professor' ? '/professor/dashboard' : '/chat'} replace />;
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
        {/* Public Routes */}
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

        {/* Chat route */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        {/* Standalone course routes (accessible from any role) */}
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
            <ProtectedRoute allowedRole="professor">
              <ProfessorTests />
            </ProtectedRoute>
          }
        />

        {/* Test route */}
        <Route
          path="/tests/:testId"
          element={
            <ProtectedRoute>
              <TakeTest />
            </ProtectedRoute>
          }
        />

        {/* Professor Layout with Sidebar/Topbar - ALL professor routes */}
        <Route
          path="/professor"
          element={
            <ProtectedRoute allowedRole="professor">
              <ProfessorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/professor/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
          
          {/* Course routes */}
          <Route path="courses/:courseId" element={<CourseDetail />} />
          <Route path="courses/:courseId/map" element={<MindMap />} />
          <Route path="courses/:courseId/study" element={<StudyMode />} />
          <Route path="courses/:courseId/plan" element={<StudyPlan />} />
          <Route path="courses/:courseId/tests" element={<ProfessorTests />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
