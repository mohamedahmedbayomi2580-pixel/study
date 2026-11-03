// كل رسائل التطبيق تذهب إلى Google Gemini عبر وسيط (Worker) يحمل المفتاح بشكل مخفي. لا مفاتيح عند المستخدم.
import { get } from './db';
import { DEFAULT_SETTINGS, Settings } from './types';

export const NAME = 'Google Gemini';
const BUILD_URL: string = (import.meta as any).env?.VITE_AI_PROXY_URL || '';

export async function proxyUrl(): Promise<string> {
  const s = await get<Settings>('settings', DEFAULT_SETTINGS);
  const u = (s.serverUrl && s.serverUrl !== DEFAULT_SETTINGS.serverUrl ? s.serverUrl : BUILD_URL) || '';
  return u.replace(/\/$/, '');
}

async function ask(system: string, user: string, opts?: { search?: boolean }): Promise<{ text: string; inTok: number; outTok: number; sources?: { uri: string; title: string }[] }> {
  const url = await proxyUrl();
  if (!url) throw new Error('خدمة الذكاء الاصطناعي غير مضبوطة بعد (عنوان الوسيط مفقود). راجع الإعدادات.');
  let r: Response;
  try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, user, search: !!opts?.search }) }); }
  catch { throw new Error('تعذر الاتصال بالإنترنت أو بخدمة الذكاء الاصطناعي.'); }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'خطأ ' + r.status);
  return d;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e: any) { last = e; if (e?.name === 'AbortError' || /حد المجاني|غير مضبوط|طلبات كثيرة/.test(e.message)) break; await sleep(800 * 2 ** i); } }
  throw last;
}
export const testProxy = async () => (await ask('Reply with the single word OK.', 'ping')).text.slice(0, 20);

const BASE = (lang: string) => `You are study.ai, an expert teaching assistant. Work ONLY from the SOURCE text provided. Never invent facts that are not in the source. The source contains page markers like [[p.N]]; cite pages as (p.N) when possible. Write in ${lang === 'ar' ? 'Arabic (clear Modern Standard Arabic; keep English technical terms in parentheses)' : 'English'}.`;
export const TASKS: Record<string, { sys: string; json: boolean }> = {
  summary: { json: false, sys: 'Produce: 1) a short summary, 2) key points, 3) a per-chapter summary, 4) definitions & terms, 5) formulas/equations if any, 6) things to memorize.' },
  explain: { json: false, sys: 'Explain each chapter in detail for a beginner, simplify hard concepts, add real-world examples and step-by-step solved examples if relevant, and translate technical terms.' },
  mindmap: { json: true, sys: 'Create a mind map as a tree. Return ONLY a JSON array with ONE root object, no markdown fences: [{"title":"central topic","children":[{"title":"branch","children":[{"title":"sub-branch"}]}]}]. Use 4-8 main branches, keep titles short.' },
  plan: { json: false, sys: 'Create a day-by-day study plan that distributes the chapters over the number of days given in EXTRA, with review days and a final self-test day.' },
  quiz: { json: true, sys: 'Create 10 multiple-choice questions of mixed difficulty. Return ONLY a JSON array, no markdown fences: [{"q":"...","options":["a","b","c","d"],"answer":0,"explanation":"why, with (p.N)"}] where answer is the 0-based index of the correct option.' },
  flashcards: { json: true, sys: 'Create 15 flashcards. Return ONLY a JSON array, no markdown fences: [{"front":"question or term","back":"answer or definition"}].' }
};
const validJson = (s: string) => { const m = s.match(/\[[\s\S]*\]/); if (!m) return false; try { return Array.isArray(JSON.parse(m[0])); } catch { return false; } };
const MAX = 60000;

async function run(system: string, user: string, json: boolean) {
  const t0 = Date.now();
  let text = ''; let inTok = 0; let outTok = 0;
  for (let k = 0; k < 2; k++) {
    const r = await withRetry(() => ask(system, user));
    text = r.text; inTok += r.inTok; outTok += r.outTok;
    if (!json || validJson(text)) break;
    if (k === 1) throw new Error('رد Google ليس بصيغة صالحة، أعد المحاولة.');
  }
  return { text, report: [{ id: 'gemini', role: 'generate', ok: true, ms: Date.now() - t0, inTok, outTok }] };
}

export async function generateLocal(b: { kind: string; text: string; mode?: string; lang: string; extra?: string }) {
  const task = TASKS[b.kind]; if (!task) throw new Error('نوع غير مدعوم');
  const src = b.text.length > MAX ? b.text.slice(0, MAX) : b.text;
  const r = await run(`${BASE(b.lang)}\n\nTASK: ${task.sys}`, `${b.extra ? `EXTRA: ${String(b.extra).slice(0, 800)}\n\n` : ''}SOURCE:\n${src}`, task.json);
  return { content: r.text, providers: r.report, truncated: b.text.length > MAX };
}

// تعديل نتيجة موجودة بطلب حر: "زوّد 10 بطاقات"، "بسّط"، "ركّز على الفصل الثاني" ...
export async function refineLocal(b: { kind: string; text: string; current: string; instruction: string; lang: string }) {
  const task = TASKS[b.kind]; if (!task) throw new Error('نوع غير مدعوم');
  const src = b.text.length > MAX ? b.text.slice(0, MAX) : b.text;
  const system = `${BASE(b.lang)}\n\nORIGINAL TASK: ${task.sys}\n\nYou will receive the CURRENT RESULT and a USER REQUEST to modify it (add items, simplify, focus on a part, etc.). Apply the request and return the COMPLETE updated result in exactly the same format as the original task${task.json ? ' (ONLY the JSON array, keeping existing items unless asked to change them; new items must not duplicate existing ones)' : ''}.`;
  const r = await run(system, `SOURCE:\n${src}\n\nCURRENT RESULT:\n${b.current}\n\nUSER REQUEST: ${b.instruction.slice(0, 500)}`, task.json);
  return { content: r.text, providers: r.report };
}

export async function askStream(system: string, user: string, opts: { search?: boolean; signal?: AbortSignal; onDelta: (t: string) => void }) {
  const url = await proxyUrl();
  if (!url) throw new Error('خدمة الذكاء الاصطناعي غير مضبوطة بعد (عنوان الوسيط مفقود). راجع الإعدادات.');
  let r: Response;
  try { r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, user, stream: true, search: !!opts.search }), signal: opts.signal }); }
  catch { throw new Error('تعذر الاتصال بالإنترنت أو بخدمة الذكاء الاصطناعي.'); }
  if (!r.ok) { const d: any = await r.json().catch(() => ({})); throw new Error(d.error || 'خطأ ' + r.status); }
  let full = ''; const sources = new Map<string, string>();
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const j = line.slice(5).trim(); if (!j || j === '[DONE]') return;
    try {
      const d = JSON.parse(j); const cand = d.candidates?.[0];
      const t = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
      if (t) { full += t; opts.onDelta(full); }
      for (const c of cand?.groundingMetadata?.groundingChunks || []) if (c.web?.uri) sources.set(c.web.uri, c.web.title || c.web.uri);
    } catch { /* سطر غير مكتمل */ }
  };
  if (r.body) {
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; lines.forEach(handle); }
    if (buf) handle(buf);
  } else (await r.text()).split('\n').forEach(handle);
  if (!full) throw new Error('لم يصل رد من Google (قد يكون المحتوى محجوبًا).');
  return { text: full, sources: [...sources].map(([uri, title]) => ({ uri, title })) };
}

export async function chatLocal(b: { question: string; context: string; history: { role: string; content: string }[]; lang: string; search?: boolean; signal?: AbortSignal; onDelta?: (t: string) => void }) {
  const hist = b.history.map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n');
  const lang = b.lang === 'ar' ? 'Arabic (clear Modern Standard Arabic; keep English technical terms in parentheses)' : 'English';
  const system = b.search
    ? `You are study.ai, a helpful teaching assistant for students. Use Google Search for current or general knowledge. If the CONTEXT (the student's material) is relevant, prefer it and cite pages (p.N); clearly separate what comes from the material and what comes from the web. Write in ${lang}.`
    : `${BASE(b.lang)}\nAnswer the student's question using the CONTEXT excerpts first. Cite pages (p.N) when available. If the answer is not in the context, say clearly that it is not in the material, then you may add a short general explanation labeled as outside the material.`;
  const user = `CONTEXT:\n${b.context || '(no material attached)'}\n\nHISTORY:\n${hist}\n\nQUESTION: ${b.question}`;
  const r = await withRetry(() => askStream(system, user, { search: b.search, signal: b.signal, onDelta: b.onDelta || (() => {}) }));
  return { answer: r.text, sources: r.sources };
}

// ---------- الطلب قبل التنفيذ: تحليل الطلب وإنتاج خطة (لا يُرسل محتوى الملفات، فقط نص الطلب وأسماء الملفات) ----------
export interface Plan { understanding: string; sources: string; tasks: { kind: string; why: string }[]; needsSearch: boolean; searchQuery?: string; media: string; tips: string[]; }
export async function planLocal(b: { request: string; materials: string[]; lang: string }): Promise<Plan> {
  const style = b.lang === 'ar'
    ? 'Write like a friendly Egyptian university professor: Arabic (Egyptian-friendly) mixed with English technical terms, e.g. "لو الامتحان MCQ ركّز على الـ definitions".'
    : 'Write like a friendly university professor.';
  const system = `You are the planner of study.ai, a study assistant. Analyze the student's request and return ONLY a JSON object (no markdown fences) with this shape: {"understanding":"what the student wants","sources":"which of the listed materials to use, or none","tasks":[{"kind":"summary|explain|quiz|flashcards|mindmap|plan","why":"short reason"}],"needsSearch":true or false,"searchQuery":"query if search is needed","media":"does it need images/video/documents? Be honest: video generation is NOT available in this app yet","tips":["2-4 professor-style rules like: if X happens choose Y"]}. Allowed task kinds ONLY: summary, explain, quiz, flashcards, mindmap, plan. ${style}`;
  const r = await withRetry(() => ask(system, `MATERIALS: ${b.materials.join(' | ') || '(none)'}\n\nREQUEST: ${b.request.slice(0, 2000)}`));
  const m = r.text.match(/\{[\s\S]*\}/); if (!m) throw new Error('لم أستطع فهم الخطة، أعد صياغة الطلب.');
  let p: any; try { p = JSON.parse(m[0]); } catch { throw new Error('رد غير صالح من Google، أعد المحاولة.'); }
  const ok = ['summary', 'explain', 'quiz', 'flashcards', 'mindmap', 'plan'];
  return {
    understanding: String(p.understanding || ''), sources: String(p.sources || ''),
    tasks: (Array.isArray(p.tasks) ? p.tasks : []).filter((x: any) => ok.includes(x?.kind)).map((x: any) => ({ kind: x.kind, why: String(x.why || '') })),
    needsSearch: !!p.needsSearch, searchQuery: p.searchQuery ? String(p.searchQuery) : undefined,
    media: String(p.media || ''), tips: Array.isArray(p.tips) ? p.tips.map(String) : []
  };
}

export async function researchLocal(b: { query: string; lang: string }) {
  const lang = b.lang === 'ar' ? 'Arabic' : 'English';
  const system = `You are a careful research assistant for students. Use Google Search. Give a clear organized answer in ${lang}, separate confirmed facts from uncertain or disputed claims, and mention which source supports what.`;
  const r = await withRetry(() => ask(system, b.query.slice(0, 1000), { search: true }));
  return { text: r.text, sources: r.sources || [] };
}
