// استخراج النص من الملفات على الجهاز نفسه. الصور والصوت ويوتيوب تُستخرج عبر Gemini (رسميًا) وتحتاج موافقتك على الإرسال إلى Google.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-ignore
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import JSZip from 'jszip';
import { extractFromMedia } from './ai';

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_BYTES = 25 * 1024 * 1024;
const IMG: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const AUD: Record<string, string> = { mp3: 'audio/mp3', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' };
const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('تعذر قراءة الملف')); r.readAsDataURL(f); });

export async function ingestFile(f: File): Promise<{ name: string; text: string }> {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (IMG[ext]) {
    if (f.size > 8 * 1024 * 1024) throw new Error('الصورة أكبر من 8MB');
    return { name: f.name, text: await extractFromMedia('image', { mime: f.type || IMG[ext], data: await toB64(f) }) };
  }
  if (AUD[ext]) {
    if (f.size > 12 * 1024 * 1024) throw new Error('ملف الصوت أكبر من 12MB (حوالي 12 دقيقة MP3). قسّم المحاضرة إلى أجزاء.');
    return { name: f.name, text: await extractFromMedia('audio', { mime: f.type || AUD[ext], data: await toB64(f) }) };
  }
  if (f.size > MAX_BYTES) throw new Error('الملف أكبر من 25MB');
  const buf = await f.arrayBuffer();
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0, 4)));
  let text = '';
  if (ext === 'pdf') {
    if (!head.startsWith('%PDF')) throw new Error('الملف ليس PDF صالحًا');
    const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(buf) }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i); const tc = await page.getTextContent();
      text += `\n[[p.${i}]]\n` + tc.items.map((it: any) => it.str).join(' ');
    }
  } else if (ext === 'docx') {
    if (!head.startsWith('PK')) throw new Error('الملف ليس DOCX صالحًا');
    text = (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  } else if (ext === 'pptx') {
    if (!head.startsWith('PK')) throw new Error('الملف ليس PPTX صالحًا');
    const zip = await JSZip.loadAsync(buf);
    const num = (n: string) => Number((n.match(/slide(\d+)\.xml$/) || [])[1] || 0);
    const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    for (const n of names) {
      const xml = await zip.files[n].async('string');
      const paras = xml.split('</a:p>').map(p => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => dec(m[1])).join('')).filter(Boolean);
      text += `\n[[p.${num(n)}]]\n` + paras.join('\n');
    }
  } else if (ext === 'txt') text = new TextDecoder('utf-8').decode(buf);
  else throw new Error('نوع غير مدعوم. المدعوم: PDF, DOCX, PPTX, TXT, JPG/PNG/WEBP, MP3/WAV/AAC/OGG/FLAC');
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 20) throw new Error('لم أستطع استخراج نص (الملف قد يكون مصورًا؛ جرّب رفع صفحاته كصور).');
  return { name: f.name, text };
}

function youtubeUrl(url: URL): string | null {
  const h = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let id = '';
  if (h === 'youtu.be') id = url.pathname.slice(1);
  else if (h === 'youtube.com') id = url.searchParams.get('v') || (url.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/) || [])[1] || '';
  return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

export async function ingestUrl(u: string): Promise<{ name: string; text: string }> {
  let url: URL; try { url = new URL(u); } catch { throw new Error('رابط غير صالح'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('رابط غير مسموح');
  const yt = youtubeUrl(url);
  if (yt) return { name: 'YouTube: ' + yt.split('v=')[1], text: await extractFromMedia('youtube', { url: yt }) };
  let html = '';
  try { const r = await fetch(url.href); if (!r.ok) throw new Error(String(r.status)); html = (await r.text()).slice(0, 2_000_000); }
  catch { throw new Error('تعذر فتح الرابط (بعض المواقع تمنع القراءة من التطبيق). جرّب نسخ النص في ملف TXT.'); }
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 50) throw new Error('لا يوجد نص كافٍ في الصفحة.');
  return { name: url.hostname + url.pathname, text };
}
