// Knowledge-graph types, including CobbleAI 2.0 provenance (absent on graphs made before it)

export interface Evidence {
  doc_id?: string;
  filename?: string;
  chunk_id?: string;
  page?: number;
  slide?: number;
  t_start?: number;
  t_end?: number;
  quote: string;
  support_score: number;
  method: 'quote' | 'mention' | 'co_mention' | 'lecture_moment';
}

export interface GraphNode {
  id: string;
  label: string;
  description: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  position?: { x: number; y: number; z: number };
  source_docs?: string[];
  provenance?: Evidence[];
  supported?: boolean | null;
}

export interface EdgeAudit {
  status: 'unreviewed' | 'correct' | 'incorrect';
  note?: string | null;
  reviewed_at?: string | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: string;
  strength?: number;
  provenance?: Evidence[];
  supported?: boolean | null;
  audit?: EdgeAudit | null;
}

export interface AuditItem extends GraphEdge {
  from_label: string;
  to_label: string;
}

export interface Proportion {
  value: number;
  ci_low: number;
  ci_high: number;
  n: number;
}

export interface AuditReport {
  graph_id: string;
  edges_total: number;
  edges_unsupported: number;
  sampled: number;
  judged: number;
  precision: Proportion;
  precision_supported: Proportion;
  /** Whole-graph estimate: sampled strata weighted by their share of edges */
  precision_estimate?: Proportion & { coverage?: number };
  precision_unsupported: Proportion;
  by_relation: Record<string, Proportion>;
}

/** Evidence in the shape CitationList renders. */
export function evidenceToSource(e: Evidence) {
  return {
    doc_id: e.doc_id || '',
    filename: e.filename || 'Course material',
    relevance_score: e.support_score,
    chunk_id: e.chunk_id,
    media_type: (e.t_start !== undefined && e.t_start !== null ? 'lecture' : 'document') as 'lecture' | 'document',
    page_start: e.page,
    page_end: e.page,
    slide_start: e.slide,
    slide_end: e.slide,
    t_start: e.t_start,
    t_end: e.t_end,
    snippet: e.quote,
  };
}

// Course setup and concept-map builds (background jobs with saved progress)

export type BuildStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';

export interface GraphBuild {
  id: string;
  course_id: string;
  status: BuildStatus;
  trigger: 'manual' | 'auto';
  step: number;
  total_steps: number;
  message: string;
  detail: string;
  percent: number;
  sources: number;
  passages: number;
  chunks_total: number;
  chunks_done: number;
  concepts_found: number;
  relations_found: number;
  events: { at: string; message: string }[];
  cancel_requested: boolean;
  graph_id: string | null;
  nodes_count: number | null;
  edges_count: number | null;
  unsupported_edges: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_s: number | null;
  eta_s: number | null;
  waiting_for_worker: boolean;
}

/** What students and the map page get while a map is being built. */
export type BuildSummary = Pick<GraphBuild, 'id' | 'status' | 'step' | 'total_steps' | 'message' | 'detail'
  | 'percent' | 'eta_s' | 'elapsed_s' | 'waiting_for_worker'>;

export interface CourseGraphStatus {
  status: 'ready' | 'building' | 'processing' | 'no_documents';
  build?: BuildSummary;
  graph_id?: string;
  nodes_count?: number;
  total_documents?: number;
}

export interface SetupDocument {
  id: string;
  filename: string;
  file_type: string;
  media_type: 'document' | 'lecture';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  stage: string | null;
  progress: number | null;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  processed_at: string | null;
}

export type SetupPhase = 'no_materials' | 'processing' | 'ready_to_build' | 'building' | 'build_failed'
  | 'materials_failed' | 'ready';

export interface CourseSetup {
  phase: SetupPhase;
  auto_build: boolean;
  documents: { total: number; ready: number; processing: number; pending: number; failed: number; items: SetupDocument[] };
  build: GraphBuild | null;
  graph: { id: string; nodes_count: number; edges_count: number; created_at: string } | null;
  materials_changed: string[];
  students: number;
}
