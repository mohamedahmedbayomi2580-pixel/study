// محرك الذكاء الاصطناعي يعمل مباشرة من الجهاز (بدون سيرفر) بمفاتيح صاحب الجهاز نفسه.
import { get, set } from './db';

export type PId = 'gemini' | 'openai' | 'anthropic';
export interface PConf { key: string; model: string; }
export type AiConf = Record<PId, PConf>;
export const PIDS: PId[] = ['gemini', 'openai', 'anthropic'];
export const NAMES: Record<PId, string> = { gemini: 'Google Gemini (مجاني للبداية)', openai: 'OpenAI GPT', anthropic: 'Anthropic Claude' };
export const KEY_LINKS: Record<PId, string> = {
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys'
};
export const DEFAULT_MODELS: Record<PId, string> = { gemini: 'gemini-2.0-flash', openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-5' };

export async function loadConf(): Promise<AiConf> {
  const c = await get<Partial<AiConf>>('ai', {});
  const out: any = {};
  for (const id of PIDS) out[id] = { key: '', model: DEFAULT_MODELS[id], ...(c[id] || {}) };
  return out;
}
export const saveConf = (c: AiConf) => set('ai', c);

interface Res { text: string; inTok: number; outTok: number; }
async function post(url: string, headers: Record<string, string>, body: unknown) {
  let r: Response;
  try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
  catch { throw new Error('تعذر الاتصال بالإنترنت أو بالمزود'); }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${d?.error?.message || d?.error || r.statusText}`);
  return d;
}
async function call(id: PId, c: PConf, system: string, user: string): Promise<Res> {
  if (id === 'gemini') {
    const d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent`, { 'x-goog-api-key': c.key },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] });
    return { text: (d.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join(''), inTok: d.usageMetadata?.promptTokenCount || 0, outTok: d.usageMetadata?.candidatesTokenCount || 0 };
  }
  if (id === 'openai') {
    const d = await post('https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${c.key}` },
      { model: c.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    return { text: d.choices?.[0]?.message?.content || '', inTok: d.usage?.prompt_tokens || 0, outTok: d.usage?.completion_tokens || 0 };
  }
  const d = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    { model: c.model, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] });
  return { text: (d.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), inTok: d.usage?.input_tokens || 0, outTok: d.usage?.output_tokens || 0 };
}

export async function testKey(id: PId, c: PConf): Promise<string> {
  const r = await call(id, c, 'Reply with the single word OK.', 'ping'); return r.text.slice(0, 20) || 'OK';
}
export async function enabledList() { const c = await loadConf(); return PIDS.filter(id => c[id].key.trim()).map(id => ({ id, conf: c[id] })); }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e: any) { last = e; if (/^4(0[0-3]|04)/.test(e.message)) break; await sleep(800 * 2 ** i); } }
  throw last;
}
const NO_KEY = 'لم تضف مفتاح API بعد. افتح الإعدادات وأضف مفتاحًا (مفتاح Gemini مجاني).';
const BASE = (lang: string) => `You are study.ai, an expert teaching assistant. Work ONLY from the SOURCE text provided. Never invent facts that are not in the source. The source contains page markers like [[p.N]]; cite pages as (p.N) when possible. Write in ${lang === 'ar' ? 'Arabic (clear Modern Standard Arabic; keep English technical terms in parentheses)' : 'English'}.`;
const TASKS: Record<string, { sys: string; json: boolean }> = {
  summary: { json: false, sys: 'Produce: 1) a short summary, 2) key points, 3) a per-chapter summary, 4) definitions & terms, 5) formulas/equations if any, 6) things to memorize.' },
  explain: { json: false, sys: 'Explain each chapter in detail for a beginner, simplify hard concepts, add real-world examples and step-by-step solved examples if relevant, and translate technical terms.' },
  mindmap: { json: false, sys: 'Produce a hierarchical mind map as an indented outline (central topic, branches, sub-branches) showing relations between concepts.' },
  plan: { json: false, sys: 'Create a day-by-day study plan that distributes the chapters over the number of days given in EXTRA, with review days and a final self-test day.' },
  quiz: { json: true, sys: 'Create 10 multiple-choice questions of mixed difficulty. Return ONLY a JSON array, no markdown fences: [{"q":"...","options":["a","b","c","d"],"answer":0,"explanation":"why, with (p.N)"}] where answer is the 0-based index of the correct option.' },
  flashcards: { json: true, sys: 'Create 15 flashcards. Return ONLY a JSON array, no markdown fences: [{"front":"question or term","back":"answer or definition"}].' }
};
const validJson = (s: string) => { const m = s.match(/\[[\s\S]*\]/); if (!m) return false; try { return Array.isArray(JSON.parse(m[0])); } catch { return false; } };
const MAX = 60000;

export async function generateLocal(b: { kind: string; text: string; mode: string; lang: string; extra?: string }) {
  const task = TASKS[b.kind]; if (!task) throw new Error('نوع غير مدعوم');
  const en = await enabledList(); if (!en.length) throw new Error(NO_KEY);
  const src = b.text.length > MAX ? b.text.slice(0, MAX) : b.text;
  const system = `${BASE(b.lang)}\n\nTASK: ${task.sys}`;
  const user = `${b.extra ? `EXTRA: Days available: ${String(b.extra).slice(0, 3)}\n\n` : ''}SOURCE:\n${src}`;
  const use = b.mode === 'full' && !task.json ? en : en.slice(0, 1);
  const reports: any[] = []; const drafts: { id: PId; conf: PConf; text: string }[] = [];
  const attempt = async (p: { id: PId; conf: PConf }, role: string) => {
    const t0 = Date.now();
    try {
      const r = await withRetry(() => call(p.id, p.conf, system, user));
      if (task.json && !validJson(r.text)) throw new Error('الرد ليس JSON صالحًا');
      drafts.push({ id: p.id, conf: p.conf, text: r.text });
      reports.push({ id: p.id, role, ok: true, ms: Date.now() - t0, inTok: r.inTok, outTok: r.outTok });
    } catch (e: any) { reports.push({ id: p.id, role, ok: false, ms: Date.now() - t0, inTok: 0, outTok: 0, error: e.message }); }
  };
  await Promise.all(use.map(p => attempt(p, 'generate')));
  if (!drafts.length) for (const p of en.filter(x => !use.includes(x))) { await attempt(p, 'fallback'); if (drafts.length) break; }
  if (!drafts.length) throw new Error('فشلت النماذج: ' + reports.map(r => `${r.id}: ${r.error}`).join(' | '));
  let content = drafts[0].text;
  if (drafts.length > 1) {
    const rv = drafts[0]; const t0 = Date.now();
    try {
      const rs = `${BASE(b.lang)}\n\nYou are the REVIEWER. Merge the drafts into ONE best answer. Remove any claim not supported by SOURCE, resolve contradictions in favor of SOURCE, keep page citations.`;
      const ru = `SOURCE:\n${src}\n\n` + drafts.map((d, i) => `=== DRAFT ${i + 1} (${d.id}) ===\n${d.text}`).join('\n\n');
      const r = await withRetry(() => call(rv.id, rv.conf, rs, ru)); content = r.text || content;
      reports.push({ id: rv.id, role: 'review', ok: true, ms: Date.now() - t0, inTok: r.inTok, outTok: r.outTok });
    } catch (e: any) { reports.push({ id: rv.id, role: 'review', ok: false, ms: Date.now() - t0, inTok: 0, outTok: 0, error: e.message }); }
  }
  return { content, providers: reports, truncated: b.text.length > MAX };
}

export async function chatLocal(b: { question: string; context: string; history: { role: string; content: string }[]; lang: string }) {
  const en = await enabledList(); if (!en.length) throw new Error(NO_KEY);
  const p = en[0];
  const system = `${BASE(b.lang)}\nAnswer the student's question using ONLY the CONTEXT excerpts. Cite pages (p.N) when available. If the answer is not in the context, say clearly that it is not found in the material (you may then add a short general explanation, labeled as outside the material).`;
  const hist = b.history.map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n');
  const r = await withRetry(() => call(p.id, p.conf, system, `CONTEXT:\n${b.context || '(no material attached)'}\n\nHISTORY:\n${hist}\n\nQUESTION: ${b.question}`));
  return { answer: r.text };
}
