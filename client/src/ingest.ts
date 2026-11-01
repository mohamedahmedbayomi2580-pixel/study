// استخراج النص من الملفات على الجهاز نفسه (بدون رفع لأي سيرفر).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-ignore
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerUrl;
const MAX_BYTES = 25 * 1024 * 1024;

export async function ingestFile(f: File): Promise<{ name: string; text: string }> {
  if (f.size > MAX_BYTES) throw new Error('الملف أكبر من 25MB');
  const ext = (f.name.split('.').pop() || '').toLowerCase();
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
  } else if (ext === 'txt') text = new TextDecoder('utf-8').decode(buf);
  else throw new Error('نوع غير مدعوم حاليًا. المدعوم: PDF, DOCX, TXT');
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 20) throw new Error('لم أستطع استخراج نص (الملف قد يكون مصورًا ويحتاج OCR، وهو غير متاح بعد).');
  return { name: f.name, text };
}

export async function ingestUrl(u: string): Promise<{ name: string; text: string }> {
  let url: URL; try { url = new URL(u); } catch { throw new Error('رابط غير صالح'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('رابط غير مسموح');
  let html = '';
  try { const r = await fetch(url.href); if (!r.ok) throw new Error(String(r.status)); html = (await r.text()).slice(0, 2_000_000); }
  catch { throw new Error('تعذر فتح الرابط (بعض المواقع تمنع القراءة من التطبيق). جرّب نسخ النص في ملف TXT.'); }
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 50) throw new Error('لا يوجد نص كافٍ في الصفحة.');
  return { name: url.hostname + url.pathname, text };
}
