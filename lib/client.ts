// Browser-side SSE reader for POST endpoints.
export async function streamSSE(url: string, body: unknown, onEvent: (event: string, data: any) => void, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.body) throw new Error('no stream');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      try {
        onEvent(event, data ? JSON.parse(data) : null);
      } catch (e) {
        console.error('[crowdsight] event handler', event, e);
      }
    }
  }
}

export function stanceColor(s: number): string {
  // red #FF5A4E → grey #5C5C62 → green #3DDC97
  const neg = [255, 90, 78], mid = [92, 92, 98], pos = [61, 220, 151];
  const t = Math.max(-1, Math.min(1, s));
  const [a, b, k] = t < 0 ? [mid, neg, -t] : [mid, pos, t];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
