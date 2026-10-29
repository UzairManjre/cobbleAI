# Gold question sets

One file per course, `eval/gold/<course>.jsonl`, one JSON object per line. Run
`python -m eval.cli validate-gold eval/gold/<course>.jsonl` after every edit.

```json
{"qid": "cs-017", "course_id": "<course uuid>", "question": "Why does merge sort need O(n) extra space?",
 "qtype": "conceptual", "answerable": true,
 "expected_answer": "Merging two sorted halves needs a temporary array as large as the input.",
 "gold_sources": [{"filename": "week3-sorting.pdf", "page": 12}],
 "split": "test", "reviewed_by_instructor": true}
```

| Field | Rules |
|---|---|
| `qid` | Unique across all files. |
| `course_id` | The course's UUID (retrieval searches that course's collection). |
| `qtype` | `factual`, `conceptual`, `procedural`, `figure` (needs a diagram or table) or `lecture` (the answer is spoken in a recording). Stratify the set across types. |
| `answerable` | `false` for questions the materials do not cover. They test cite-or-decline; give no `gold_sources`. Aim for roughly 20% of the S6 set. |
| `gold_sources` | Every place the answer is supported. `doc_id` or `filename`, plus `page` (PDF), `slide` (PPTX) or `t_start`/`t_end` in seconds (lecture). A retrieved lecture chunk counts as a timestamp hit within 30 s of the range. |
| `split` | `dev` for tuning thresholds and weights, `test` for reporting. Freeze `test` before running any tuned configuration, and never tune on it. |
| `reviewed_by_instructor` | Set to `true` only after the instructor has checked the question, the answer and the source. Report how many items were reviewed. |

## Authoring rules

1. Write questions the way students ask them, not by copying sentences from the slides.
2. Check that each gold source really contains the answer. Open the page or play the time range.
3. Have the instructor review a sample (at least 20%, all of the `test` split if possible).
4. `python -m eval.cli draft-gold` can draft candidate questions from indexed chunks. Drafts are marked
   `reviewed_by_instructor: false` and must be edited and checked by a person. Do not put drafts in `test`.
5. Keep splits by course or by question, never by random row of a shared pool, so that no tuned setting
   has seen a test item.

`example.jsonl` shows the format; its `course_id` is a placeholder.
