import { SearchX } from 'lucide-react';
import type { TutorMessage } from '../../types/tutor';
import CitationList from './CitationList';
import FeedbackButtons from './FeedbackButtons';
import MessageContent from './MessageContent';
import { splitThinking } from '../../utils/thinking';
import ReadAloud from './ReadAloud';

interface Props {
  message: TutorMessage;
  courseId?: string;
  streaming?: boolean;
  onSeekLecture?: (docId: string, seconds: number) => boolean;
}

function DeclineNotice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3" role="status">
      <SearchX className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-amber-300 uppercase tracking-widest mb-1">Not in your course materials</p>
        <p className="text-sm text-[#CCCCCC] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

/** One chat message: answer (or decline), what it cited, and rating / read-aloud actions. */
export default function TutorMessageView({ message, courseId, streaming, onSeekLecture }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-none px-4 py-3 text-sm bg-white text-black font-medium">
          <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  const declined = message.decision === 'declined';
  const finished = !streaming && message.decision !== 'pending';
  const { text } = splitThinking(message.content, message.thinking);

  return (
    <div className="space-y-2">
      <div className="flex justify-start">
        <div className={`max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 text-sm border ${
          declined ? 'bg-amber-500/5 border-amber-500/20' : 'bg-[#0A0A0A] text-white border-[#1A1A1A]'
        }`}>
          {declined ? <DeclineNotice text={text} /> : <MessageContent content={message.content} thinking={message.thinking} />}
        </div>
      </div>
      {!declined && (
        <div className="flex justify-start ml-2">
          <CitationList courseId={courseId} citations={message.citations} sources={message.sources} onSeekLecture={onSeekLecture} />
        </div>
      )}
      {finished && message.id && (
        <div className="flex items-center gap-2 ml-2">
          <FeedbackButtons messageId={message.id} />
          {!declined && <ReadAloud text={text} />}
        </div>
      )}
    </div>
  );
}
