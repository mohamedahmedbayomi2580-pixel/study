import { Provider, providers } from './providers.js';

export interface ProviderReport { id: string; role: string; ok: boolean; ms: number; cost: number; inTok: number; outTok: number; error?: string; }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) { last = e; if (/^4(0[0-3]|04)/.test(e.message)) break; await sleep(800 * 2 ** i); }
  }
  throw last;
}
const cost = (p: Provider, i: number, o: number) => (i * p.priceIn + o * p.priceOut) / 1e6;

const BASE = (lang: string) => `You are study.ai, an expert teaching assistant. Work ONLY from the SOURCE text provided. Never invent facts that are not in the source. The source contains page markers like [[p.N]]; cite pages as (p.N) when possible. Write in ${lang === 'ar' ? 'Arabic (clear Modern Standard Arabic; keep English technical terms in parentheses)' : 'English'}.`;

const TASKS: Record<string, { sys: string; json: boolean }> = {
  summary: { json: false, sys: 'Produce: 1) a short summary, 2) key points, 3) a per-chapter summary, 4) definitions & terms, 5) formulas/equations if any, 6) things to memorize.' },
  explain: { json: false, sys: 'Explain each chapter in detail for a beginner, simplify hard concepts, add real-world examples and step-by-step solved examples if relevant, and translate technical terms.' },
  mindmap: { json: false, sys: 'Produce a hierarchical mind map as an indented outline (central topic, branches, sub-branches) showing relations between concepts.' },
  plan: { json: false, sys: 'Create a day-by-day study plan that distributes the chapters over the number of days given in EXTRA, with review days and a final self-test day.' },
  quiz: { json: true, sys: 'Create 10 multiple-choice questions of mixed difficulty. Return ONLY a JSON array, no markdown fences: [{"q":"...","options":["a","b","c","d"],"answer":0,"explanation":"why, with (p.N)"}] where answer is the 0-based index of the correct option.' },
  flashcards: { json: true, sys: 'Create 15 flashcards. Return ONLY a JSON array, no markdown fences: [{"front":"question or term","back":"answer or definition"}].' }
};
export const KINDS = Object.keys(TASKS);

const MAX_CHARS = 60000;
const validJson = (s: string) => { const m = s.match(/\[[\s\S]*\]/); if (!m) return false; try { return Array.isArray(JSON.parse(m[0])); } catch { return false; } };

export async function generate(kind: string, text: string, mode: 'fast' | 'full', lang: string, extra = '') {
  const task = TASKS[kind]; if (!task) throw new Error('نوع غير مدعوم');
  const enabled = providers.filter(p => p.enabled);
  if (!enabled.length) throw new Error('لا يوجد أي مزود ذكاء اصطناعي مفعّل. أضف مفتاح API في إعدادات السيرفر (.env).');
  const src = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const system = `${BASE(lang)}\n\nTASK: ${task.sys}`;
  const user = `${extra ? `EXTRA: ${extra}\n\n` : ''}SOURCE:\n${src}`;
  const use = mode === 'fast' || task.json ? enabled.slice(0, 1) : enabled;

  const reports: ProviderReport[] = [];
  const drafts: { p: Provider; text: string }[] = [];
  await Promise.all(use.map(async p => {
    const t0 = Date.now();
    try {
      const r = await withRetry(() => p.complete(system, user));
      if (task.json && !validJson(r.text)) throw new Error('الرد ليس JSON صالحًا');
      drafts.push({ p, text: r.text });
      reports.push({ id: p.id, role: 'generate', ok: true, ms: Date.now() - t0, cost: cost(p, r.inTok, r.outTok), inTok: r.inTok, outTok: r.outTok });
    } catch (e: any) { reports.push({ id: p.id, role: 'generate', ok: false, ms: Date.now() - t0, cost: 0, inTok: 0, outTok: 0, error: e.message }); }
  }));
  // لو فشل النموذج الوحيد في الوضع السريع جرّب بقية النماذج بالتتابع
  if (!drafts.length && use.length === 1) {
    for (const p of enabled.slice(1)) {
      const t0 = Date.now();
      try {
        const r = await withRetry(() => p.complete(system, user));
        if (task.json && !validJson(r.text)) throw new Error('الرد ليس JSON صالحًا');
        drafts.push({ p, text: r.text });
        reports.push({ id: p.id, role: 'fallback', ok: true, ms: Date.now() - t0, cost: cost(p, r.inTok, r.outTok), inTok: r.inTok, outTok: r.outTok }); break;
      } catch (e: any) { reports.push({ id: p.id, role: 'fallback', ok: false, ms: Date.now() - t0, cost: 0, inTok: 0, outTok: 0, error: e.message }); }
    }
  }
  if (!drafts.length) throw new Error('فشلت كل النماذج: ' + reports.map(r => `${r.id}: ${r.error}`).join(' | '));

  let content = drafts[0].text;
  if (drafts.length > 1) { // مراجعة ودمج: التأكد من الاستناد للمصدر وحذف المتعارض
    const reviewer = drafts[0].p; const t0 = Date.now();
    try {
      const rs = `${BASE(lang)}\n\nYou are the REVIEWER. You get several drafts for the same task. Merge them into ONE best answer. Remove any claim that is not supported by SOURCE, resolve contradictions in favor of SOURCE, keep page citations.`;
      const ru = `SOURCE:\n${src}\n\n` + drafts.map((d, i) => `=== DRAFT ${i + 1} (${d.p.id}) ===\n${d.text}`).join('\n\n');
      const r = await withRetry(() => reviewer.complete(rs, ru));
      content = r.text || content;
      reports.push({ id: reviewer.id, role: 'review', ok: true, ms: Date.now() - t0, cost: cost(reviewer, r.inTok, r.outTok), inTok: r.inTok, outTok: r.outTok });
    } catch (e: any) { reports.push({ id: reviewer.id, role: 'review', ok: false, ms: Date.now() - t0, cost: 0, inTok: 0, outTok: 0, error: e.message }); }
  }
  return { content, providers: reports, totalCost: reports.reduce((s, r) => s + r.cost, 0), truncated: text.length > MAX_CHARS };
}

export async function chat(question: string, context: string, history: { role: string; content: string }[], lang: string) {
  const p = providers.find(x => x.enabled); if (!p) throw new Error('لا يوجد أي مزود ذكاء اصطناعي مفعّل.');
  const system = `${BASE(lang)}\nAnswer the student's question using ONLY the CONTEXT excerpts. Cite pages (p.N) when available. If the answer is not in the context, say clearly that it is not found in the material (you may then add a short general explanation, labeled as outside the material).`;
  const hist = history.map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n');
  const r = await withRetry(() => p.complete(system, `CONTEXT:\n${context || '(no material attached)'}\n\nHISTORY:\n${hist}\n\nQUESTION: ${question}`));
  return { answer: r.text, provider: p.id, cost: cost(p, r.inTok, r.outTok) };
}
