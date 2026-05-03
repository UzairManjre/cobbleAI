import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api';
import { ArrowLeft } from 'lucide-react';

export default function StudentAuthFlow({ initialStep = 'welcome' }: { initialStep?: 'welcome' | 'login' | 'signup' | 'action' }) {
  const [step, setStep] = useState<'welcome' | 'login' | 'signup' | 'action'>(initialStep);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      let res;
      if (step === 'login') {
        res = await authApi.login(email, password);
      } else {
        res = await authApi.register({
          email,
          password,
          name,
          role: 'student'
        });
      }

      const token = res.data.access_token;
      localStorage.setItem('token', token);
      useAuthStore.setState({ token });

      const userRes = await authApi.getCurrentUser();
      
      if (userRes.data.role !== 'student') {
        localStorage.removeItem('token');
        useAuthStore.setState({ token: null });
        throw new Error(`This email is registered as a ${userRes.data.role}. Please use the correct login page.`);
      }

      setAuth(token, userRes.data.role, userRes.data.has_onboarded);
      setStep('action');
      
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] relative overflow-hidden flex flex-col font-serif">
      {/* Header */}
      <header className="px-8 md:px-20 py-8 flex items-center justify-between relative z-20">
        <h1 onClick={() => navigate('/')} className="text-3xl font-bold tracking-tight text-black cursor-pointer">
          Cobble
        </h1>
        <nav className="hidden md:flex items-center gap-6 text-[1.05rem] font-medium text-black">
          <a href="#" className="hover:text-[#FF4D5B] transition-colors">About us</a>
          <span className="text-black/10">|</span>
          <a href="#" className="hover:text-[#FF4D5B] transition-colors">How it Works</a>
        </nav>
        <button onClick={() => navigate('/')} className="px-8 py-3 bg-[#FF4D5B] text-white rounded-full text-base font-bold hover:bg-[#e0444f] transition-colors shadow-sm hover:shadow-md hover:-translate-y-0.5 duration-200">
          Start Now
        </button>
      </header>

      <main className="flex-1 relative w-full h-full flex flex-col justify-center">
        
        {/* Dark Red Horizontal Band */}
        <div className="absolute top-[50%] -translate-y-1/2 left-0 w-full h-[320px] bg-[#9B1C1C] z-0 shadow-lg"></div>

        {/* Content Container spanning the screen height */}
        <div className="max-w-[1300px] mx-auto w-full px-8 md:px-12 relative z-10 flex h-full">
            
            {/* Left Content Column (Text & Form) */}
            <div className="w-full lg:w-[45%] h-full flex flex-col justify-center relative">
               
               {/* "Student" Text touching the top of the band */}
               <div className="absolute bottom-[calc(50%+160px)] left-0 z-10 pointer-events-none translate-y-[15%]">
                 <h1 className="text-[5.5rem] md:text-[8rem] font-serif tracking-tighter text-[#9B1C1C] m-0 leading-none drop-shadow-sm">
                   Student
                 </h1>
               </div>
               
               {/* Form Content - Centered in the band */}
               <div className="absolute top-[50%] -translate-y-1/2 left-0 w-full max-w-[440px] z-20">
                  
                  {step === 'welcome' && (
                    <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pl-2">
                      <button 
                        onClick={() => setStep('login')} 
                        className="px-12 py-4 rounded-full bg-[#FF4D5B] text-white text-xl font-semibold hover:bg-[#e0444f] transition-all shadow-[0_8px_20px_rgba(255,77,91,0.25)] border border-[#FF4D5B]/50 hover:-translate-y-1"
                      >
                        Login
                      </button>
                      <button 
                        onClick={() => setStep('signup')} 
                        className="px-12 py-4 rounded-full bg-[#FF4D5B] text-white text-xl font-semibold hover:bg-[#e0444f] transition-all shadow-[0_8px_20px_rgba(255,77,91,0.25)] border border-[#FF4D5B]/50 hover:-translate-y-1"
                      >
                        Sign up
                      </button>
                    </div>
                  )}

                  {(step === 'login' || step === 'signup') && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500 w-full pl-2">
                      <div className="flex items-center gap-3 mb-3">
                        <button 
                          onClick={() => setStep('welcome')}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h2 className="text-xl text-white font-serif tracking-tight m-0">
                          {step === 'login' ? 'Welcome back' : 'Create account'}
                        </h2>
                      </div>

                      <form onSubmit={handleAuth} className="space-y-2 font-sans">
                        {error && (
                          <div className="text-xs font-medium bg-white/10 text-white border border-white/20 px-4 py-2 rounded-xl backdrop-blur-sm shadow-inner">
                            {error}
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          {step === 'signup' && (
                            <input
                              type="text"
                              value={name}
                              onChange={e => setName(e.target.value)}
                              placeholder="Full Name"
                              className="w-full bg-[#FDF0EF] border-2 border-transparent focus:border-white/30 rounded-full px-5 py-2.5 text-[#9B1C1C] placeholder:text-[#9B1C1C]/50 outline-none transition-all text-sm font-semibold shadow-inner"
                              required
                            />
                          )}
                          <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="Email (you@university.edu)"
                            className="w-full bg-[#FDF0EF] border-2 border-transparent focus:border-white/30 rounded-full px-5 py-2.5 text-[#9B1C1C] placeholder:text-[#9B1C1C]/50 outline-none transition-all text-sm font-semibold shadow-inner"
                            required
                          />
                          <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Password (••••••••)"
                            className="w-full bg-[#FDF0EF] border-2 border-transparent focus:border-white/30 rounded-full px-5 py-2.5 text-[#9B1C1C] placeholder:text-[#9B1C1C]/50 outline-none transition-all text-sm font-semibold tracking-widest shadow-inner"
                            required
                          />
                        </div>

                        <div className="flex gap-2.5 pt-1.5">
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 bg-[#FF4D5B] text-white py-2.5 rounded-full text-sm font-bold hover:bg-[#e0444f] transition-all disabled:opacity-50 shadow-[0_4px_14px_0_rgba(255,77,91,0.39)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(255,77,91,0.4)]"
                          >
                            {isLoading ? 'Processing...' : step === 'login' ? 'Login' : 'Sign up'}
                          </button>

                          <button
                            type="button"
                            className="flex-[0.85] bg-white text-[#9B1C1C] py-2.5 rounded-full text-sm font-bold hover:bg-[#FDF0EF] transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-lg"
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Google
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {step === 'action' && (
                    <div className="animate-in fade-in zoom-in-95 duration-500 w-full pl-2">
                      <div className="space-y-2 mb-6">
                        <h2 className="text-3xl font-bold text-white tracking-tight">First Time?</h2>
                        <p className="text-white/80 font-sans text-sm">
                          Welcome to Cobble AI. Choose how you want to get started.
                        </p>
                      </div>

                      <div className="flex gap-4 font-sans">
                        <button
                          onClick={() => navigate('/onboarding/student')}
                          className="flex-1 bg-[#FF4D5B] text-white py-4 rounded-2xl text-[15px] font-bold hover:bg-[#e0444f] transition-all shadow-[0_4px_14px_0_rgba(255,77,91,0.39)] hover:-translate-y-1 hover:shadow-xl"
                        >
                          Join Class
                        </button>
                        <button
                          onClick={() => navigate('/chat')}
                          className="flex-1 bg-white text-[#9B1C1C] py-4 rounded-2xl text-[15px] font-bold hover:bg-[#FDF0EF] transition-all hover:-translate-y-1 shadow-lg hover:shadow-xl"
                        >
                          My Classes
                        </button>
                      </div>
                    </div>
                  )}

               </div>
            </div>

            {/* Right Content Column (Illustration) */}
            <div className="hidden lg:block w-[55%] h-full relative">
               {/* Illustration overlapping the band */}
               <div className="absolute top-[45%] -translate-y-1/2 right-[-2rem] xl:right-[-4rem] w-[110%] max-w-[800px] h-[700px] pointer-events-none">
                 <img 
                   src="/student_illustration.png" 
                   alt="Student Illustration" 
                   className="w-full h-full object-contain drop-shadow-md" 
                   onError={(e) => e.currentTarget.style.display = 'none'} 
                 />
               </div>
            </div>

        </div>
      </main>
    </div>
  );
}
