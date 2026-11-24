import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import NewLanding from './pages/common/NewLanding';
import SignIn from './pages/auth/SignIn';
import StudentOnboarding from './pages/student/StudentOnboarding';
import Dashboard from './pages/student/Dashboard';
import AnalyticsDashboard from './pages/professor/AnalyticsDashboard';
import Students from './pages/professor/Students';
import Assignments from './pages/student/Assignments';
import CourseDetail from './pages/common/CourseDetail';
import MindMap from './pages/common/MindMap';
import Chat from './pages/common/Chat';
import StudyMode from './pages/student/StudyMode';
import StudyPlan from './pages/student/StudyPlan';
import ProfessorTests from './pages/professor/ProfessorTests';
import GradingDashboard from './pages/professor/GradingDashboard';
import TakeTest from './pages/student/TakeTest';
import TestResult from './pages/student/TestResult';
import LectureView from './pages/common/LectureView';
import ReviewQueue from './pages/professor/ReviewQueue';
import CourseInsights from './pages/professor/CourseInsights';
import AppLayout from './components/layout/AppLayout';
import CourseLayout from './components/layout/CourseLayout';
import { useAuthStore } from './store/authStore';
import { ToastProvider } from './components/ui/ToastProvider';

type Role = 'professor' | 'student';

const ProtectedRoute = ({ children, requireOnboarding = true }: { children: ReactNode, requireOnboarding?: boolean }) => {
  const { token, role, hasOnboarded } = useAuthStore();
  if (!token) return <Navigate to="/signin" replace />;
  if (requireOnboarding && !hasOnboarded && role === 'student') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
};

/** Pages for one role only; the other role lands on its course list instead. */
const Only = ({ role, children }: { role: Role, children: ReactNode }) =>
  useAuthStore(s => s.role) === role ? <>{children}</> : <Navigate to="/courses" replace />;

/** Same address, different page per role (e.g. a course's Tests tab). */
const ByRole = ({ student, professor }: { student: ReactNode, professor: ReactNode }) =>
  <>{useAuthStore(s => s.role) === 'professor' ? professor : student}</>;

const Landing = () => (useAuthStore(s => s.token) ? <Navigate to="/courses" replace /> : <NewLanding />);

export default function App() {
  const initialize = useAuthStore(state => state.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <ToastProvider />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signin" element={<SignIn />} />

          <Route path="/onboarding" element={
            <ProtectedRoute requireOnboarding={false}><Only role="student"><StudentOnboarding /></Only></ProtectedRoute>
          } />

          {/* Taking a test is full screen, without the app's top bar */}
          <Route path="/tests/:testId" element={<ProtectedRoute><TakeTest /></ProtectedRoute>} />
          <Route path="/tests/:testId/result/:attemptId" element={<ProtectedRoute><Only role="student"><TestResult /></Only></ProtectedRoute>} />

          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/courses" element={<Dashboard />} />
            <Route path="/assignments" element={<Only role="student"><Assignments /></Only>} />
            <Route path="/tutor" element={<Only role="student"><Chat /></Only>} />
            <Route path="/students" element={<Only role="professor"><Students /></Only>} />
            <Route path="/analytics" element={<Only role="professor"><AnalyticsDashboard /></Only>} />

            <Route path="/courses/:courseId" element={<CourseLayout />}>
              <Route index element={<CourseDetail />} />
              <Route path="learn" element={<StudyMode />} />
              <Route path="map" element={<MindMap />} />
              <Route path="tests" element={<ByRole student={<Assignments />} professor={<ProfessorTests />} />} />
              <Route path="tests/:testId/grading" element={<Only role="professor"><GradingDashboard /></Only>} />
              <Route path="lectures/:lectureId" element={<LectureView />} />
              <Route path="plan" element={<Only role="student"><StudyPlan /></Only>} />
              <Route path="ask" element={<Only role="student"><Chat /></Only>} />
              <Route path="review" element={<Only role="professor"><ReviewQueue /></Only>} />
              <Route path="insights" element={<Only role="professor"><CourseInsights /></Only>} />
            </Route>
          </Route>

          {/* Unknown addresses go home instead of rendering a blank page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
