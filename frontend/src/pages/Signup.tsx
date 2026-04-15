import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api';
import AuthLayout from '../components/auth/AuthLayout';

interface SignupProps {
  role: 'student' | 'professor';
}

export default function Signup({ role }: SignupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // 1. Register
      await authApi.register({ email, password, name, role });

      // 2. Login immediately after
      const res = await authApi.login(email, password);

      setAuth(res.data.access_token, role, false);
      navigate(`/onboarding/${role}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed. Try a different email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title={role === 'student' ? 'Student' : 'Professor'} role={role}>
      <div className="space-y-6">
        <p className="text-white/50 text-sm">Create your account</p>

        <form onSubmit={handleSignup} className="space-y-4">
          {error && (
            <div className="text-[var(--accent)] text-xs font-medium bg-[var(--accent-surface)] border border-[var(--accent-border)] px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/40 mb-1.5 tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2.5 bg-[var(--accent)] text-white rounded-xl text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Sign Up'}
            </button>
            <Link to={`/login/${role}`} className="text-white/30 text-xs font-medium hover:text-white/60 transition-colors">
              Already registered?
            </Link>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}
