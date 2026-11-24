import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { consentApi } from '../../api/consent';
import type { ConsentStatus } from '../../api/consent';
import { useToastStore } from '../../store/toastStore';

interface ChoiceProps {
  text: string;
  value: boolean | null;
  onChange: (consent: boolean) => void;
  disabled?: boolean;
}

/** The opt-in research consent question: explicit yes or no, nothing pre-selected. */
export function ConsentChoice({ text, value, onChange, disabled }: ChoiceProps) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="annot text-accent flex items-center gap-2 mb-2">
        <FlaskConical className="w-3.5 h-3.5" /> Research study (optional)
      </legend>
      <p className="text-sm text-ink-2 leading-relaxed max-w-4xl">{text}</p>
      <div className="flex flex-wrap gap-2">
        {[{ v: true, label: 'Yes, include my data' }, { v: false, label: 'No thanks' }].map(o => (
          <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v}
            className={`h-9 px-4 rounded-full font-display text-sm border transition-colors cursor-pointer ${value === o.v ? 'bg-accent text-white border-accent' : 'bg-surface border-line-strong text-ink hover:border-ink'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Asks students who have not decided yet (or whose consent predates the current wording). */
export default function ResearchConsentBanner() {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    consentApi.get().then(res => { if (!cancelled) setStatus(res.data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!status || !status.needs_decision) return null;

  const decide = async (consent: boolean) => {
    setSaving(true);
    try {
      setStatus((await consentApi.set(consent)).data);
      addToast(consent ? 'Thank you for taking part' : 'Your data will not be used for research', 'success');
    } catch {
      addToast('Could not save your choice', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-5 md:px-8 lg:px-12 pt-6">
      <div className="max-w-6xl mx-auto bg-accent-wash border border-accent-100 rounded-2xl px-5 py-4">
        <ConsentChoice text={status.text} value={null} onChange={decide} disabled={saving} />
      </div>
    </div>
  );
}
