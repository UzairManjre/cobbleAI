import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, Play, Presentation } from 'lucide-react';
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
  if (isLecture(source)) return <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (source.slide_start !== undefined && source.slide_start !== null) return <Presentation className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  return <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
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
      navigate(`/${role}/courses/${courseId}/lectures/${source.doc_id}?t=${t}`);
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

  return (
    <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl p-3 max-w-[85%]">
      <div className="flex items-center gap-1.5 mb-2 border-b border-[#1A1A1A] pb-1.5">
        <BookOpen className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-semibold text-[#888888] uppercase tracking-widest">
          {title ? `${title} (${items.length})` : cited ? `Cited (${items.length})` : `Sources (${items.length})`}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((source, idx) => {
          const key = source.chunk_id || source.sid || `${source.doc_id}-${idx}`;
          const where = sourceLocation(source);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => open(source)}
                title={source.snippet || source.filename}
                className="w-full text-left text-xs text-[#CCCCCC] hover:text-white flex items-center gap-2 group"
              >
                {source.sid && <span className="text-[10px] font-mono text-purple-300 shrink-0">[{source.sid}]</span>}
                <SourceIcon source={source} />
                <span className="truncate flex-1">{source.filename || 'Unknown Document'}</span>
                {where && <span className="text-[10px] text-[#888888] group-hover:text-[#CCCCCC] shrink-0">{where}</span>}
              </button>
              {expanded === key && source.snippet && (
                <p className="mt-1.5 ml-6 text-[11px] text-[#AAAAAA] leading-relaxed border-l border-[#333333] pl-2">{source.snippet}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
