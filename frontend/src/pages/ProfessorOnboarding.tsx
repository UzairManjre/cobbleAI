import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api';

export default function ProfessorOnboarding() {
  const navigate = useNavigate();
  const { token, setAuth, role } = useAuthStore();

  const [basics, setBasics] = useState({ name: '', institution: '', department: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleStartClass = async () => {
    setIsLoading(true);
    try {
      // 1. Update User Profile (Basics)
      await authApi.updateUser({
        name: basics.name,
        institution: basics.institution,
        department: basics.department,
        has_onboarded: true
      });

      // 2. Update local state
      setAuth(token!, role!, true);
      navigate('/professor/dashboard');
    } catch (err) {
      console.error('Onboarding failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Professor Onboarding</h1>
          <div className="w-12 h-1 bg-[var(--accent)] rounded-full mb-4" />
          <p className="text-white/40 text-sm">Tell us a bit about yourself to get started.</p>
        </div>

        {/* Form */}
        <div className="bg-white/[0.03] border border-[var(--border)] rounded-2xl p-8 space-y-6">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Full Name</label>
            <input
              type="text"
              placeholder="Dr. Jane Smith"
              value={basics.name}
              onChange={e => setBasics({...basics, name: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Institution</label>
            <input
              type="text"
              placeholder="MIT, Stanford, etc."
              value={basics.institution}
              onChange={e => setBasics({...basics, institution: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Department</label>
            <input
              type="text"
              placeholder="Computer Science"
              value={basics.department}
              onChange={e => setBasics({...basics, department: e.target.value})}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
            />
          </div>

          <p className="text-white/20 text-xs">
            You can create your first class and upload materials directly from your dashboard after this step.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleStartClass}
            disabled={isLoading}
            className="flex items-center gap-3 px-6 py-3 bg-[var(--accent)] text-white rounded-xl text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Setting up...' : 'Go to Dashboard'}
            <span className="text-lg">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
