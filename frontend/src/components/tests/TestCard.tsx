import { Clock, FileText, BarChart3, Play, Eye, Sparkles, ClipboardCheck, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

interface TestCardProps {
  test: any;
  role: string | null;
  isGenerating: boolean;
  onPreview: (testId: string) => void;
  onGenerate: (testId: string) => void;
  onPublish: (testId: string) => void;
  onReleaseResults?: (testId: string) => void;
}

export function TestCard({ test, role, isGenerating, onPreview, onGenerate, onPublish, onReleaseResults }: TestCardProps) {
  const navigate = useNavigate();
  const { courseId } = useParams();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return "bg-amber-100 text-amber-800 border-2 border-amber-500";
      case "published":
        return "bg-emerald-100 text-emerald-800 border-2 border-emerald-500";
      case "completed":
        return "bg-blue-100 text-blue-800 border-2 border-blue-500";
      default:
        return "bg-gray-100 text-gray-800 border-2 border-gray-400";
    }
  };

  const getStatusBorder = (status: string) => {
    switch (status) {
      case "draft":
        return "border-l-[8px] border-l-amber-500";
      case "published":
        return "border-l-[8px] border-l-emerald-500";
      case "completed":
        return "border-l-[8px] border-l-blue-500";
      default:
        return "border-l-[8px] border-l-gray-400";
    }
  };

  return (
    <div
      className={`rounded-2xl p-6 transition-all border-4 border-[#0A0A0A] shadow-[6px_6px_0_rgba(0,0,0,1)] bg-white hover:-translate-y-1 hover:shadow-[10px_10px_0_rgba(0,0,0,1)] ${getStatusBorder(test.status)}`}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h3 className="text-xl font-extrabold text-[#0A0A0A] tracking-tight truncate font-['Outfit']">
              {test.title}
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${getStatusBadge(test.status)}`}
            >
              {test.status}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-gray-100 text-gray-800 border-2 border-[#0A0A0A]/60 uppercase">
              {test.test_type}
            </span>
          </div>
          <p className="text-[14px] text-[#0A0A0A]/60 leading-relaxed font-medium font-['Inter']">
            {test.description || "No description provided."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#0A0A0A]/70 mb-6 font-bold font-['Inter']">
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-[#FF4D5B] stroke-[2.5]" />
          {test.duration_minutes} min
        </span>
        <span className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-[#FF4D5B] stroke-[2.5]" />
          {test.question_count || test.questions?.length || 0} questions
        </span>
        <span className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-[#FF4D5B] stroke-[2.5]" />
          {test.total_marks || 0} marks
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t-2 border-[#0A0A0A]">
        {role === "student" ? (
          <button
            onClick={() => navigate(`/tests/${test.id}`)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-white rounded-xl text-[15px] font-extrabold border-2 border-[#0A0A0A] shadow-[4px_4px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
            style={{
              background: "#FF4D5B",
              fontFamily: "'Outfit', sans-serif",
            }}
          >
            <Play className="w-4 h-4 fill-white" />
            Start Test
          </button>
        ) : (
          <>
            <button
              onClick={() => onPreview(test.id)}
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-black border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all font-['Outfit']"
            >
              <Eye className="w-4 h-4 stroke-[2.5]" />
              Preview
            </button>

            {test.status === "draft" && (test.question_count || test.questions?.length || 0) === 0 && (
              <button
                onClick={() => onGenerate(test.id)}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-[#a855f7] hover:bg-[#9333ea] text-white border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all disabled:opacity-50 font-['Outfit']"
              >
                <Sparkles className="w-4 h-4 fill-white" />
                AI Generate Questions
              </button>
            )}

            {test.status === "published" && test.test_type === "assignment" && courseId && (
              <button
                onClick={() => navigate(`/professor/courses/${courseId}/tests/${test.id}/grading`)}
                className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-black border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all font-['Outfit']"
              >
                <ClipboardCheck className="w-4 h-4 stroke-[2.5]" />
                Grade Submissions
              </button>
            )}

            {test.status === "draft" && (test.question_count || test.questions?.length || 0) > 0 && (
              <button
                onClick={() => onPublish(test.id)}
                className="flex items-center gap-2 px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all font-['Outfit']"
              >
                <Play className="w-4 h-4 fill-white" />
                Publish Test
              </button>
            )}

            {test.status === "published" && onReleaseResults && (
              test.show_results_immediately || test.results_released ? (
                <span className="text-xs font-extrabold text-emerald-700 font-['Outfit']">Results visible to students</span>
              ) : (
                <button
                  onClick={() => onReleaseResults(test.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-black border-2 border-[#0A0A0A] rounded-xl text-sm font-extrabold shadow-[3px_3px_0_#000] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all font-['Outfit']"
                >
                  <Send className="w-4 h-4 stroke-[2.5]" />
                  Release Results
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
