import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import LandingPage from './pages/common/LandingPage';
import NewLanding from './pages/common/NewLanding';
import ProfessorOnboarding from './pages/professor/ProfessorOnboarding';
import StudentOnboarding from './pages/student/StudentOnboarding';
import StudentAuthFlow from './pages/auth/StudentAuthFlow';
import ProfessorAuthFlow from './pages/auth/ProfessorAuthFlow';
import Dashboard from './pages/student/Dashboard';
import MyClasses from './pages/professor/MyClasses';
import Assignments from './pages/student/Assignments';
import CourseDetail from './pages/common/CourseDetail';
import MindMap from './pages/common/MindMap';
import Chat from './pages/common/Chat';
import StudyMode from './pages/student/StudyMode';
import StudyPlan from './pages/student/StudyPlan';
import ProfessorTests from './pages/professor/ProfessorTests';
import TakeTest from './pages/student/TakeTest';
import AppLayout from './components/layout/AppLayout';
import AnalyticsDashboard from './pages/professor/AnalyticsDashboard';
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

const CourseRedirect = () => {
  const { role } = useAuthStore();
  const { courseId } = useParams();
  return <Navigate to={`/${role}/courses/${courseId}`} replace />;
};

const CourseSubRouteRedirect = ({ subPath }: { subPath: string }) => {
  const { role } = useAuthStore();
  const { courseId } = useParams();
  return <Navigate to={`/${role}/courses/${courseId}/${subPath}`} replace />;
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

        {/* Redirect standalone course routes into layout shell */}
        <Route
          path="/course/:courseId"
          element={
            <ProtectedRoute>
              <CourseRedirect />
            </ProtectedRoute>
          }
        />
        <Route
          path="/course/:courseId/map"
          element={
            <ProtectedRoute>
              <CourseSubRouteRedirect subPath="map" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/course/:courseId/study"
          element={
            <ProtectedRoute>
              <CourseSubRouteRedirect subPath="study" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/course/:courseId/plan"
          element={
            <ProtectedRoute>
              <CourseSubRouteRedirect subPath="plan" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/course/:courseId/tests"
          element={
            <ProtectedRoute allowedRole="professor">
              <CourseSubRouteRedirect subPath="tests" />
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
