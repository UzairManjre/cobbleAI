import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';

export interface ConfusionFlag {
  course_id: string;
  course: string;
  node_id: string;
  label: string;
  probability: number | null;
  method: 'calibrated' | 'heuristic_v1';
  reasons: string[];
}

/** Flagged concepts across the professor's courses, each with the signals that drove the flag. */
export default function ConfusionFlagsList({ flags }: { flags?: ConfusionFlag[] }) {
  const navigate = useNavigate();
  if (!flags || flags.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-[#64748b] text-center px-6">
        No concepts flagged. Flags appear once students study, ask questions and take quizzes.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-[#1A1A1A]">
      {flags.map(f => (
        <li key={`${f.course_id}-${f.node_id}`} className="py-3 px-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white">
              {f.label} <span className="text-[11px] text-[#888888]">· {f.course}</span>
            </p>
            <p className="text-[11px] text-[#888888] mt-0.5">
              {f.method === 'calibrated' && f.probability !== null
                ? `${Math.round(f.probability * 100)}% likely struggling (calibrated model)`
                : 'Flagged by the uncalibrated v1 heuristic'}
              {f.reasons.length > 0 && ` · driven by ${f.reasons.join(', ').toLowerCase()}`}
            </p>
          </div>
          <button onClick={() => navigate(`/professor/courses/${f.course_id}/insights`)}
            className="text-[#888888] hover:text-white shrink-0" aria-label={`Open insights for ${f.course}`}>
            <ArrowRight className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
