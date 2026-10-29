import { useState } from 'react';
import { FileQuestion, ThumbsUp, TriangleAlert } from 'lucide-react';
import { tutorApi } from '../../api/tutor';
import { useToastStore } from '../../store/toastStore';
import type { FeedbackRating } from '../../types/tutor';

const OPTIONS: { rating: FeedbackRating; label: string; icon: typeof ThumbsUp }[] = [
  { rating: 'helpful', label: 'Helpful', icon: ThumbsUp },
  { rating: 'wrong', label: 'Wrong', icon: TriangleAlert },
  { rating: 'not_in_notes', label: 'Not in my notes', icon: FileQuestion },
];

/** One-click rating; "wrong" and "not in my notes" go to the instructor's review list. */
export default function FeedbackButtons({ messageId }: { messageId?: string }) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [busy, setBusy] = useState(false);
  const addToast = useToastStore(s => s.addToast);
  if (!messageId) return null;

  const rate = async (value: FeedbackRating) => {
    if (busy) return;
    setBusy(true);
    try {
      await tutorApi.submitFeedback(messageId, value);
      setRating(value);
      if (value !== 'helpful') addToast('Thanks — your instructor will review this answer.', 'info');
    } catch {
      addToast('Could not save your rating', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1" aria-label="Rate this answer">
      {OPTIONS.map(({ rating: value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => rate(value)}
          disabled={busy}
          aria-pressed={rating === value}
          title={label}
          className={`px-2 py-1 rounded-lg text-[10px] flex items-center gap-1 border transition-colors ${
            rating === value
              ? value === 'helpful' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
              : 'border-transparent text-[#666666] hover:text-[#CCCCCC] hover:border-[#1A1A1A]'
          }`}
        >
          <Icon className="w-3 h-3" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
