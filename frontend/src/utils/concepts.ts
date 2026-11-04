import type { GraphEdge, GraphNode } from '../types/graph';

export type ConceptState = 'mastered' | 'visited' | 'locked' | 'open';

// Only links that mean "study A before B" make a prerequisite. "A contrasts with B" or
// "A relates to B" are worth exploring but must not lock anything.
const BEFORE_TARGET = new Set(['prerequisite_for', 'enables']); // A -> B: A first
const BEFORE_SOURCE = new Set(['builds_on', 'requires']); // B -> A: A first

/** Ids of the concepts to study before this one, according to the map's links. */
export function prerequisiteIds(id: string, edges: GraphEdge[]): string[] {
  const ids = new Set<string>();
  edges.forEach(e => {
    if (e.to === id && BEFORE_TARGET.has(e.relation)) ids.add(e.from);
    if (e.from === id && BEFORE_SOURCE.has(e.relation)) ids.add(e.to);
  });
  ids.delete(id);
  return [...ids];
}

/** A concept is locked while one of its prerequisites is neither visited nor mastered. */
export function conceptState(id: string, edges: GraphEdge[], visited: string[], mastered: string[]): ConceptState {
  if (mastered.includes(id)) return 'mastered';
  if (visited.includes(id)) return 'visited';
  const locked = prerequisiteIds(id, edges).some(p => !visited.includes(p) && !mastered.includes(p));
  return locked ? 'locked' : 'open';
}

/** The prerequisites of this concept not yet visited or mastered. */
export function missingPrerequisites(id: string, nodes: GraphNode[], edges: GraphEdge[], visited: string[], mastered: string[]): GraphNode[] {
  const missing = new Set(prerequisiteIds(id, edges).filter(p => !visited.includes(p) && !mastered.includes(p)));
  return nodes.filter(n => missing.has(n.id));
}

/** "is_part_of" -> "is part of" */
export const relationText = (relation: string): string => relation.replace(/_/g, ' ');
