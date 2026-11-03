// ============ Study AI Engine ============
// طلب المستخدم → Planner (خطة) → Orchestrator (يختار النموذج لكل مهمة) → Providers (Gemini / ChatGPT / Claude) → مراجعة اختيارية → النتيجة.
// Gemini يعمل بمفتاح مجاني أو عبر وسيط. ChatGPT وClaude اختياريان (مفتاح المستخدم نفسه، ويحتاجان رصيد API).
import { get, set } from './db';
import { DEFAULT_SETTINGS, Settings } from './types';

export type PId = 'gemini' | 'openai' | 'anthropic';
export const PIDS: PId[] = ['gemini', 'openai', 'anthropic'];
export const PNAMES: Record<PId, string> = { gemini: 'Google Gemini', openai: 'ChatGPT (OpenAI)', anthropic: 'Claude (Anthropic)' };
export const NAME = PNAMES.gemini;
export interface Src { uri: string; title: string; }
interface Res { text: string; inTok: number; outTok: number; sources?: Src[]; }
interface CallOpts { search?: boolean; signal?: AbortSignal; parts?: any[]; }

const NOCFG = 'افتح الإعدادات والصق مفتاح Gemini المجاني (أسرع طريقة)، أو اضبط عنوان الوسيط.';
const NET = 'تعذر الاتصال بالإنترنت أو بالخدمة.';
const BUILD_URL: string = (import.meta as any).env?.VITE_AI_PROXY_URL || '';
const GURL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest';
const cfg = () => get<Settings>('settings', DEFAULT_SETTINGS);

function fail(msg: string, status = 0): never { const e: any = new Error(msg); e.status = status; throw e; }
function httpErr(p: PId, status: number, d: any): never {
  const name = PNAMES[p];
  const m = d?.error?.message || (typeof d?.error === 'string' ? d.error : '') || '';
  if (status === 429) fail(p === 'gemini' ? 'وصلنا للحد المجاني من Google حاليًا، جرّب بعد قليل.' : `${name}: لا يوجد رصيد كافٍ أو تجاوزت الحد (429). راجع رصيد الـ API في حسابك.`, 429);
  if (status === 401 || status === 403 || (status === 400 && p === 'gemini')) fail(`${name}: المفتاح غير صالح أو غير مفعّل.`, status);
  if (status === 404) fail(`${name}: اسم النموذج غير متاح حاليًا.`, 404);
  fail(`${name}: خطأ ${status} ${m}`, status);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e: any) {
      last = e;
      if (e?.name === 'AbortError' || e?.status === 0 || (e?.status >= 400 && e?.status < 500)) break;
      await sleep(800 * 2 ** i);
    }
  }
  throw last;
}

export async function proxyUrl(): Promise<string> {
  const s = await cfg();
  return ((s.serverUrl && s.serverUrl !== DEFAULT_SETTINGS.serverUrl ? s.serverUrl : BUILD_URL) || '').replace(/\/$/, '');
}
export async function availableProviders(): Promise<PId[]> {
  const s = await cfg(); const out: PId[] = [];
  if ((s.geminiKey || '').trim() || (await proxyUrl())) out.push('gemini');
  if ((s.openaiKey || '').trim()) out.push('openai');
  if ((s.anthropicKey || '').trim()) out.push('anthropic');
  return out;
}
// Orchestrator: الافتراضي = المجاني أولًا (Gemini). المستخدم يستطيع تحديد نموذج لكل مهمة.
export function pickProvider(kind: string, avail: PId[], prefs?: Record<string, string>, exclude?: PId): PId {
  const pref = prefs?.[kind];
  if (pref && pref !== 'auto' && avail.includes(pref as PId) && pref !== exclude) return pref as PId;
  return (['gemini', 'openai', 'anthropic'] as PId[]).find(p => avail.includes(p) && p !== exclude) || avail[0];
}

async function geminiFetch(system: string, user: string, stream: boolean, o: CallOpts): Promise<Response> {
  const s = await cfg(); const key = (s.geminiKey || '').trim();
  try {
    if (key) {
      const payload: any = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [...(o.parts || []), { text: user }] }] };
      if (o.search) payload.tools = [{ google_search: {} }];
      return await fetch(`${GURL}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload), signal: o.signal });
    }
    const url = await proxyUrl(); if (!url) fail(NOCFG);
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, user, stream, search: !!o.search, parts: o.parts }), signal: o.signal });
  } catch (e: any) { if (e?.name === 'AbortError' || e?.status !== undefined) throw e; fail(NET, -1); }
}

export interface Usage { calls: number; inTok: number; outTok: number; }
let usageChain: Promise<void> = Promise.resolve();
function recordUsage(p: PId, i: number, o: number) {
  usageChain = usageChain.then(async () => {
    const u = await get<Record<string, Usage>>('usage', {}); const c = u[p] || { calls: 0, inTok: 0, outTok: 0 };
    u[p] = { calls: c.calls + 1, inTok: c.inTok + i, outTok: c.outTok + o }; await set('usage', u);
  }).catch(() => {});
}
export const getUsage = () => get<Record<string, Usage>>('usage', {});
export const resetUsage = () => set('usage', {});
async function call(p: PId, system: string, user: string, o: CallOpts = {}): Promise<Res> {
  const r = await callRaw(p, system, user, o); recordUsage(p, r.inTok, r.outTok); return r;
}
async function callRaw(p: PId, system: string, user: string, o: CallOpts = {}): Promise<Res> {
  if (p === 'gemini') {
    const r = await geminiFetch(system, user, false, o); const d: any = await r.json().catch(() => ({}));
    if (!r.ok) httpErr(p, r.status, d);
    if (typeof d.text === 'string') return { text: d.text, inTok: d.inTok || 0, outTok: d.outTok || 0, sources: d.sources || [] };
    const cand = d.candidates?.[0];
    const text = (cand?.content?.parts || []).map((x: any) => x.text || '').join('');
    if (!text) fail('لم يصل رد من Google (قد يكون المحتوى محجوبًا).');
    const sources = (cand?.groundingMetadata?.groundingChunks || []).filter((c: any) => c.web?.uri).map((c: any) => ({ uri: c.web.uri, title: c.web.title || c.web.uri }));
    return { text, sources, inTok: d.usageMetadata?.promptTokenCount || 0, outTok: d.usageMetadata?.candidatesTokenCount || 0 };
  }
  const s = await cfg();
  if (p === 'openai') {
    const key = (s.openaiKey || '').trim(); if (!key) fail('مفتاح ChatGPT غير مضاف.');
    let r: Response;
    try { r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: s.openaiModel || 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }), signal: o.signal }); }
    catch (e: any) { if (e?.name === 'AbortError') throw e; fail(NET, -1); }
    const d: any = await r.json().catch(() => ({})); if (!r.ok) httpErr(p, r.status, d);
    return { text: d.choices?.[0]?.message?.content || '', inTok: d.usage?.prompt_tokens || 0, outTok: d.usage?.completion_tokens || 0 };
  }
  const key = (s.anthropicKey || '').trim(); if (!key) fail('مفتاح Claude غير مضاف.');
  let r: Response;
  try { r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: s.anthropicModel || 'claude-sonnet-4-5', max_tokens: 4096, system, messages: [{ role: 'user', content: user }] }), signal: o.signal }); }
  catch (e: any) { if (e?.name === 'AbortError') throw e; fail(NET, -1); }
  const d: any = await r.json().catch(() => ({})); if (!r.ok) httpErr(p, r.status, d);
  return { text: (d.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), inTok: d.usage?.input_tokens || 0, outTok: d.usage?.output_tokens || 0 };
}
export const testProvider = async (p: PId) => (await call(p, 'Reply with the single word OK.', 'ping')).text.slice(0, 20) || 'OK';

// بث مباشر لـ Gemini؛ ChatGPT/Claude يُعرضان دفعة واحدة.
export async function askStream(p: PId, system: string, user: string, opts: { search?: boolean; signal?: AbortSignal; onDelta: (t: string) => void }) {
  if (p !== 'gemini') { const r = await call(p, system, user, { signal: opts.signal }); opts.onDelta(r.text); return { text: r.text, sources: [] as Src[] }; }
  const r = await geminiFetch(system, user, true, { search: opts.search, signal: opts.signal });
  if (!r.ok) { const d: any = await r.json().catch(() => ({})); httpErr(p, r.status, d); }
  let full = ''; let sIn = 0; let sOut = 0; const sources = new Map<string, string>();
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const j = line.slice(5).trim(); if (!j || j === '[DONE]') return;
    try {
      const d = JSON.parse(j); const cand = d.candidates?.[0];
      if (d.usageMetadata) { sIn = d.usageMetadata.promptTokenCount || sIn; sOut = d.usageMetadata.candidatesTokenCount || sOut; }
      const t = (cand?.content?.parts || []).map((x: any) => x.text || '').join('');
      if (t) { full += t; opts.onDelta(full); }
      for (const c of cand?.groundingMetadata?.groundingChunks || []) if (c.web?.uri) sources.set(c.web.uri, c.web.title || c.web.uri);
    } catch { /* سطر غير مكتمل */ }
  };
  if (r.body) {
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; lines.forEach(handle); }
    if (buf) handle(buf);
  } else (await r.text()).split('\n').forEach(handle);
  if (!full) fail('لم يصل رد من Google (قد يكون المحتوى محجوبًا).');
  recordUsage('gemini', sIn, sOut);
  return { text: full, sources: [...sources].map(([uri, title]) => ({ uri, title })) };
}

const BASE = (lang: string) => `You are study.ai, an expert teaching assistant. Work ONLY from the SOURCE text provided. Never invent facts that are not in the source. The source contains page markers like [[p.N]]; cite pages as (p.N) when possible. Write in ${lang === 'ar' ? 'Arabic (clear Modern Standard Arabic; keep English technical terms in parentheses)' : 'English'}.`;
export const TASKS: Record<string, { sys: string; json: boolean }> = {
  summary: { json: false, sys: 'Produce: 1) a short summary, 2) key points, 3) a per-chapter summary, 4) definitions & terms, 5) formulas/equations if any, 6) things to memorize.' },
  explain: { json: false, sys: 'Explain each chapter in detail for a beginner, simplify hard concepts, add real-world examples and step-by-step solved examples if relevant, and translate technical terms.' },
  mindmap: { json: true, sys: 'Create a mind map as a tree. Return ONLY a JSON array with ONE root object, no markdown fences: [{"title":"central topic","children":[{"title":"branch","children":[{"title":"sub-branch"}]}]}]. Use 4-8 main branches, keep titles short.' },
  plan: { json: false, sys: 'Create a day-by-day study plan that distributes the chapters over the number of days given in EXTRA, with review days and a final self-test day.' },
  quiz: { json: true, sys: 'Create 10 multiple-choice questions of mixed difficulty. Return ONLY a JSON array, no markdown fences: [{"q":"...","options":["a","b","c","d"],"answer":0,"explanation":"why, with (p.N)"}] where answer is the 0-based index of the correct option.' },
  flashcards: { json: true, sys: 'Create 15 flashcards. Return ONLY a JSON array, no markdown fences: [{"front":"question or term","back":"answer or definition"}].' },
  videos: { json: true, sys: 'Write a narrated lesson script of 6-10 scenes that teaches the material. Return ONLY a JSON array, no markdown fences: [{"title":"scene title","bullets":["short on-screen point","short on-screen point"],"narration":"2-3 natural spoken sentences read aloud by a teacher"}]. Keep narration plain text without symbols or markdown.' }
};
const validJson = (s: string) => { const m = s.match(/\[[\s\S]*\]/); if (!m) return false; try { return Array.isArray(JSON.parse(m[0])); } catch { return false; } };
const MAX = 60000;
export interface Report { id: PId; role: string; ok: boolean; ms: number; inTok: number; outTok: number; error?: string; }

async function runOne(p: PId, system: string, user: string, json: boolean, role: string) {
  const t0 = Date.now(); let text = ''; let inTok = 0; let outTok = 0;
  for (let k = 0; k < 2; k++) {
    const r = await withRetry(() => call(p, system, user)); text = r.text; inTok += r.inTok; outTok += r.outTok;
    if (!json || validJson(text)) break;
    if (k === 1) fail('رد النموذج ليس بصيغة صالحة، أعد المحاولة.');
  }
  return { text, report: { id: p, role, ok: true, ms: Date.now() - t0, inTok, outTok } as Report };
}
async function runChain(order: PId[], system: string, user: string, json: boolean) {
  const reports: Report[] = [];
  for (const p of order) {
    const role = reports.length ? 'fallback' : 'generate';
    try { const r = await runOne(p, system, user, json, role); reports.push(r.report); return { text: r.text, provider: p, reports }; }
    catch (e: any) { if (e?.name === 'AbortError') throw e; reports.push({ id: p, role, ok: false, ms: 0, inTok: 0, outTok: 0, error: e.message }); }
  }
  throw new Error('فشلت كل النماذج: ' + reports.map(r => `${r.id}: ${r.error}`).join(' | '));
}
const orderFor = (first: PId, avail: PId[]) => [first, ...avail.filter(x => x !== first)];

export async function generateLocal(b: { kind: string; text: string; lang: string; extra?: string; mode?: string; provider?: PId; verify?: boolean }) {
  const task = TASKS[b.kind]; if (!task) throw new Error('نوع غير مدعوم');
  const avail = await availableProviders(); if (!avail.length) throw new Error(NOCFG);
  const s = await cfg();
  const first = b.provider && avail.includes(b.provider) ? b.provider : pickProvider(b.kind, avail, s.taskModel);
  const src = b.text.length > MAX ? b.text.slice(0, MAX) : b.text;
  const system = `${BASE(b.lang)}\n\nTASK: ${task.sys}`;
  const user = `${b.extra ? `EXTRA: ${String(b.extra).slice(0, 800)}\n\n` : ''}SOURCE:\n${src}`;
  const chain = await runChain(orderFor(first, avail), system, user, task.json);
  let content = chain.text; const reports = chain.reports;
  if (b.verify && !task.json && avail.length > 1) {
    const rv = pickProvider(b.kind, avail, undefined, chain.provider); const t0 = Date.now();
    try {
      const rs = `${BASE(b.lang)}\n\nYou are the REVIEWER. You receive a draft answer for the task below. Fix or remove any claim that is not supported by SOURCE, fix contradictions, keep page citations, and return the final improved answer in the same format.\nTASK: ${task.sys}`;
      const r = await withRetry(() => call(rv, rs, `SOURCE:\n${src}\n\nDRAFT:\n${content}`));
      if (r.text) content = r.text;
      reports.push({ id: rv, role: 'review', ok: true, ms: Date.now() - t0, inTok: r.inTok, outTok: r.outTok });
    } catch (e: any) { reports.push({ id: rv, role: 'review', ok: false, ms: Date.now() - t0, inTok: 0, outTok: 0, error: e.message }); }
  }
  return { content, providers: reports, truncated: b.text.length > MAX };
}

// تعديل نتيجة موجودة بطلب حر: "زوّد 10 بطاقات"، "بسّط"...
export async function refineLocal(b: { kind: string; text: string; current: string; instruction: string; lang: string; provider?: PId }) {
  const task = TASKS[b.kind]; if (!task) throw new Error('نوع غير مدعوم');
  const avail = await availableProviders(); if (!avail.length) throw new Error(NOCFG);
  const s = await cfg();
  const first = b.provider && avail.includes(b.provider) ? b.provider : pickProvider(b.kind, avail, s.taskModel);
  const src = b.text.length > MAX ? b.text.slice(0, MAX) : b.text;
  const system = `${BASE(b.lang)}\n\nORIGINAL TASK: ${task.sys}\n\nYou will receive the CURRENT RESULT and a USER REQUEST to modify it (add items, simplify, focus on a part, etc.). Apply the request and return the COMPLETE updated result in exactly the same format as the original task${task.json ? ' (ONLY the JSON array, keeping existing items unless asked to change them; new items must not duplicate existing ones)' : ''}.`;
  const r = await runChain(orderFor(first, avail), system, `SOURCE:\n${src}\n\nCURRENT RESULT:\n${b.current}\n\nUSER REQUEST: ${b.instruction.slice(0, 500)}`, task.json);
  return { content: r.text, providers: r.reports };
}

export async function chatLocal(b: { question: string; context: string; history: { role: string; content: string }[]; lang: string; search?: boolean; provider?: string; signal?: AbortSignal; onDelta?: (t: string) => void }) {
  const avail = await availableProviders(); if (!avail.length) throw new Error(NOCFG);
  let p: PId;
  if (b.search) { if (!avail.includes('gemini')) throw new Error('البحث في Google يحتاج Gemini.'); p = 'gemini'; }
  else p = b.provider && avail.includes(b.provider as PId) ? (b.provider as PId) : pickProvider('chat', avail, (await cfg()).taskModel);
  const hist = b.history.map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`).join('\n');
  const lang = b.lang === 'ar' ? 'Arabic (clear Modern Standard Arabic; keep English technical terms in parentheses)' : 'English';
  const system = b.search
    ? `You are study.ai, a helpful teaching assistant for students. Use Google Search for current or general knowledge. If the CONTEXT (the student's material) is relevant, prefer it and cite pages (p.N); clearly separate what comes from the material and what comes from the web. Write in ${lang}.`
    : `${BASE(b.lang)}\nAnswer the student's question using the CONTEXT excerpts first. Cite pages (p.N) when available. If the answer is not in the context, say clearly that it is not in the material, then you may add a short general explanation labeled as outside the material.`;
  const user = `CONTEXT:\n${b.context || '(no material attached)'}\n\nHISTORY:\n${hist}\n\nQUESTION: ${b.question}`;
  const r = await withRetry(() => askStream(p, system, user, { search: b.search, signal: b.signal, onDelta: b.onDelta || (() => {}) }));
  return { answer: r.text, sources: r.sources, provider: p };
}

// ---------- Planner: الطلب قبل التنفيذ (لا يُرسل محتوى الملفات، فقط نص الطلب وأسماء الملفات) ----------
export interface Plan { understanding: string; sources: string; tasks: { kind: string; why: string; model: PId }[]; needsSearch: boolean; searchQuery?: string; media: string; tips: string[]; available: PId[]; }
export async function planLocal(b: { request: string; materials: string[]; lang: string }): Promise<Plan> {
  const avail = await availableProviders(); if (!avail.length) throw new Error(NOCFG);
  const s = await cfg();
  const style = b.lang === 'ar'
    ? 'Write like a friendly Egyptian university professor: Arabic (Egyptian-friendly) mixed with English technical terms, e.g. "لو الامتحان MCQ ركّز على الـ definitions".'
    : 'Write like a friendly university professor.';
  const system = `You are the planner of study.ai, a study assistant. Analyze the student's request and return ONLY a JSON object (no markdown fences) with this shape: {"understanding":"what the student wants","sources":"which of the listed materials to use, or none","tasks":[{"kind":"summary|explain|quiz|flashcards|mindmap|plan|videos","why":"short reason"}],"needsSearch":true or false,"searchQuery":"query if search is needed","media":"does it need images/video/documents? Be honest: AI-generated video is NOT available; 'videos' means a narrated slide lesson read aloud by device voice","tips":["2-4 professor-style rules like: if X happens choose Y"]}. Allowed task kinds ONLY: summary, explain, quiz, flashcards, mindmap, plan, videos. ${style}`;
  const r = await withRetry(() => call(pickProvider('planner', avail, s.taskModel), system, `MATERIALS: ${b.materials.join(' | ') || '(none)'}\n\nREQUEST: ${b.request.slice(0, 2000)}`));
  const m = r.text.match(/\{[\s\S]*\}/); if (!m) throw new Error('لم أستطع فهم الخطة، أعد صياغة الطلب.');
  let p: any; try { p = JSON.parse(m[0]); } catch { throw new Error('رد غير صالح من النموذج، أعد المحاولة.'); }
  const ok = ['summary', 'explain', 'quiz', 'flashcards', 'mindmap', 'plan', 'videos'];
  return {
    understanding: String(p.understanding || ''), sources: String(p.sources || ''),
    tasks: (Array.isArray(p.tasks) ? p.tasks : []).filter((x: any) => ok.includes(x?.kind)).map((x: any) => ({ kind: x.kind, why: String(x.why || ''), model: pickProvider(x.kind, avail, s.taskModel) })),
    needsSearch: !!p.needsSearch, searchQuery: p.searchQuery ? String(p.searchQuery) : undefined,
    media: String(p.media || ''), tips: Array.isArray(p.tips) ? p.tips.map(String) : [], available: avail
  };
}

export async function researchLocal(b: { query: string; lang: string }) {
  const avail = await availableProviders();
  if (!avail.includes('gemini')) throw new Error('البحث في Google يحتاج Gemini (أضف مفتاحه في الإعدادات).');
  const system = `You are a careful research assistant for students. Use Google Search. Give a clear organized answer in ${b.lang === 'ar' ? 'Arabic' : 'English'}, separate confirmed facts from uncertain or disputed claims, and mention which source supports what.`;
  const r = await withRetry(() => call('gemini', system, b.query.slice(0, 1000), { search: true }));
  return { text: r.text, sources: r.sources || [] };
}

// ---------- استخراج نص من صورة / صوت / فيديو يوتيوب عبر Gemini (رسميًا، يحتاج Gemini) ----------
export async function extractFromMedia(kind: 'image' | 'audio' | 'youtube', input: { mime?: string; data?: string; url?: string }): Promise<string> {
  const avail = await availableProviders();
  if (!avail.includes('gemini')) throw new Error('استخراج النص من الصور والصوت والفيديو يحتاج Gemini (أضف مفتاحه في الإعدادات).');
  const parts = kind === 'youtube' ? [{ fileData: { fileUri: input.url } }] : [{ inlineData: { mimeType: input.mime, data: input.data } }];
  const prompt = kind === 'image'
    ? 'Extract ALL the text in this image exactly (OCR), keeping structure; write tables as plain text. If it is a diagram, describe it briefly after the text. Output only the extracted content.'
    : kind === 'audio'
      ? 'Transcribe this lecture audio faithfully in its original language, adding a timestamp like [mm:ss] about every 30 seconds. Do not summarize.'
      : 'Write detailed, well-organized study notes of this educational video in its language: main points in order with timestamps [mm:ss], key definitions, formulas and examples. Do not invent anything that is not in the video.';
  const r = await withRetry(() => call('gemini', 'You are an accurate OCR, transcription and note-taking engine.', prompt, { parts }));
  if (r.text.trim().length < 20) throw new Error('لم أستطع استخراج محتوى كافٍ.');
  return r.text.trim();
}
