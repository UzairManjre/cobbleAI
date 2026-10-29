import api from './client';

export interface ConceptSignal {
  signal: string;
  label: string;
  value: number;
  contribution: number;
}

export interface ConceptFlag {
  node_id: string;
  label: string;
  features: Record<string, number>;
  counts: Record<string, number>;
  mean_mastery: number | null;
  heuristic_v1: number;
  instructor_label: boolean | null;
  second_rater_label?: boolean | null;
  probability: number | null;
  flagged: boolean;
  signals: ConceptSignal[];
}

export interface PRF { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }

export interface ConceptFlags {
  method: 'calibrated' | 'heuristic_v1';
  model_id: string | null;
  model_metrics: {
    n_labelled?: number;
    calibrated_cv?: PRF;
    calibrated_cv_without_video?: PRF;
    heuristic_v1?: PRF;
    inter_rater?: { n: number; cohen_kappa: number | null; exact_agreement?: number };
  } | null;
  threshold: number;
  labelled: number;
  concepts: ConceptFlag[];
}

export interface HeatBin {
  start: number;
  end: number;
  replays: number;
  rewinds: number;
  pauses: number;
  questions: number;
  students: number;
  intensity: number;
  transcript?: string;
  frame_t?: number;
  frame_text?: string;
  frame_url?: string;
  chapter_title?: string;
}

export interface LectureHeatmap {
  lecture_id: string;
  bin_seconds: number;
  duration_sec: number;
  peak: number;
  bins: HeatBin[];
  hotspots: HeatBin[];
  n_events: number;
}

export interface Calibration {
  n: number;
  levels: { confidence: number; expected: number; n: number; accuracy: number | null }[];
  overconfidence: number | null;
  brier: number | null;
  points: { at: string; test: string; confidence: number; correct: boolean }[];
}

// Paths under /api/learner are role-agnostic
export const learnerApi = {
  conceptFlags: (courseId: string) => api.get<ConceptFlags>(`/api/learner/courses/${courseId}/concepts`),
  setLabel: (courseId: string, nodeId: string, body: { struggling: boolean; difficulty?: string; rater_slot?: 'primary' | 'secondary' }) =>
    api.put(`/api/learner/courses/${courseId}/labels/${encodeURIComponent(nodeId)}`, body),
  clearLabel: (courseId: string, nodeId: string, raterSlot: 'primary' | 'secondary' = 'primary') =>
    api.delete(`/api/learner/courses/${courseId}/labels/${encodeURIComponent(nodeId)}`, { params: { rater_slot: raterSlot } }),
  fit: (courseId: string) => api.post<{ model_id: string; metrics: ConceptFlags['model_metrics'] }>(`/api/learner/courses/${courseId}/fit`),
  mastery: (courseId: string) =>
    api.get<{ scope: 'student' | 'class'; concepts: Record<string, { p_mastery?: number; mean_mastery?: number; n_obs?: number }> }>(`/api/learner/courses/${courseId}/mastery`),
  calibration: (courseId: string) => api.get<Calibration>(`/api/learner/courses/${courseId}/calibration`),
  lectureHeatmap: (lectureId: string, binSeconds = 10) =>
    api.get<LectureHeatmap>(`/api/learner/lectures/${lectureId}/heatmap`, { params: { bin_seconds: binSeconds } }),
};

export default learnerApi;
