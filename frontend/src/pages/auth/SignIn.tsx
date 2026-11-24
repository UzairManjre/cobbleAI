import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';
import { Logo, MarkFigure } from '../../components/ui/Logo';
import { apiErrorDetail } from '../../utils/apiError';

type Role = 'student' | 'professor';

const inputClass =
  'w-full h-12 bg-surface border border-line-strong focus:border-accent focus:ring-2 focus:ring-accent-50 rounded-xl px-4 text-ink placeholder:text-ink-4 outline-none transition-[border-color,box-shadow] text-[15px]';

/** One page for logging in and signing up, for students and professors.
 *  Logging in needs no role: the account already has one. */
export default function SignIn() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const role: Role = params.get('role') === 'professor' ? 'professor' : 'student';
  const setQuery = (next: { mode?: string; role?: Role }) =>
    setParams({ mode: next.mode ?? mode, role: next.role ?? role }, { replace: true });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { token, role: currentRole, hasOnboarded, setAuth } = useAuthStore();
  const navigate = useNavigate();

  // Already signed in: skip straight into the app
  if (token && currentRole) {
    return <Navigate to={currentRole === 'student' && !hasOnboarded ? '/onboarding' : '/courses'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (mode === 'signup') {
        await authApi.register({ email, password, name, role });
      }
      const res = await authApi.login(email, password);
      const accessToken = res.data.access_token;
      useAuthStore.setState({ token: accessToken });
      const { data: user } = await authApi.getCurrentUser();
      setAuth(accessToken, user.role, Boolean(user.has_onboarded), user);
      navigate(user.role === 'student' && !user.has_onboarded ? '/onboarding' : '/courses', { replace: true });
    } catch (err: any) {
      useAuthStore.setState({ token: null });
      setError(apiErrorDetail(err, mode === 'login' ? 'Wrong email or password.' : 'Could not create the account.'));
    } finally {
      setIsLoading(false);
    }
  };

  const field = (id: string, label: string, input: React.ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm text-ink-2">{label}</label>
      {input}
    </div>
  );

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-canvas">
      {/* Blue field: the brand side */}
      <aside className="relative bg-accent text-white px-6 md:px-10 py-8 flex flex-col justify-between min-h-[260px] lg:min-h-0 selection:bg-white selection:text-accent">
        <Link to="/" aria-label="Cobble home" className="w-fit"><Logo markClassName="h-6 w-auto" /></Link>
        <div className="py-10 lg:py-0">
          <div className="hidden lg:block mb-12"><MarkFigure callout={mode === 'login' ? 'you, again' : 'you'} /></div>
          <p className="font-display font-medium text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[0.95] tracking-[-0.04em] max-w-md">
            {mode === 'login' ? 'welcome back.' : role === 'professor' ? 'bring your course.' : 'join your class.'}
          </p>
          <p className="mt-6 max-w-sm text-white/85 leading-relaxed">
            {role === 'professor' && mode === 'signup'
              ? 'Create a course, upload your materials, then share the invite code with your students.'
              : 'A tutor that answers from your course materials and shows where each answer came from.'}
          </p>
        </div>
        <p className="annot text-white/70 hidden lg:block">Runs on campus hardware</p>
      </aside>

      {/* Form side */}
      <main className="flex items-center justify-center px-6 py-12 md:px-10">
        <div className="w-full max-w-[420px]">
          <h1 className="sr-only">{mode === 'login' ? 'Log in' : 'Create your account'}</h1>

          <div className="inline-flex gap-1 p-1 bg-sunken rounded-full" role="tablist" aria-label="Log in or sign up">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setQuery({ mode: m })}
                className={`px-5 h-9 rounded-full font-display text-sm transition-colors cursor-pointer ${mode === m ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-ink-3 hover:text-ink'}`}
              >
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate={false}>
            {error && (
              <div role="alert" className="text-sm bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-xl">{error}</div>
            )}

            {mode === 'signup' && (
              <>
                <fieldset>
                  <legend className="block text-sm text-ink-2 mb-1.5">I am a</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(['student', 'professor'] as Role[]).map(r => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={role === r}
                        onClick={() => setQuery({ role: r })}
                        className={`h-12 rounded-xl border font-display text-[15px] capitalize transition-colors cursor-pointer ${role === r ? 'border-accent bg-accent-wash text-accent' : 'border-line-strong bg-surface text-ink-3 hover:text-ink hover:border-ink-4'}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {field('name', 'Full name', <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoComplete="name" className={inputClass} required />)}
              </>
            )}
            {field('email', 'Email', <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@university.edu" autoComplete="email" className={inputClass} required />)}
            {field('password', 'Password', <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={inputClass} required />)}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-full bg-accent text-white font-display font-medium hover:bg-accent-strong active:scale-[0.99] transition-[background-color,transform] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? 'Please wait...' : mode === 'login' ? 'Log in' : `Sign up as ${role}`}
            </button>
          </form>

          <p className="mt-8 text-ink-3 text-xs">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
}