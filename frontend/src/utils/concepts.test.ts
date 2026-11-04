import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '../types/graph';
import { conceptState, missingPrerequisites, prerequisiteIds } from './concepts';

const edge = (from: string, to: string, relation: string): GraphEdge => ({ id: `${from}-${relation}-${to}`, from, to, relation });
const node = (id: string): GraphNode => ({ id, label: id.toUpperCase(), description: '' });

describe('prerequisites', () => {
  const edges = [
    edge('recursion', 'mergesort', 'prerequisite_for'),
    edge('mergesort', 'arrays', 'builds_on'),
    edge('quicksort', 'mergesort', 'contrasts_with'),
    edge('heap', 'mergesort', 'relates_to'),
  ];

  it('only counts links that mean "study this first", in their own direction', () => {
    expect(prerequisiteIds('mergesort', edges).sort()).toEqual(['arrays', 'recursion']);
    expect(prerequisiteIds('quicksort', edges)).toEqual([]);
  });

  it('locks a concept until its prerequisites are visited or mastered', () => {
    expect(conceptState('mergesort', edges, [], [])).toBe('locked');
    expect(conceptState('mergesort', edges, ['recursion'], ['arrays'])).toBe('open');
    expect(conceptState('quicksort', edges, [], [])).toBe('open'); // "contrasts with" locks nothing
    expect(conceptState('mergesort', edges, ['mergesort'], [])).toBe('visited');
  });

  it('lists the prerequisites still missing', () => {
    const nodes = ['recursion', 'mergesort', 'arrays', 'quicksort', 'heap'].map(node);
    expect(missingPrerequisites('mergesort', nodes, edges, ['recursion'], []).map(n => n.id)).toEqual(['arrays']);
  });
});
