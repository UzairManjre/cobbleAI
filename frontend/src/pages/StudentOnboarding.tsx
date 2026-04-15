import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi, coursesApi } from '../api';

export default function StudentOnboarding() {
  const navigate = useNavigate();
  const { token, setAuth, role } = useAuthStore();

  const [name, setName] = useState('');
  const [classCode, setClassCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    setIsLoading(true);
    try {
      // 1. Update User Profile
      await authApi.updateUser({
        name: name,
        has_onboarded: true
      });

      // 2. Join class if code provided
      if (classCode) {
        try {
          await coursesApi.join(classCode);
        } catch (err) {
          console.warn('Failed to join class:', err);
          // Continue anyway, not critical
        }
      }

      // 3. Update local state
      setAuth(token!, role!, true);
      navigate('/chat');
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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Welcome to Cobble</h1>
          <div className="w-12 h-1 bg-[var(--accent)] rounded-full mb-4" />
          <p className="text-white/40 text-sm">Let's get you set up in just a moment.</p>
        </div>

        {/* Form */}
        <div className="bg-white/[0.03] border border-[var(--border)] rounded-2xl p-8 space-y-6">
          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Full Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Join Code (Optional)</label>
            <input
              type="text"
              placeholder="ABC-123"
              value={classCode}
              onChange={e => setClassCode(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors font-mono"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="flex items-center gap-3 px-6 py-3 bg-[var(--accent)] text-white rounded-xl text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Setting up...' : 'Join Cobble'}
            <span className="text-lg">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
