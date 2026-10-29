# Data cards

Public datasets are **not** committed. Download each one yourself, check the licence, and place it
at the path below. The loaders in `eval/datasets/` read these paths. Our own course data
(gold sets, lecture recordings, pilot logs) stays on institutional storage and is never copied here.

| Dataset | Path | Used for | Licence / access | Known biases and catches |
|---|---|---|---|---|
| ASSISTments 2009–2010 skill builder | `assistments/skill_builder_data.csv` | S3 knowledge tracing (BKT fit, AUC) | Free for research; check the ASSISTments terms | Maths only, US middle school; duplicate rows in the original release are dropped by the loader |
| Mohler et al. 2011 short answers | `mohler/mohler_dataset.csv` (columns `id, question, desired_answer, student_answer, score_avg`) | S5 grading agreement | Research use; cite the paper | Computer science data structures; scores 0–5 averaged over two raters |
| ASAP-SAS (Kaggle) | `asap_sas/train.tsv` plus `asap_sas/prompts.json` (each set's question and rubric, copied from the set descriptions; the study refuses to run without it) | S5 grading agreement per item | Kaggle competition terms | Ten science/English items, 0–2 or 0–3 scales, US high school |
| EduVidQA | `eduvidqa/eduvidqa.jsonl` (converted: `qid, video_id, question, answer, t_start, t_end`) | S6 external lecture-video check | **Not yet opened**: confirm access, format and licence before committing to it | Video IDs refer to public lectures; do not download videos from platforms whose terms forbid it |
| OULAD | `oulad/` | Early-warning comparison (later) | CC-BY 4.0 | Clickstream only, no tutoring chat |

For every dataset record: source URL, version or date downloaded, size, licence, and any filtering
applied. Keep that note next to the file (`<name>/DATA_CARD.md`).

**Splits.** Split by student (ASSISTments) or by question (Mohler, ASAP-SAS), never by random row,
and use fixed seeds. Never train or calibrate on data that is later used to evaluate the same component.
