// Incremental parser for `data: {json}\n\n` server-sent event frames delivered over fetch()

export type SSEFrame = { type: string; [key: string]: unknown };

export function createSSEParser(onFrame: (frame: SSEFrame) => void) {
  let buffer = '';

  return {
    /** Feed decoded text; complete frames are emitted, a trailing partial frame is buffered. */
    push(text: string) {
      buffer += text.replace(/\r\n/g, '\n');
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const frame = JSON.parse(line.slice(6));
            if (frame && typeof frame.type === 'string') onFrame(frame as SSEFrame);
          } catch {
            // Ignore malformed frames rather than aborting the stream
          }
        }
      }
    },
    /** Flush a final frame that was not followed by a blank line. */
    end() {
      if (buffer.trim()) {
        const rest = buffer;
        buffer = '';
        this.push(rest + '\n\n');
      }
    },
  };
}
