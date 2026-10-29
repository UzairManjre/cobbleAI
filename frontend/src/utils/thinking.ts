/** Splits `<thought>` reasoning out of a streamed answer (an unterminated block runs to the end). */
export function splitThinking(content: string, thinking?: string | null): { reasoning: string; text: string } {
  const matches = content.match(/<thought>([\s\S]*?)(<\/thought>|$)/g);
  const streamed = matches ? matches.map(m => m.replace(/<\/?thought>/g, '')).join('\n') : '';
  const text = content.replace(/<thought>[\s\S]*?(<\/thought>|$)/g, '').trim();
  return { reasoning: (thinking || streamed || '').trim(), text };
}
