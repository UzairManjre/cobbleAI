import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import NewLanding from './pages/NewLanding';
import ProfessorOnboarding from './pages/ProfessorOnboarding';
import StudentOnboarding from './pages/StudentOnboarding';
import StudentAuthFlow from './pages/StudentAuthFlow';
import ProfessorAuthFlow from './pages/ProfessorAuthFlow';
import Dashboard from './pages/Dashboard';
import MyClasses from './pages/MyClasses';
import Assignments from './pages/Assignments';
import CourseDetail from './pages/CourseDetail';
import MindMap from './pages/MindMap';
import Chat from './pages/Chat';
import StudyMode from './pages/StudyMode';
import StudyPlan from './pages/StudyPlan';
import ProfessorTests from './pages/ProfessorTests';
import TakeTest from './pages/TakeTest';
import AppLayout from './components/layout/AppLayout';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import { useAuthStore } from './store/authStore';

const ProtectedRoute = ({ children, allowedRole, requireOnboarding = true }: { children: ReactNode, allowedRole?: 'professor' | 'student' | Array<'professor' | 'student'>, requireOnboarding?: boolean }) => {
  const { token, role, hasOnboarded } = useAuthStore();
  if (!token) return <Navigate to="/" replace />;

  // Handle onboarding redirect
  if (requireOnboarding && !hasOnboarded) {
    return <Navigate to={`/onboarding/${role}`} replace />;
  }

  if (allowedRole) {
    const allowed = Array.isArray(allowedRole) ? allowedRole.includes(role!) : role === allowedRole;
    if (!allowed) return <Navigate to={role === 'professor' ? '/professor/dashboard' : '/student/dashboard'} replace />;
  }
  return <>{children}</>;
};

export default function App() {
  const initialize = useAuthStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<NewLanding />} />
        <Route path="/role-select" element={<LandingPage />} />
        <Route path="/login/student" element={<StudentAuthFlow initialStep="welcome" />} />
        <Route path="/login/professor" element={<ProfessorAuthFlow initialStep="welcome" />} />
        <Route path="/signup/student" element={<StudentAuthFlow initialStep="welcome" />} />
        <Route path="/signup/professor" element={<ProfessorAuthFlow initialStep="welcome" />} />

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

        {/* Chat route - redirect to student layout */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Navigate to="/student/chat" replace />
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

        {/* Shared Layout with Sidebar/Topbar - ALL professor routes */}
        <Route
          path="/professor"
          element={
            <ProtectedRoute allowedRole="professor">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/professor/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="classes" element={<MyClasses />} />
          <Route path="students" element={<Navigate to="/professor/classes?tab=students" replace />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="analytics" element={<AnalyticsDashboard />} />
          
          {/* Course routes */}
          <Route path="courses/:courseId" element={<CourseDetail />} />
          <Route path="courses/:courseId/map" element={<MindMap />} />
          <Route path="courses/:courseId/study" element={<StudyMode />} />
          <Route path="courses/:courseId/plan" element={<StudyPlan />} />
          <Route path="courses/:courseId/tests" element={<ProfessorTests />} />
        </Route>

        {/* Student Layout with Sidebar/Topbar - ALL student routes */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRole="student">
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/student/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          
          {/* Course routes */}
          <Route path="courses/:courseId" element={<CourseDetail />} />
          <Route path="courses/:courseId/map" element={<MindMap />} />
          <Route path="courses/:courseId/study" element={<StudyMode />} />
          <Route path="courses/:courseId/plan" element={<StudyPlan />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
