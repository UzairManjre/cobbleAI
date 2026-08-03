import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authApi } from '../../api';
import { ArrowLeft } from 'lucide-react';

export default function ProfessorAuthFlow({ initialStep = 'welcome' }: { initialStep?: 'welcome' | 'login' | 'signup' | 'action' }) {
  const [step, setStep] = useState<'welcome' | 'login' | 'signup' | 'action'>(initialStep);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      let res;
      if (step === 'login') {
        res = await authApi.login(email, password);
      } else {
        await authApi.register({
          email,
          password,
          name,
          role: 'professor'
        });
        try {
          res = await authApi.login(email, password);
        } catch (loginErr) {
          setStep('login');
          setSuccessMsg('Account created — please log in.');
          setIsLoading(false);
          return;
        }
      }

      const token = res.data.access_token;
      useAuthStore.setState({ token });

      const userRes = await authApi.getCurrentUser();
      
      if (userRes.data.role !== 'professor') {
        useAuthStore.setState({ token: null });
        throw new Error(`This email is registered as a ${userRes.data.role}. Please use the correct login page.`);
      }

      setAuth(token, userRes.data.role, userRes.data.has_onboarded);
      navigate('/professor/dashboard');
      
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4 selection:bg-white/20">
      
      <div className="w-full max-w-[400px]">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-12">
          <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12 mb-6">
            <path d="M4 6H14L10 14H20" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className="text-2xl font-outfit font-light tracking-tight text-white mb-2">
            Cobble for Professors
          </h1>
          <p className="text-[#888888] text-sm text-center font-inter">
            Access your courses, insights, and AI tools.
          </p>
        </div>

        {/* Auth Container */}
        <div className="bg-[#0A0A0A] border border-[#1A1A1A] p-8 rounded-2xl w-full shadow-2xl">
          {step === 'welcome' && (
            <div className="flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-300">
              <button 
                onClick={() => setStep('login')} 
                className="w-full py-3.5 bg-white text-black rounded-lg font-medium hover:bg-[#F0F0F0] active:scale-[0.98] transition-all text-sm"
              >
                Log in
              </button>
              <button 
                onClick={() => setStep('signup')} 
                className="w-full py-3.5 bg-transparent text-white border border-[#333333] rounded-lg font-medium hover:bg-[#111111] active:scale-[0.98] transition-all text-sm"
              >
                Create an account
              </button>
            </div>
          )}

          {(step === 'login' || step === 'signup') && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center gap-3 mb-6">
                <button 
                  onClick={() => setStep('welcome')}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-[#111111] text-[#888888] hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-lg text-white font-medium">
                  {step === 'login' ? 'Welcome back' : 'Create your account'}
                </h2>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {error && (
                  <div className="text-xs bg-[#1A0505] text-[#FF4444] border border-[#331111] p-3 rounded-lg">
                    {error}
                  </div>
                )}
                {successMsg && (
                  <div className="text-xs bg-[#051A05] text-[#44FF44] border border-[#113311] p-3 rounded-lg">
                    {successMsg}
                  </div>
                )}

                <div className="space-y-3">
                  {step === 'signup' && (
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full bg-[#050505] border border-[#1A1A1A] focus:border-white/40 rounded-lg px-4 py-3 text-white placeholder:text-[#888888] outline-none transition-all text-sm"
                      required
                    />
                  )}
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@university.edu"
                    className="w-full bg-[#050505] border border-[#1A1A1A] focus:border-white/40 rounded-lg px-4 py-3 text-white placeholder:text-[#888888] outline-none transition-all text-sm"
                    required
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-[#050505] border border-[#1A1A1A] focus:border-white/40 rounded-lg px-4 py-3 text-white placeholder:text-[#888888] outline-none transition-all text-sm tracking-wide"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-white text-black py-3.5 rounded-lg text-sm font-medium hover:bg-[#F0F0F0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Processing...' : step === 'login' ? 'Continue' : 'Sign up'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-[#888888] text-xs">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
