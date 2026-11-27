import { apiErrorDetail } from '../../utils/apiError';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { faqApi } from '../../api/insights';
import type { FAQEntry } from '../../api/insights';
import { useToastStore } from '../../store/toastStore';
import CitationList from '../tutor/CitationList';
import { CLAY, panel, pillDark, pillLine } from '../ui/glass';

const smallBtn = 'h-7 px-3 rounded-full text-xs transition-colors cursor-pointer disabled:opacity-40';

function Entry({ entry, courseId, onChange, startOpen }: { entry: FAQEntry; courseId: string; onChange: () => void; startOpen: boolean }) {
  const [editing, setEditing] = useState(startOpen);
  const [question, setQuestion] = useState(entry.question);
  const [answer, setAnswer] = useState(entry.answer);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const addToast = useToastStore(s => s.addToast);
  const live = entry.status === 'published';
  const weak = entry.support_level && entry.support_level !== 'strong';

  const save = async (status?: FAQEntry['status']) => {
    setBusy(true);
    try {
      await faqApi.update(entry.id, { question, answer, ...(status ? { status } : {}) });
      addToast(status === 'published' ? 'Published to students' : status === 'draft' ? 'Hidden from students' : 'Saved', 'success');
      onChange();
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not save'), 'error');
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
    <li className="rounded-2xl bg-[#f1f5f7] p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-[7px] h-2 w-2 rounded-full shrink-0 ${live ? 'bg-accent' : 'bg-[#c3d8e0]'}`} title={live ? 'Published' : 'Draft'} />
        <button type="button" onClick={() => setEditing(e => !e)} className="min-w-0 flex-1 text-left cursor-pointer" aria-expanded={editing}>
          <span className="block text-sm text-accent-strong">{entry.question}</span>
          {!editing && <span className="mt-1 block text-xs text-ink-3 line-clamp-2">{entry.answer || 'No answer yet'}</span>}
        </button>
        <span className={`shrink-0 h-6 px-2.5 inline-flex items-center rounded-full text-[11px] ${live ? 'bg-accent-wash text-accent' : 'bg-white text-ink-3'}`}>
          {live ? 'Published' : 'Draft'}
        </span>
        <ChevronDown size={16} className={`mt-0.5 shrink-0 text-ink-4 transition-transform ${editing ? 'rotate-180' : ''}`} />
      </div>

      {(entry.cluster_topic || weak) && !editing && (
        <p className="mt-2 ml-5 text-[11px] text-ink-4">
          {entry.cluster_topic && <>From {entry.cluster_size} questions on {entry.cluster_topic}</>}
          {weak && <span style={{ color: CLAY.ink }}>{entry.cluster_topic ? ' · ' : ''}Thin support in notes</span>}
        </p>
      )}

      {editing && (
        <div className="mt-3 ml-5 space-y-2.5">
          <input value={question} onChange={e => setQuestion(e.target.value)} aria-label="Question"
            className="w-full bg-white border border-[#dbe7ec] rounded-xl px-3 py-2 text-sm text-accent-strong focus:outline-none focus:border-accent-200" />
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={4} aria-label="Answer" placeholder="Answer"
            className="w-full bg-white border border-[#dbe7ec] rounded-xl px-3 py-2 text-sm text-ink-2 leading-relaxed focus:outline-none focus:border-accent-200" />
          {entry.citations.length > 0 && <CitationList courseId={courseId} citations={entry.citations} />}
        </div>
      )}

      <div className="mt-3 ml-5 flex flex-wrap items-center gap-1.5">
        {live ? (
          <button type="button" onClick={() => save('draft')} disabled={busy} className={`${smallBtn} bg-white text-ink-2 hover:text-accent-strong`}>Unpublish</button>
        ) : (
          <button type="button" onClick={() => save('published')} disabled={busy || !answer.trim()} className={`${smallBtn} bg-accent-strong text-white hover:bg-accent-400`}>Publish</button>
        )}
        {editing && (
          <button type="button" onClick={() => save()} disabled={busy || (question === entry.question && answer === entry.answer)}
            className={`${smallBtn} bg-white text-ink-2 hover:text-accent-strong`}>Save</button>
        )}
        {!editing && <button type="button" onClick={() => setEditing(true)} className={`${smallBtn} text-ink-3 hover:text-accent-strong`}>Edit</button>}
        <button type="button" onClick={remove} className={`${smallBtn} ml-auto`} style={{ color: confirmDelete ? CLAY.ink : '#8a989c' }}>
          {confirmDelete ? 'Click again to delete' : 'Delete'}
        </button>
      </div>
    </li>
  );
}

/** Course FAQ: draft answers from the most-asked questions, edit, publish to students. */
export default function FAQEditor({ courseId }: { courseId: string }) {
  const [entries, setEntries] = useState<FAQEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    let cancelled = false;
    faqApi.list(courseId)
      .then(res => { if (!cancelled) setEntries(res.data.entries); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [courseId, reloadKey]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const draft = async () => {
    setDrafting(true);
    try {
      const { created, skipped } = (await faqApi.draft(courseId)).data;
      const note = skipped.length ? ` ${skipped.length} skipped (not in the notes).` : '';
      addToast(created.length ? `Drafted ${created.length}.${note}` : `Nothing new to draft.${note}`, created.length ? 'success' : 'info');
      reload();
    } catch (err) {
      addToast(apiErrorDetail(err, 'Could not draft the FAQ'), 'error');
    } finally {
      setDrafting(false);
    }
  };

  const add = async () => {
    try {
      const res = await faqApi.create(courseId, 'New question');
      setNewId(res.data?.id ?? null);
      reload();
    } catch {
      addToast('Could not add an entry', 'error');
    }
  };

  const live = entries.filter(e => e.status === 'published');
  const drafts = entries.filter(e => e.status !== 'published');
  const ordered = [...drafts, ...live];

  return (
    <div className="grid gap-4 xl:grid-cols-3 items-start [&>*]:min-w-0">
      <section className={`${panel} p-5 xl:col-span-2`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15px] text-accent-strong">Course FAQ</h2>
            {entries.length > 0 && <span className="text-xs text-ink-3">{live.length} of {entries.length} published</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={draft} disabled={drafting} className={pillDark}>
              {drafting && <Loader2 size={14} className="animate-spin" />} Draft from questions
            </button>
            <button type="button" onClick={add} className={pillLine}><Plus size={14} /> Add</button>
          </div>
        </div>

        {!loaded ? null : entries.length === 0 ? (
          <p className="mt-4 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">No entries yet. Draft them from what students asked this week.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {ordered.map(e => <Entry key={`${e.id}-${reloadKey}`} entry={e} courseId={courseId} onChange={reload} startOpen={e.id === newId} />)}
          </ul>
        )}
      </section>

      {/* What students see */}
      <section className={`${panel} p-5 xl:sticky xl:top-4`}>
        <h2 className="text-[15px] text-accent-strong">What students see</h2>
        {live.length === 0 ? (
          <p className="mt-3 p-4 rounded-2xl bg-[#f1f5f7] text-sm text-ink-3">Nothing published yet.</p>
        ) : (
          <ol className="mt-3 divide-y divide-[#e2eaeb]">
            {live.map((e, i) => (
              <li key={e.id} className="py-3 flex gap-3">
                <span className="text-[11px] text-ink-4 tabular pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-accent-strong">{e.question}</span>
                  <span className="mt-1 block text-xs text-ink-3 line-clamp-3">{e.answer}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
