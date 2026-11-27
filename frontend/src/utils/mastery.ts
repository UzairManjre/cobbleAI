import { graphsApi } from '../api';
import { learnerApi } from '../api/learner';
import { learningOrder, trailsFor } from '../components/graph/terrain/layout';
import type { GraphEdge, GraphNode } from '../types/graph';

/** A concept counts as known from this mastery up, and as being learned from LEARNING up. */
export const KNOWN = 0.7;
export const LEARNING = 0.4;

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export type MasteryLevel = 'known' | 'learning' | 'new';
export const levelOf = (m: number): MasteryLevel => (m >= KNOWN ? 'known' : m >= LEARNING ? 'learning' : 'new');

/** Fill colours for the three levels, darkest = known. */
export const LEVEL_BG: Record<MasteryLevel, string> = { known: 'bg-[#1b566b]', learning: 'bg-[#8fbccb]', new: 'bg-[#d3e0e6]' };

/** One line on how confidence compares with results, from the calibration gap (sureness minus accuracy). */
export function calibrationVerdict(gap: number | null) {
  if (gap === null) return '';
  return gap < -0.1 ? 'You are right more often than you feel. Trust your answers.'
    : gap > 0.1 ? 'You feel surer than you are. Double-check before answering.'
      : 'How sure you feel matches how often you are right.';
}

export interface StudyConcept { id: string; label: string; description: string; mastery: number; step: number }

/**
 * A class's concepts in study order (the same step numbers as the concept map) with this student's
 * mastery. Empty when the class has no map yet.
 */
export async function loadStudyPath(courseId: string): Promise<StudyConcept[]> {
  const [graphs, mastery] = await Promise.allSettled([graphsApi.getByCourse(courseId), learnerApi.mastery(courseId)]);
  const graph = graphs.status === 'fulfilled' ? graphs.value.data?.[0] : null;
  const nodes: GraphNode[] = graph?.nodes ?? [];
  const edges: GraphEdge[] = graph?.edges ?? [];
  const m = mastery.status === 'fulfilled' ? mastery.value.data.concepts : {};
  const order = learningOrder(nodes, trailsFor(nodes, edges));
  return nodes
    .map(n => ({ id: n.id, label: n.label, description: n.description, mastery: m[n.id]?.p_mastery ?? 0, step: order.get(n.id) ?? 0 }))
    .sort((a, b) => a.step - b.step);
}

/** The first concept in study order that is not known yet, and the known one just before it. */
export function nextStep(path: StudyConcept[]) {
  const next = path.find(k => k.mastery < KNOWN);
  if (!next) return null;
  const before = path.filter(k => k.step < next.step && k.mastery >= KNOWN).slice(-1)[0];
  return { next, before };
}
