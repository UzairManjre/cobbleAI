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
