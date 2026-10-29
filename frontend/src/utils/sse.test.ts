import { describe, expect, it } from 'vitest';
import { createSSEParser } from './sse';
import type { SSEFrame } from './sse';

function collect() {
  const frames: SSEFrame[] = [];
  const parser = createSSEParser(f => frames.push(f));
  return { frames, parser };
}

describe('createSSEParser', () => {
  it('emits complete frames in order', () => {
    const { frames, parser } = collect();
    parser.push('data: {"type":"sources","sources":[]}\n\ndata: {"type":"chunk","content":"Hi"}\n\n');
    expect(frames.map(f => f.type)).toEqual(['sources', 'chunk']);
  });

  it('buffers a frame split across network chunks', () => {
    const { frames, parser } = collect();
    parser.push('data: {"type":"chunk","con');
    expect(frames).toHaveLength(0);
    parser.push('tent":"merge sort"}\n\n');
    expect(frames).toEqual([{ type: 'chunk', content: 'merge sort' }]);
  });

  it('handles CRLF line endings and a final frame without a trailing blank line', () => {
    const { frames, parser } = collect();
    parser.push('data: {"type":"chunk","content":"a"}\r\n\r\ndata: {"type":"done"}');
    parser.end();
    expect(frames.map(f => f.type)).toEqual(['chunk', 'done']);
  });

  it('skips malformed JSON and frames without a type', () => {
    const { frames, parser } = collect();
    parser.push('data: {not json}\n\ndata: {"content":"x"}\n\n: keep-alive\n\ndata: {"type":"done"}\n\n');
    expect(frames).toEqual([{ type: 'done' }]);
  });
});
