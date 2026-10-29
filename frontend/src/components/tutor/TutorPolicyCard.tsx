import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import { useToastStore } from '../../store/toastStore';
import { HINT_LEVELS } from '../../types/tutor';
import type { HintLevel, TutorPolicySettings } from '../../types/tutor';
import { Card } from '../ui/Card';

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 py-2 cursor-pointer">
      <span>
        <span className="block text-sm text-white">{label}</span>
        <span className="block text-[11px] text-[#888888] mt-0.5">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1 accent-white" />
    </label>
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

  if (!settings) return null;

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

  const select = (field: 'max_hint_level' | 'default_hint_level', value: HintLevel) => {
    const patch: Partial<TutorPolicySettings> = { [field]: value };
    // Keep the default help level within the maximum
    const order = HINT_LEVELS.map(h => h.value);
    if (field === 'max_hint_level' && order.indexOf(settings.default_hint_level) > order.indexOf(value)) {
      patch.default_hint_level = value;
    }
    update(patch);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-4 h-4 text-blue-400" />
        <h3 className="text-lg font-outfit font-medium text-white">Tutor Policy</h3>
        {saving && <span className="ml-auto text-[10px] text-[#888888]">Saving…</span>}
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-[#888888]">Most help allowed</span>
          <select
            value={settings.max_hint_level}
            onChange={e => select('max_hint_level', e.target.value as HintLevel)}
            className="mt-1 w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-3 py-2 text-sm text-white"
          >
            {HINT_LEVELS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-[#888888]">Default help level</span>
          <select
            value={settings.default_hint_level}
            onChange={e => select('default_hint_level', e.target.value as HintLevel)}
            className="mt-1 w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-3 py-2 text-sm text-white"
          >
            {HINT_LEVELS.filter(h => HINT_LEVELS.findIndex(x => x.value === h.value) <= HINT_LEVELS.findIndex(x => x.value === settings.max_hint_level))
              .map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
          </select>
        </label>

        <div className="divide-y divide-[#1A1A1A]">
          <Toggle label="Allow full answers" hint="Off: the tutor stops at worked steps." checked={settings.allow_full_answers} onChange={v => update({ allow_full_answers: v })} />
          <Toggle label="Assessment mode" hint="Hides answers for everyone (guiding questions only)." checked={settings.assessment_mode} onChange={v => update({ assessment_mode: v })} />
          <Toggle label="Automatic during tests" hint="Hides answers for a student while they have a test in progress." checked={settings.auto_assessment_mode} onChange={v => update({ auto_assessment_mode: v })} />
          <Toggle label="Cite or decline" hint="Decline when the materials don't support an answer." checked={settings.cite_or_decline} onChange={v => update({ cite_or_decline: v })} />
        </div>
      </div>
    </Card>
  );
}
