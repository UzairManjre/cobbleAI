import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import studentAuth from '../assets/student_auth.png';
import professorAuth from '../assets/professor_auth.png';

export default function LandingPage() {
  const navigate = useNavigate();
  const { token, role, hasOnboarded } = useAuthStore();

  // If already logged in, redirect
  const handleStart = () => {
    if (token) {
      if (!hasOnboarded) navigate(`/onboarding/${role}`);
      else navigate(role === 'professor' ? '/dashboard' : '/chat');
    } else {
      // Scroll to role selection
      document.getElementById('role-select')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white flex flex-col">
      {/* Header */}
      <header className="px-8 md:px-12 py-5 flex items-center justify-between border-b border-[var(--border)]">
        <h1 className="text-xl font-bold tracking-tight text-white">Cobble</h1>

        <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium text-white/50">
          <a href="#about" className="hover:text-white transition-colors">About us</a>
          <span className="text-white/10">|</span>
          <a href="#how" className="hover:text-white transition-colors">How it Works</a>
        </nav>

        <button
          onClick={handleStart}
          className="px-5 py-2 bg-[var(--accent)] text-white rounded-xl text-[13px] font-semibold hover:bg-[var(--accent-hover)] transition-colors"
        >
          Start Now
        </button>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-16 max-w-2xl">
          <p className="text-[var(--accent)] text-sm font-semibold tracking-wide uppercase mb-4">
            AI-Powered Education
          </p>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Continue As
          </h2>
          <p className="text-white/40 text-base max-w-md mx-auto leading-relaxed">
            Choose your role to get started with Cobble's intelligent learning platform.
          </p>
        </div>

        {/* Role Cards */}
        <div id="role-select" className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
          {/* Student Card */}
          <div
            onClick={() => navigate('/login/student')}
            className="group cursor-pointer bg-white/[0.03] border border-[var(--border)] rounded-2xl p-8 hover:border-[var(--accent-border)] hover:bg-white/[0.05] transition-all duration-300"
          >
            <div className="w-full aspect-[4/3] mb-6 rounded-xl overflow-hidden bg-white/[0.02] flex items-center justify-center">
              <img
                src={studentAuth}
                alt="Student"
                className="w-full h-full object-contain opacity-90 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
              />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Student</h3>
            <p className="text-white/40 text-sm leading-relaxed mb-6">
              Master your courses with interconnected knowledge graphs and AI tutoring.
            </p>
            <div className="flex gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); navigate('/login/student'); }}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Login
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate('/signup/student'); }}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-white/70 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Join Cobble
              </button>
            </div>
          </div>

          {/* Professor Card */}
          <div
            onClick={() => navigate('/login/professor')}
            className="group cursor-pointer bg-white/[0.03] border border-[var(--border)] rounded-2xl p-8 hover:border-[var(--accent-border)] hover:bg-white/[0.05] transition-all duration-300"
          >
            <div className="w-full aspect-[4/3] mb-6 rounded-xl overflow-hidden bg-white/[0.02] flex items-center justify-center">
              <img
                src={professorAuth}
                alt="Professor"
                className="w-full h-full object-contain opacity-90 group-hover:opacity-100 group-hover:scale-[1.03] transition-all duration-500"
              />
            </div>
            <h3 className="text-2xl font-semibold mb-2">Professor</h3>
            <p className="text-white/40 text-sm leading-relaxed mb-6">
              Transform documents into intelligent course ecosystems with AI.
            </p>
            <div className="flex gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); navigate('/login/professor'); }}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Login
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate('/signup/professor'); }}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-white/70 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Join Cobble
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-white/15 text-xs font-medium tracking-widest uppercase">
        Design Intelligence for Education
      </footer>
    </div>
  );
}
