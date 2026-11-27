import { useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FAQEntry } from '../../api/insights';
import MessageContent from '../tutor/MessageContent';
import CitationList from '../tutor/CitationList';
import { panel } from '../ui/glass';

/** The class FAQ the professor published, as expandable rows. */
export default function FaqCard({ style, className = '', courseId, entries, title = 'Asked often' }: { style?: CSSProperties; className?: string; courseId: string; entries: FAQEntry[]; title?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label={title} style={style} className={`${panel} p-5 ${className}`}>
      <h2 className="text-[15px] text-[#0e3445]">{title}</h2>
      <ul className="mt-3 space-y-2">
        {entries.map(e => {
          const expanded = open === e.id;
          return (
            <li key={e.id} className="rounded-2xl bg-[#f1f5f7]">
              <button type="button" onClick={() => setOpen(expanded ? null : e.id)} aria-expanded={expanded}
                className="w-full flex items-center justify-between gap-3 p-3 text-left text-sm text-[#0e3445] cursor-pointer">
                {e.question}
                <ChevronDown size={15} className={`shrink-0 text-ink-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <div className="px-3 pb-3 space-y-2 text-[13px] text-ink-2">
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
