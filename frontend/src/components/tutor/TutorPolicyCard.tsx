import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import { useToastStore } from '../../store/toastStore';
import { HINT_LEVELS } from '../../types/tutor';
import type { HintLevel, TutorPolicySettings } from '../../types/tutor';
import { panel } from '../ui/glass';

const SHORT: Record<HintLevel, string> = { nudge: 'Nudge', guiding_question: 'Question', worked_step: 'Step', full_answer: 'Answer' };
const order = HINT_LEVELS.map(h => h.value);

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 py-2.5 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm text-accent-strong">{label}</span>
        <span className="block text-[11px] text-ink-3 mt-0.5 leading-snug">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`mt-0.5 relative h-6 w-10 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent-200 ${checked ? 'bg-accent' : 'bg-[#d4e1e7]'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </label>
  );
}

/** A row of the four help levels; levels above `limit` are disabled. */
function Ladder({ label, value, limit, onChange }: { label: string; value: HintLevel; limit?: HintLevel; onChange: (v: HintLevel) => void }) {
  const max = limit ? order.indexOf(limit) : order.length - 1;
  const at = order.indexOf(value);
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-1.5 grid grid-cols-4 gap-1 p-1 rounded-full bg-[#f1f5f7]">
        {HINT_LEVELS.map((h, i) => (
          <button key={h.value} type="button" role="radio" aria-checked={value === h.value} disabled={i > max} title={h.description}
            onClick={() => onChange(h.value)}
            className={`h-8 rounded-full text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${
              value === h.value ? 'bg-accent-strong text-white' : i < at ? 'text-accent' : 'text-ink-3 hover:text-accent-strong'}`}>
            {SHORT[h.value]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Professor controls for how much the tutor may help in this course. */
export default function TutorPolicyCard({ courseId }: { courseId: string }) {
  const [settings, setSettings] = useState<TutorPolicySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    tutorApi.getPolicySettings(courseId).then(res => setSettings(res.data)).catch(() => setSettings(null));
  }, [courseId]);

  if (!settings) return <section className={`${panel} p-5 h-full min-h-[200px]`} aria-busy="true" />;

  const update = async (patch: Partial<TutorPolicySettings>) => {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSaving(true);
    try {
      const res = await tutorApi.updatePolicySettings(courseId, patch);
      setSettings(res.data);
    } catch {
      setSettings(previous);
      addToast('Could not update the tutor policy', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setMax = (value: HintLevel) => {
    const patch: Partial<TutorPolicySettings> = { max_hint_level: value };
    // Keep the default help level within the maximum
    if (order.indexOf(settings.default_hint_level) > order.indexOf(value)) patch.default_hint_level = value;
    update(patch);
  };

  return (
    <section className={`${panel} p-5 h-full flex flex-col`}>
      <div className="flex items-center gap-2">
        <span className="grid place-items-center h-8 w-8 rounded-xl bg-accent-wash text-accent"><ShieldCheck size={15} /></span>
        <h2 className="text-[15px] text-accent-strong">Tutor policy</h2>
        <span className="ml-auto text-[11px] text-ink-3">{saving ? 'Saving…' : 'Saved'}</span>
      </div>

      <div className="mt-4 space-y-3">
        <Ladder label="Most help allowed" value={settings.max_hint_level} onChange={setMax} />
        <Ladder label="Starts at" value={settings.default_hint_level} limit={settings.max_hint_level} onChange={v => update({ default_hint_level: v })} />
      </div>

      <div className="mt-3 flex-1 flex flex-col justify-around divide-y divide-[#e2eaeb]">
        <Switch label="Allow full answers" hint="Off: the tutor stops at worked steps." checked={settings.allow_full_answers} onChange={v => update({ allow_full_answers: v })} />
        <Switch label="Assessment mode" hint="Guiding questions only, for everyone." checked={settings.assessment_mode} onChange={v => update({ assessment_mode: v })} />
        <Switch label="Automatic during tests" hint="Hides answers while a student is mid-test." checked={settings.auto_assessment_mode} onChange={v => update({ auto_assessment_mode: v })} />
        <Switch label="Cite or decline" hint="Decline when the material doesn't back an answer." checked={settings.cite_or_decline} onChange={v => update({ cite_or_decline: v })} />
      </div>
    </section>
  );
}
