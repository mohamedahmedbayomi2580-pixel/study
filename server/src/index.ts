import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mammoth from 'mammoth';
// @ts-ignore: استيراد مباشر لتجنب ملف الاختبار الافتراضي في pdf-parse
import pdf from 'pdf-parse/lib/pdf-parse.js';
import dns from 'node:dns/promises';
import net from 'node:net';
import { providers } from './providers.js';
import { chat, generate, KINDS } from './engine.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// حماية بسيطة برمز + حد معدل لكل IP
const hits = new Map<string, { n: number; t: number }>();
app.use('/api', (req, res, next) => {
  const token = process.env.APP_TOKEN;
  if (token && req.header('x-app-token') !== token) return res.status(401).json({ error: 'رمز الوصول غير صحيح' });
  const ip = req.ip || 'x'; const now = Date.now(); const h = hits.get(ip);
  if (!h || now - h.t > 60_000) hits.set(ip, { n: 1, t: now });
  else if (++h.n > 60) return res.status(429).json({ error: 'طلبات كثيرة، حاول بعد دقيقة' });
  next();
});

app.get('/api/providers', (_req, res) =>
  res.json({ providers: providers.map(p => ({ id: p.id, name: p.name, model: p.model, enabled: p.enabled })) }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const wrap = (fn: express.RequestHandler): express.RequestHandler => (q, s, n) => Promise.resolve(fn(q, s, n)).catch(e => s.status(500).json({ error: e.message || 'خطأ' }));

app.post('/api/ingest', upload.single('file'), wrap(async (req, res) => {
  const f = req.file; if (!f) return res.status(400).json({ error: 'لا يوجد ملف' });
  const ext = f.originalname.toLowerCase().split('.').pop() || '';
  const head = f.buffer.subarray(0, 4).toString('latin1');
  let text = '';
  if (ext === 'pdf') {
    if (!head.startsWith('%PDF')) return res.status(400).json({ error: 'الملف ليس PDF صالحًا' });
    const data = await pdf(f.buffer, {
      pagerender: async (p: any) => { const tc = await p.getTextContent(); return `\n[[p.${p.pageNumber}]]\n` + tc.items.map((i: any) => i.str).join(' '); }
    });
    text = data.text;
  } else if (ext === 'docx') {
    if (!head.startsWith('PK')) return res.status(400).json({ error: 'الملف ليس DOCX صالحًا' });
    text = (await mammoth.extractRawText({ buffer: f.buffer })).value;
  } else if (ext === 'txt') text = f.buffer.toString('utf8');
  else return res.status(415).json({ error: 'نوع غير مدعوم حاليًا. المدعوم: PDF, DOCX, TXT (الصور/OCR والصوت في مرحلة لاحقة)' });
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 20) return res.status(422).json({ error: 'لم أستطع استخراج نص من الملف (قد يكون مصورًا ويحتاج OCR).' });
  res.json({ name: f.originalname, text });
}));

async function safeUrl(u: string) { // منع SSRF: لا عناوين داخلية
  const url = new URL(u); if (!/^https?:$/.test(url.protocol)) throw new Error('رابط غير مسموح');
  const addrs = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true });
  for (const a of addrs) if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i.test(a.address)) throw new Error('رابط غير مسموح');
  return url;
}
app.post('/api/ingest-url', wrap(async (req, res) => {
  const url = await safeUrl(String(req.body.url || ''));
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!r.ok) return res.status(400).json({ error: 'تعذر فتح الرابط: ' + r.status });
  const html = (await r.text()).slice(0, 2_000_000);
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 50) return res.status(422).json({ error: 'لا يوجد نص كافٍ في الصفحة (روابط يوتيوب غير مدعومة حاليًا).' });
  res.json({ name: url.hostname + url.pathname, text });
}));

app.post('/api/generate', wrap(async (req, res) => {
  const { kind, text, mode, lang, extra } = req.body || {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'نوع غير مدعوم' });
  if (typeof text !== 'string' || text.length < 20) return res.status(400).json({ error: 'نص المادة مفقود' });
  res.json(await generate(kind, text, mode === 'full' ? 'full' : 'fast', lang === 'en' ? 'en' : 'ar', extra ? `Days available: ${String(extra).slice(0, 3)}` : ''));
}));

app.post('/api/chat', wrap(async (req, res) => {
  const { question, context, history, lang } = req.body || {};
  if (!question) return res.status(400).json({ error: 'السؤال مفقود' });
  res.json(await chat(String(question).slice(0, 4000), String(context || '').slice(0, 30000), Array.isArray(history) ? history.slice(-8) : [], lang === 'en' ? 'en' : 'ar'));
}));

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`study.ai server on :${port} — providers: ${providers.filter(p => p.enabled).map(p => p.id).join(', ') || 'NONE (add API keys)'}`));
