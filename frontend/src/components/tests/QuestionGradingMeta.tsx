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
    <div className="mt-4 p-3 rounded-lg border border-[#1A1A1A] bg-[#080808] space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] text-[#AAAAAA] flex items-center gap-2">
          Bloom level
          <select value={level} onChange={e => setLevel(e.target.value)}
            className="text-xs bg-[#111111] border border-[#262626] rounded-lg px-2 py-1 text-white focus:outline-none focus:border-[#444444]">
            <option value="">Not set</option>
            {COGNITIVE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        {dirty && (
          <button onClick={save} disabled={saving}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 disabled:opacity-40">
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
      {freeText && (
        <label className="block text-[11px] text-[#AAAAAA]">
          Rubric points, one per line <span className="text-[#666666]">(leave empty to derive them from the explanation)</span>
          <textarea value={rubric} onChange={e => setRubric(e.target.value)} rows={3}
            className="mt-1.5 w-full text-sm bg-[#111111] border border-[#262626] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#444444]" />
        </label>
      )}
    </div>
  );
}
