import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { authApi, coursesApi } from '../../api';
import { consentApi } from '../../api/consent';
import { ConsentChoice } from '../../components/common/ResearchConsent';
import { Logo, MarkFigure } from '../../components/ui/Logo';
import { ArrowRight } from 'lucide-react';

export default function StudentOnboarding() {
  const navigate = useNavigate();
  const { token, setAuth, role } = useAuthStore();

  const [classCode, setClassCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [consentText, setConsentText] = useState('');
  const [consent, setConsent] = useState<boolean | null>(null); // nothing pre-selected: opt-in only

  useEffect(() => {
    consentApi.get().then(res => setConsentText(res.data.text)).catch(() => undefined);
  }, []);

  const handleJoin = async () => {
    setIsLoading(true);
    try {
      // 1. Update User Profile
      await authApi.updateUser({ has_onboarded: true });

      // 2. Record the research decision, if one was made (undecided students are asked again later)
      if (consent !== null) {
        try {
          await consentApi.set(consent);
        } catch (err) {
          console.warn('Failed to save research consent:', err);
        }
      }

      // 3. Join class if code provided
      if (classCode) {
        try {
          await coursesApi.join(classCode);
        } catch (err) {
          console.warn('Failed to join class:', err);
          useToastStore.getState().addToast('That join code did not work. You can join from your Courses page.', 'error');
          // Continue anyway, not critical
        }
      }

      // 4. Update local state
      setAuth(token!, role!, true);
      navigate('/courses');
    } catch (err) {
      console.error('Onboarding failed', err);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] bg-canvas">
      <aside className="bg-accent text-white px-6 md:px-10 py-8 flex flex-col justify-between min-h-[240px] lg:min-h-0 selection:bg-white selection:text-accent">
        <Logo markClassName="h-6 w-auto" />
        <div className="py-10 lg:py-0">
          <div className="hidden lg:block mb-12"><MarkFigure callout="your class" /></div>
          <p className="font-display font-medium text-[clamp(2.2rem,4.4vw,4.2rem)] leading-[0.95] tracking-[-0.04em] max-w-md">one step, then your class.</p>
        </div>
        <p className="annot text-white/70 hidden lg:block">You can skip both questions</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 md:px-10">
        <div className="w-full max-w-[460px] space-y-8">
          <h1 className="font-display text-3xl font-medium tracking-[-0.03em]">Welcome to Cobble</h1>

          <div className="space-y-1.5">
            <label htmlFor="join-code" className="block text-sm text-ink-2">Class invite code <span className="text-ink-4">(optional)</span></label>
            <input
              id="join-code"
              type="text"
              placeholder="ABC-123"
              value={classCode}
              onChange={e => setClassCode(e.target.value)}
              className="w-full h-12 bg-surface border border-line-strong rounded-xl px-4 text-[15px] text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-50 font-display tracking-[0.12em] uppercase"
            />
            <p className="text-xs text-ink-3">Your professor shares it from the course page. You can also join later from Courses.</p>
          </div>

          {consentText && (
            <div className="border-t border-line pt-6">
              <ConsentChoice text={consentText} value={consent} onChange={setConsent} disabled={isLoading} />
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-full bg-accent text-white font-display font-medium hover:bg-accent-strong transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Setting up...' : 'Continue to your classes'} <ArrowRight size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}