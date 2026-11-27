import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Play, Presentation } from 'lucide-react';
import { lecturesApi } from '../../api/lectures';
import { openInNewTab } from '../../utils/download';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import type { TutorSource } from '../../types/tutor';
import { analytics } from '../../utils/analytics';
import { sourceLocation } from '../../utils/format';

interface Props {
  courseId?: string;
  citations?: TutorSource[] | null;
  sources?: TutorSource[];
  /** In the lecture view, a citation of the open lecture seeks the player instead of navigating */
  onSeekLecture?: (docId: string, seconds: number) => boolean;
  title?: string;
}

function isLecture(s: TutorSource) {
  return s.media_type === 'lecture' || (s.t_start !== undefined && s.t_start !== null);
}

function SourceIcon({ source }: { source: TutorSource }) {
  if (isLecture(source)) return <Play className="w-3 h-3 text-accent shrink-0" />;
  if (source.slide_start !== undefined && source.slide_start !== null) return <Presentation className="w-3 h-3 text-accent shrink-0" />;
  return <FileText className="w-3 h-3 text-accent shrink-0" />;
}

export default function CitationList({ courseId, citations, sources, onSeekLecture, title }: Props) {
  const navigate = useNavigate();
  const role = useAuthStore(s => s.role);
  const addToast = useToastStore(s => s.addToast);
  const [expanded, setExpanded] = useState<string | null>(null);

  // v2 answers list what they actually cited; v1 messages only have the retrieved sources
  const cited = citations && citations.length > 0;
  const items = (cited ? citations : sources) || [];
  if (items.length === 0) return null;

  const open = async (source: TutorSource) => {
    analytics.track('source_viewed', {
      docId: source.doc_id, chunkId: source.chunk_id, location: sourceLocation(source), courseId,
    });
    if (isLecture(source)) {
      const t = Math.max(0, Math.floor(source.t_start || 0));
      if (onSeekLecture?.(source.doc_id, t)) return;
      navigate(`/courses/${courseId}/lectures/${source.doc_id}?t=${t}`);
      return;
    }
    if ((source.page_start !== undefined && source.page_start !== null) || /\.pdf$/i.test(source.filename)) {
      const opened = await openInNewTab(async () => {
        const res = await lecturesApi.fileUrl(source.doc_id);
        return source.page_start ? `${res.data.url}#page=${source.page_start}` : res.data.url;
      });
      if (!opened) addToast('Could not open this file', 'error');
      return;
    }
    // Slides and Word files can't be shown at a location in the browser: show the cited text
    const key = source.chunk_id || source.sid || source.doc_id;
    setExpanded(expanded === key ? null : key);
  };

  const open_ = items.find((s, idx) => (s.chunk_id || s.sid || `${s.doc_id}-${idx}`) === expanded);

  // A row of quiet source chips: file name and where in it. Click opens the page or lecture moment.
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-ink-4 mr-0.5">{title ?? (cited ? 'Cited' : 'Sources')}</span>
        {items.map((source, idx) => {
          const key = source.chunk_id || source.sid || `${source.doc_id}-${idx}`;
          const where = sourceLocation(source);
          return (
            <button key={key} type="button" onClick={() => open(source)} title={source.snippet || source.filename}
              className={`max-w-full inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs transition-colors cursor-pointer ${
                expanded === key ? 'bg-accent-wash border-accent-100 text-accent-strong' : 'bg-white border-[#dbe7ec] text-ink-2 hover:border-accent-200 hover:text-accent-strong'}`}>
              {source.sid && <span className="text-[10px] text-ink-4 tabular">{source.sid}</span>}
              <SourceIcon source={source} />
              <span className="truncate max-w-[14rem]">{(source.filename || 'Unknown document').replace(/\.[^.]+$/, '')}</span>
              {where && <span className="text-ink-4 shrink-0">· {where}</span>}
            </button>
          );
        })}
      </div>
      {open_?.snippet && (
        <p className="mt-2 text-[11px] text-ink-3 leading-relaxed border-l-2 border-accent-100 pl-2.5">{open_.snippet}</p>
      )}
    </div>
  );
}
