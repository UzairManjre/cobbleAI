import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, HelpCircle, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { faqApi } from '../../api/insights';
import type { FAQEntry } from '../../api/insights';
import { useToastStore } from '../../store/toastStore';
import CitationList from '../tutor/CitationList';

function errorDetail(err: unknown, fallback: string) {
  return (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;
}

function EntryCard({ entry, courseId, onChange }: { entry: FAQEntry; courseId: string; onChange: () => void }) {
  const [question, setQuestion] = useState(entry.question);
  const [answer, setAnswer] = useState(entry.answer);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addToast = useToastStore(s => s.addToast);
  const dirty = question !== entry.question || answer !== entry.answer;

  const save = async (status?: FAQEntry['status']) => {
    setBusy(true);
    try {
      await faqApi.update(entry.id, { question, answer, ...(status ? { status } : {}) });
      addToast(status === 'published' ? 'Published to students' : status === 'draft' ? 'Moved back to drafts' : 'Saved', 'success');
      onChange();
    } catch (err) {
      addToast(errorDetail(err, 'Could not save'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    try {
      await faqApi.remove(entry.id);
      onChange();
    } catch {
      addToast('Could not delete', 'error');
    }
  };

  return (
    <li className="border border-[#1A1A1A] rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest">
        <span className={entry.status === 'published' ? 'text-emerald-400' : 'text-amber-400'}>{entry.status}</span>
        {entry.cluster_topic && <span className="text-[#666666]">from “{entry.cluster_topic}” ({entry.cluster_size} questions)</span>}
        {entry.support_level && entry.support_level !== 'strong' && <span className="text-amber-300">{entry.support_level} support: check it</span>}
      </div>
      <input value={question} onChange={e => setQuestion(e.target.value)} aria-label="FAQ question"
        className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-3 py-2 text-sm text-white" />
      <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={4} aria-label="FAQ answer" placeholder="Answer"
        className="w-full bg-[#111111] border border-[#1A1A1A] rounded-lg px-3 py-2 text-xs text-[#DDDDDD]" />
      {entry.citations.length > 0 && <CitationList courseId={courseId} citations={entry.citations} />}
      <div className="flex flex-wrap gap-2">
        {entry.status === 'draft' ? (
          <button onClick={() => save('published')} disabled={busy || !answer.trim()}
            className="px-3 py-1.5 rounded-lg text-xs bg-white text-black font-medium flex items-center gap-1.5 disabled:opacity-40">
            <Eye className="w-3.5 h-3.5" /> {dirty ? 'Save and publish' : 'Publish'}
          </button>
        ) : (
          <button onClick={() => save('draft')} disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white flex items-center gap-1.5">
            <EyeOff className="w-3.5 h-3.5" /> Unpublish
          </button>
        )}
        {dirty && (
          <button onClick={() => save()} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white">Save</button>
        )}
        <button onClick={remove} className="ml-auto px-3 py-1.5 rounded-lg text-xs text-[#888888] hover:text-red-400 flex items-center gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> {confirmDelete ? 'Click again to delete' : 'Delete'}
        </button>
      </div>
    </li>
  );
}

/** Weekly FAQ: draft answers from the top question clusters, edit them, publish to students. */
export default function FAQEditor({ courseId }: { courseId: string }) {
  const [entries, setEntries] = useState<FAQEntry[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    faqApi.list(courseId).then(res => { if (!cancelled) setEntries(res.data.entries); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId, reloadKey]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const draft = async () => {
    setDrafting(true);
    try {
      const res = await faqApi.draft(courseId);
      const { created, skipped } = res.data;
      const note = skipped.length ? ` ${skipped.length} topic${skipped.length === 1 ? ' was' : 's were'} skipped (not covered by the materials).` : '';
      addToast(created.length ? `Drafted ${created.length} entr${created.length === 1 ? 'y' : 'ies'}.${note}` : `Nothing new to draft.${note}`, created.length ? 'success' : 'info');
      reload();
    } catch (err) {
      addToast(errorDetail(err, 'Could not draft the FAQ'), 'error');
    } finally {
      setDrafting(false);
    }
  };

  const add = async () => {
    try {
      await faqApi.create(courseId, 'New question');
      reload();
    } catch {
      addToast('Could not add an entry', 'error');
    }
  };

  const published = entries.filter(e => e.status === 'published').length;

  return (
    <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-white flex items-center gap-2"><HelpCircle className="w-4 h-4 text-sky-400" /> Course FAQ</h2>
          <p className="text-[11px] text-[#888888] mt-1">
            Answers are drafted with citations from the course materials. Students only see entries you publish ({published} published).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={draft} disabled={drafting}
            className="px-3 py-1.5 rounded-lg text-xs bg-white text-black font-medium flex items-center gap-1.5 disabled:opacity-40">
            {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Draft from this week's questions
          </button>
          <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs border border-[#333333] text-white flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-[#666666]">No FAQ entries yet. Build the question digest first, then draft from it.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map(e => <EntryCard key={`${e.id}-${reloadKey}`} entry={e} courseId={courseId} onChange={reload} />)}
        </ul>
      )}
    </section>
  );
}
