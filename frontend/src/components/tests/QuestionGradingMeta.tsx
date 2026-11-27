import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { testsApi } from "../../api/tests";
import { useToastStore } from "../../store/toastStore";
import { pillDark } from "../ui/glass";

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
    <div className="mt-4 rounded-xl bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-ink-3 mr-1">Bloom level</span>
        <div className="inline-flex flex-wrap p-0.5 rounded-full bg-[#f1f5f7]" role="radiogroup" aria-label="Bloom level">
          {COGNITIVE_LEVELS.map(l => (
            <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(level === l ? "" : l)}
              className={`h-7 px-2.5 rounded-full text-[11px] capitalize transition-colors cursor-pointer ${level === l ? "bg-accent-strong text-white" : "text-ink-3 hover:text-accent-strong"}`}>
              {l}
            </button>
          ))}
        </div>
        {dirty && (
          <button type="button" onClick={save} disabled={saving} className={`${pillDark} ml-auto !h-8 !px-3.5 !text-xs`}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {saving ? "Saving" : "Save"}
          </button>
        )}
      </div>
      {freeText && (
        <label className="block text-[11px] text-ink-3">
          Rubric points, one per line <span className="text-ink-4">(leave empty to take them from the explanation)</span>
          <textarea value={rubric} onChange={e => setRubric(e.target.value)} rows={3}
            className="mt-1.5 w-full rounded-xl bg-[#f1f5f7] border border-transparent px-3 py-2 text-sm text-ink focus:outline-none focus:border-[#2a6f87] transition-colors" />
        </label>
      )}
    </div>
  );
}
