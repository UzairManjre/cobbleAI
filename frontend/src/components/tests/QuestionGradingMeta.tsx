import { useState } from "react";
import { Save } from "lucide-react";
import { testsApi } from "../../api/tests";
import { useToastStore } from "../../store/toastStore";

const COGNITIVE_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
const FREE_TEXT = new Set(["short_answer", "essay", "code"]);

interface Props {
  testId: string;
  question: { id: string; type: string; cognitive_level?: string | null; rubric?: string[] | null };
}

/** Professor-editable grading metadata: Bloom level (agreement is reported per level) and rubric points for grader v2. */
export function QuestionGradingMeta({ testId, question }: Props) {
  const [level, setLevel] = useState(question.cognitive_level || "");
  const [rubric, setRubric] = useState((question.rubric || []).join("\n"));
  const [saved, setSaved] = useState({ level, rubric });
  const [saving, setSaving] = useState(false);
  const addToast = useToastStore(s => s.addToast);
  const freeText = FREE_TEXT.has(question.type);
  const dirty = level !== saved.level || rubric !== saved.rubric;

  const save = async () => {
    setSaving(true);
    try {
      await testsApi.updateQuestion(testId, question.id, {
        cognitive_level: level,
        ...(freeText ? { rubric: rubric.split("\n").map(p => p.trim()).filter(Boolean) } : {}),
      });
      setSaved({ level, rubric });
      addToast("Question updated", "success");
    } catch {
      addToast("Could not update the question", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 ml-0 sm:ml-12 p-3 bg-gray-50 border-2 border-gray-200 rounded-xl space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] font-extrabold text-[#0A0A0A]/60 uppercase font-['Outfit']">
          Bloom level
          <select value={level} onChange={e => setLevel(e.target.value)}
            className="ml-2 normal-case font-['Inter'] font-medium text-sm border-2 border-gray-300 rounded-lg px-2 py-1 bg-white text-[#0A0A0A]">
            <option value="">Not set</option>
            {COGNITIVE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        {dirty && (
          <button onClick={save} disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg border-2 border-[#0A0A0A] bg-white text-xs font-extrabold disabled:opacity-40">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
        )}
      </div>
      {freeText && (
        <label className="block text-[11px] font-extrabold text-[#0A0A0A]/60 uppercase font-['Outfit']">
          Rubric points (one per line; empty = derived from the explanation)
          <textarea value={rubric} onChange={e => setRubric(e.target.value)} rows={3}
            className="mt-1 w-full normal-case font-['Inter'] font-medium text-sm border-2 border-gray-300 rounded-lg px-2 py-1 bg-white text-[#0A0A0A]" />
        </label>
      )}
    </div>
  );
}
