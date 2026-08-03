import { useState } from "react";
import { X, FileText, Target, BookOpen, Brain, Sparkles, CheckCircle, ChevronRight, ChevronLeft } from "lucide-react";

interface CreateTestWizardProps {
  courseId: string;
  documents: any[];
  graphNodes: any[];
  onClose: () => void;
  onCreateTest: (testData: any) => Promise<string>; // returns the testId
  onGenerateQuestions: (testId: string, testData: any) => Promise<void>;
  onViewTest: (testId: string) => void;
}

export function CreateTestWizard({
  courseId,
  documents,
  graphNodes,
  onClose,
  onCreateTest,
  onGenerateQuestions,
  onViewTest,
}: CreateTestWizardProps) {
  const [createStep, setCreateStep] = useState(1); // 1: details, 2: select content, 3: generate
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestId, setGeneratedTestId] = useState<string | null>(null);

  const [newTest, setNewTest] = useState<any>({
    title: "",
    description: "",
    duration_minutes: 60,
    passing_percentage: 40,
    test_type: "assignment",
    question_count: 10,
    question_types: ["mcq", "true_false", "short_answer"],
    selected_documents: [] as string[],
    selected_topics: [] as string[],
  });

  const toggleDocument = (docId: string) => {
    setNewTest((prev: any) => ({
      ...prev,
      selected_documents: prev.selected_documents.includes(docId)
        ? prev.selected_documents.filter((id: string) => id !== docId)
        : [...prev.selected_documents, docId],
    }));
  };

  const toggleTopic = (topicId: string) => {
    setNewTest((prev: any) => ({
      ...prev,
      selected_topics: prev.selected_topics.includes(topicId)
        ? prev.selected_topics.filter((id: string) => id !== topicId)
        : [...prev.selected_topics, topicId],
    }));
  };

  const toggleQuestionType = (type: string) => {
    setNewTest((prev: any) => ({
      ...prev,
      question_types: prev.question_types.includes(type)
        ? prev.question_types.filter((t: string) => t !== type)
        : [...prev.question_types, type],
    }));
  };

  const handleNextToContent = async () => {
    try {
      const testId = await onCreateTest(newTest);
      if (testId) {
        setGeneratedTestId(testId);
        setCreateStep(2);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerate = async () => {
    if (!generatedTestId) return;
    try {
      setIsGenerating(true);
      await onGenerateQuestions(generatedTestId, newTest);
      setCreateStep(3);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#FCFCFC] border-4 border-[#0A0A0A] rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-[12px_12px_0_#000] animate-in zoom-in-95 duration-150">
        <div className="sticky top-0 bg-[#FFFFFF] border-b-4 border-[#0A0A0A] px-8 py-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-extrabold text-[#0A0A0A] font-['Outfit']">Create New Test</h2>
            <div className="flex items-center gap-2 mt-3 font-['Outfit']">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 border-black shadow-[1.5px_1.5px_0_#000] ${
                      step <= createStep ? "bg-[#FF4D5B] text-white" : "bg-gray-100 text-gray-400 border-gray-300 shadow-none"
                    }`}
                  >
                    {step}
                  </div>
                  {step < 3 && <div className={`w-8 h-0.5 ${step < createStep ? "bg-[#FF4D5B]" : "bg-gray-200"}`} />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full border-2 border-black/10 transition-colors">
            <X className="w-5 h-5 text-black stroke-[2.5]" />
          </button>
        </div>

        {createStep === 1 && (
          <div className="p-8 space-y-6">
            <h3 className="text-lg font-extrabold text-[#0A0A0A] flex items-center gap-2 font-['Outfit']">
              <FileText className="w-5 h-5 text-[#FF4D5B]" /> Test Details
            </h3>
            <div>
              <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">Test Title *</label>
              <input type="text" value={newTest.title} onChange={(e) => setNewTest({ ...newTest, title: e.target.value })} className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] placeholder:text-black/35 focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000]" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">Description</label>
              <textarea value={newTest.description} onChange={(e) => setNewTest({ ...newTest, description: e.target.value })} rows={3} className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] placeholder:text-black/35 focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">Duration (min)</label>
                <input type="number" value={newTest.duration_minutes} onChange={(e) => setNewTest({ ...newTest, duration_minutes: parseInt(e.target.value) || 0 })} className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000]" />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">Passing %</label>
                <input type="number" value={newTest.passing_percentage} onChange={(e) => setNewTest({ ...newTest, passing_percentage: parseInt(e.target.value) || 0 })} className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000]" />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-2 font-['Outfit']">Type</label>
                <div className="relative">
                  <select value={newTest.test_type} onChange={(e) => setNewTest({ ...newTest, test_type: e.target.value })} className="w-full appearance-none bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-3 pr-10 text-sm font-bold text-[#0A0A0A] focus:outline-none focus:border-[#FF4D5B] shadow-[2px_2px_0_#000] cursor-pointer">
                    <option value="assignment">Assignment</option>
                    <option value="quiz">Quiz</option>
                    <option value="exam">Exam</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-6 border-t-2 border-[#0A0A0A] font-['Outfit']">
              <button onClick={onClose} className="flex-1 py-3 bg-white hover:bg-gray-50 text-[#0A0A0A] border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000]">Cancel</button>
              <button onClick={handleNextToContent} disabled={!newTest.title} className="flex-1 py-3 disabled:opacity-50 text-white bg-[#FF4D5B] rounded-xl font-extrabold border-2 border-[#0A0A0A] shadow-[3px_3px_0_#000] flex items-center justify-center gap-2">
                Next: Select Content <ChevronRight className="w-4 h-4 stroke-[3px]" />
              </button>
            </div>
          </div>
        )}

        {createStep === 2 && (
          <div className="p-8 space-y-6">
            <h3 className="text-lg font-extrabold text-[#0A0A0A] flex items-center gap-2 font-['Outfit']">
              <Target className="w-5 h-5 text-[#FF4D5B]" /> Select Content for Questions
            </h3>
            
            <div>
              <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-3 flex items-center gap-2 font-['Outfit']">
                <BookOpen className="w-4 h-4" /> Documents ({documents.length})
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {documents.filter((d) => d.status === "ready").length === 0 ? (
                  <p className="text-sm font-bold text-[#0A0A0A]/30 py-4 text-center">No processed documents available.</p>
                ) : (
                  documents.filter((d) => d.status === "ready").map((doc) => (
                    <button key={doc.id} onClick={() => toggleDocument(doc.id)} className={`w-full p-3 rounded-xl border-2 text-left transition-all flex items-center gap-3 ${newTest.selected_documents.includes(doc.id) ? "bg-blue-50 border-blue-500" : "bg-white border-[#0A0A0A]"}`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${newTest.selected_documents.includes(doc.id) ? "border-blue-500 bg-blue-500" : "border-[#0A0A0A]"}`}>
                        {newTest.selected_documents.includes(doc.id) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-[#0A0A0A] truncate">{doc.filename}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#0A0A0A]/50 mb-3 flex items-center gap-2 font-['Outfit']">
                <Brain className="w-4 h-4" /> Topics ({graphNodes.length})
              </label>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-2">
                {graphNodes.map((node) => (
                  <button key={node.id} onClick={() => toggleTopic(node.id)} className={`px-4 py-2 rounded-full text-sm font-extrabold border-2 ${newTest.selected_topics.includes(node.id) ? "bg-purple-50 border-purple-500 text-purple-950" : "bg-white border-[#0A0A0A]"}`}>
                    {node.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit']">Question Count</label>
                <input type="number" value={newTest.question_count} onChange={(e) => setNewTest({ ...newTest, question_count: parseInt(e.target.value) || 0 })} className="w-full bg-white border-2 border-[#0A0A0A] rounded-xl px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0A0A0A]/40 mb-1 font-['Outfit']">Types</label>
                <div className="flex gap-2 mt-1">
                  ={[{ id: "mcq", label: "MCQ" }, { id: "true_false", label: "T/F" }, { id: "short_answer", label: "Short" }].map((type) => (
                    <button key={type.id} onClick={() => toggleQuestionType(type.id)} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border-2 ${newTest.question_types.includes(type.id) ? "bg-emerald-50 border-emerald-500 text-emerald-950" : "bg-white border-[#0A0A0A]"}`}>{type.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-6 border-t-2 border-[#0A0A0A] font-['Outfit']">
              <button onClick={() => setCreateStep(1)} className="flex-1 py-3 bg-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000] flex items-center justify-center gap-2"><ChevronLeft className="w-4 h-4 stroke-[3px]" /> Back</button>
              <button onClick={handleGenerate} disabled={isGenerating} className="flex-1 py-3 bg-[#a855f7] text-white rounded-xl font-extrabold border-2 border-[#0A0A0A] shadow-[3px_3px_0_#000] flex items-center justify-center gap-2">
                {isGenerating ? "Generating..." : "Generate with AI"}
              </button>
            </div>
          </div>
        )}

        {createStep === 3 && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 border-3 border-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-8 h-8 text-emerald-600 stroke-[3px]" /></div>
            <h3 className="text-2xl font-extrabold mb-2 font-['Outfit']">Questions Generated!</h3>
            <div className="flex gap-3 justify-center font-['Outfit'] mt-8">
              <button onClick={onClose} className="px-8 py-3 bg-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000]">Close</button>
              <button onClick={() => onViewTest(generatedTestId!)} className="px-8 py-3 bg-[#FF4D5B] text-white border-2 border-[#0A0A0A] rounded-xl font-extrabold shadow-[3px_3px_0_#000]">View Test</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
