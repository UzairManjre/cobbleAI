import React from 'react';
import { useNavigate } from 'react-router-dom';
import studentAuth from '../../assets/student_auth.png';
import professorAuth from '../../assets/professor_auth.png';

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  role: 'student' | 'professor';
}

export default function AuthLayout({ children, title, role }: AuthLayoutProps) {
  const navigate = useNavigate();
  const illustration = role === 'student' ? studentAuth : professorAuth;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      {/* Header */}
      <header className="px-8 md:px-12 py-5 flex items-center justify-between border-b border-[var(--border)]">
        <h1
          onClick={() => navigate('/')}
          className="text-xl font-bold tracking-tight text-white cursor-pointer"
        >
          Cobble
        </h1>

        <nav className="hidden md:flex items-center gap-6 text-[13px] font-medium text-white/50">
          <a href="#" className="hover:text-white transition-colors">About us</a>
          <span className="text-white/10">|</span>
          <a href="#" className="hover:text-white transition-colors">How it Works</a>
        </nav>

        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 bg-[var(--accent)] text-white rounded-xl text-[13px] font-semibold hover:bg-[var(--accent-hover)] transition-colors"
        >
          Start Now
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Auth Form Side */}
          <div className="w-full max-w-md mx-auto lg:mx-0">
            <h2 className="text-4xl font-bold tracking-tight text-white mb-2">{title}</h2>
            <div className="w-12 h-1 bg-[var(--accent)] rounded-full mb-8" />
            {children}
          </div>

          {/* Illustration Side */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="w-full max-w-[420px] aspect-square relative">
              <div className="absolute inset-0 bg-[var(--accent)]/5 rounded-3xl" />
              <img
                src={illustration}
                alt={role}
                className="relative z-10 w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
