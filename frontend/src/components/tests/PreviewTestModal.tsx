import { X, CheckCircle } from "lucide-react";

interface PreviewTestModalProps {
  previewTest: any;
  onClose: () => void;
}

export function PreviewTestModal({ previewTest, onClose }: PreviewTestModalProps) {
  if (!previewTest) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#FCFCFC] border-4 border-[#0A0A0A] rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_#000] animate-in zoom-in-95 duration-150">
        <div className="sticky top-0 bg-[#FFFFFF] border-b-4 border-[#0A0A0A] px-8 py-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-extrabold text-[#0A0A0A] font-['Outfit']">Test Preview</h2>
            <p className="text-sm font-bold text-[#0A0A0A]/50 mt-1 font-['Inter']">{previewTest.title}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full border-2 border-black/10 transition-colors"
          >
            <X className="w-5 h-5 text-black stroke-[2.5]" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
              <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit'] uppercase">Duration</p>
              <p className="text-lg font-extrabold text-[#0A0A0A] font-['Outfit']">{previewTest.duration_minutes} min</p>
            </div>
            <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
              <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit'] uppercase">Questions</p>
              <p className="text-lg font-extrabold text-[#0A0A0A] font-['Outfit']">{previewTest.questions?.length || 0}</p>
            </div>
            <div className="bg-white border-2 border-[#0A0A0A] rounded-2xl p-4 shadow-[3px_3px_0_rgba(0,0,0,0.95)]">
              <p className="text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit'] uppercase">Total Marks</p>
              <p className="text-lg font-extrabold text-[#0A0A0A] font-['Outfit']">{previewTest.total_marks || 0}</p>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-extrabold text-[#0A0A0A] mb-6 font-['Outfit']">
              Questions ({previewTest.questions?.length || 0})
            </h3>
            {previewTest.questions?.length === 0 ? (
              <p className="text-[#0A0A0A]/40 text-center py-10 font-bold font-['Outfit']">No questions generated yet.</p>
            ) : (
              <div className="space-y-6">
                {previewTest.questions?.map((q: any, idx: number) => (
                  <div key={q.id} className="bg-white border-3 border-[#0A0A0A] rounded-2xl p-6 shadow-[5px_5px_0_rgba(0,0,0,0.95)]">
                    <div className="flex items-start gap-4 mb-4">
                      <span className="flex-shrink-0 w-8 h-8 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-lg flex items-center justify-center text-sm font-extrabold shadow-[2px_2px_0_rgba(0,0,0,1)]">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#0A0A0A] font-extrabold text-base mb-3 font-['Outfit'] leading-snug">{q.question_text}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold font-['Inter']">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 rounded">
                            {q.type.toUpperCase()}
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-300 rounded">
                            {q.difficulty}
                          </span>
                          <span className="text-[#0A0A0A]/50">{q.marks} marks</span>
                          {q.topic && <span className="text-[#0A0A0A]/40">• {q.topic}</span>}
                        </div>
                      </div>
                    </div>

                    {q.type === "mcq" && q.options && (
                      <div className="mt-4 space-y-2 ml-0 sm:ml-12">
                        {q.options.map((opt: any) => (
                          <div
                            key={opt.id}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all ${
                              opt.is_correct
                                ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-[2px_2px_0_#059669]"
                                : "bg-white border-gray-200 text-[#0A0A0A]"
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              opt.is_correct ? "border-emerald-500 bg-emerald-500" : "border-gray-300"
                            }`}>
                              {opt.is_correct && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <span className="text-sm font-['Inter']">{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.type === "true_false" && (
                      <div className="mt-4 ml-0 sm:ml-12 flex gap-3">
                        <span className={`px-4 py-2 rounded-xl border-2 text-sm font-extrabold transition-all ${
                          q.correct_answer === true
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[2px_2px_0_#059669]"
                            : "bg-white border-gray-200 text-[#0A0A0A]/40"
                        }`}>True</span>
                        <span className={`px-4 py-2 rounded-xl border-2 text-sm font-extrabold transition-all ${
                          q.correct_answer === false
                            ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[2px_2px_0_#059669]"
                            : "bg-white border-gray-200 text-[#0A0A0A]/40"
                        }`}>False</span>
                      </div>
                    )}

                    {q.explanation && (
                      <div className="mt-4 ml-0 sm:ml-12 p-3 bg-blue-50 border-2 border-blue-500/30 rounded-xl">
                        <p className="text-[11px] font-extrabold text-blue-900/60 uppercase mb-0.5 font-['Outfit']">Explanation</p>
                        <p className="text-sm font-medium text-blue-950 font-['Inter']">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
