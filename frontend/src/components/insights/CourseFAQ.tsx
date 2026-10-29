import { useEffect, useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { faqApi } from '../../api/insights';
import type { FAQEntry } from '../../api/insights';
import CitationList from '../tutor/CitationList';
import MessageContent from '../tutor/MessageContent';

/** The published course FAQ, as students see it. Renders nothing until something is published. */
export default function CourseFAQ({ courseId }: { courseId: string }) {
  const [entries, setEntries] = useState<FAQEntry[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    faqApi.list(courseId)
      .then(res => { if (!cancelled) setEntries(res.data.entries.filter(e => e.status === 'published')); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [courseId]);

  if (entries.length === 0) return null;

  return (
    <section className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-2xl p-5">
      <h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3"><HelpCircle className="w-4 h-4 text-sky-400" /> Frequently asked</h2>
      <ul className="divide-y divide-[#1A1A1A]">
        {entries.map(e => {
          const expanded = open === e.id;
          return (
            <li key={e.id} className="py-2">
              <button onClick={() => setOpen(expanded ? null : e.id)} aria-expanded={expanded}
                className="w-full flex items-center justify-between gap-3 text-left text-sm text-white">
                {e.question}
                <ChevronDown className={`w-4 h-4 text-[#888888] shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <div className="mt-2 space-y-2 text-xs text-[#CCCCCC]">
                  <MessageContent content={e.answer} />
                  {e.citations.length > 0 && <CitationList courseId={courseId} citations={e.citations} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
