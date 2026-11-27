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
      <SearchX className="w-4 h-4 text-clay shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-medium text-clay mb-1">Not in your course materials</p>
        <p className="text-sm text-ink-2 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

/** One chat message: answer (or decline), what it cited, and rating / read-aloud actions. */
export default function TutorMessageView({ message, courseId, streaming, onSeekLecture }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[18px] rounded-br-md px-4 py-3 text-[15px] bg-[#0e3445] text-white">
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
        <div className={`max-w-[85%] rounded-[18px] rounded-bl-md px-4 py-3 text-[15px] border ${
          declined ? 'bg-clay-wash border-[#ead9d1]' : 'bg-white text-ink border-[#e2eaeb] shadow-[0_8px_24px_-18px_rgba(14,52,69,0.3)]'
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
