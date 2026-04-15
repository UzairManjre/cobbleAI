import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import AuthLayout from '../components/auth/AuthLayout';

const API_URL = 'http://127.0.0.1:8000';

interface LoginProps {
  role: 'student' | 'professor';
}

export default function Login({ role }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      
      const res = await axios.post(`${API_URL}/auth/jwt/login`, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const userRes = await axios.get(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${res.data.access_token}` }
      });

      // Role check: if trying to login as student but account is professor, or vice versa
      if (userRes.data.role !== role) {
        throw new Error(`This email is registered as a ${userRes.data.role}. Please use the correct login page.`);
      }

      setAuth(res.data.access_token, userRes.data.role, userRes.data.has_onboarded);
      
      if (!userRes.data.has_onboarded) {
        navigate(`/onboarding/${role}`);
      } else {
        navigate(role === 'professor' ? '/dashboard' : '/chat');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title={role === 'student' ? 'Student' : 'Professor'} role={role}>
      <div className="space-y-6">
        <p className="text-white/50 text-sm">Sign in to continue</p>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="text-[var(--accent)] text-xs font-medium bg-[var(--accent-surface)] border border-[var(--accent-border)] px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

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
              {isLoading ? 'Signing in...' : 'Login'}
            </button>
            <Link to="#" className="text-white/30 text-xs font-medium hover:text-white/60 transition-colors">
              Forgot password?
            </Link>
          </div>
        </form>

        <div className="pt-6 border-t border-[var(--border)]">
          <Link
            to={`/signup/${role}`}
            className="inline-flex items-center gap-2 text-white/40 hover:text-white text-sm font-medium transition-colors"
          >
            Create new account &rarr;
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
