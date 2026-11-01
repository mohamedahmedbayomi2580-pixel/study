// RAG بسيط على الجهاز: تقسيم النص لأجزاء واختيار الأقرب للسؤال.
export function chunk(text: string, size = 1200): string[] {
  const out: string[] = []; let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    const nl = text.lastIndexOf('\n', end);
    if (nl > i + size / 2 && end < text.length) end = nl;
    out.push(text.slice(i, end)); i = end;
  }
  return out;
}
const tok = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
export function topChunks(text: string, q: string, n = 5): string {
  const qs = new Set(tok(q)); if (!qs.size) return text.slice(0, 6000);
  const scored = chunk(text).map((c, idx) => {
    const t = tok(c); let s = 0; for (const w of t) if (qs.has(w)) s++;
    return { c, idx, s: s / Math.sqrt(t.length + 1) };
  }).sort((a, b) => b.s - a.s).slice(0, n).sort((a, b) => a.idx - b.idx);
  return scored.map(x => x.c).join('\n---\n');
}
