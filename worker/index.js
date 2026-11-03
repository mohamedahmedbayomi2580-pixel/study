// Cloudflare Worker (مجاني): يخفي مفتاح Google Gemini ويمرّر طلبات التطبيق إلى Google.
// يدعم: رد عادي، بث مباشر (stream)، والبحث في Google (search).
const buckets = new Map();

export default {
  async fetch(req, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return reply({ ok: true, service: 'study.ai proxy' });

    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    const now = Date.now(); const b = buckets.get(ip);
    if (!b || now - b.t > 600000) buckets.set(ip, { n: 1, t: now });
    else if (++b.n > 40) return reply({ error: 'طلبات كثيرة، حاول بعد قليل.' }, 429);

    let body; try { body = await req.json(); } catch { return reply({ error: 'طلب غير صالح' }, 400); }
    const system = String(body.system || '').slice(0, 20000);
    const user = String(body.user || '');
    if (!user || user.length > 200000) return reply({ error: 'النص فارغ أو طويل جدًا' }, 400);
    if (!env.GEMINI_API_KEY) return reply({ error: 'السيرفر غير مضبوط: GEMINI_API_KEY مفقود' }, 500);

    const model = env.GEMINI_MODEL || 'gemini-flash-latest';
    const stream = body.stream === true;
    // وسائط اختيارية (صورة/صوت inline أو رابط يوتيوب فقط)
    const media = [];
    if (Array.isArray(body.parts)) for (const p of body.parts.slice(0, 2)) {
      if (p?.inlineData?.data && typeof p.inlineData.mimeType === 'string' && p.inlineData.data.length < 14000000) media.push({ inlineData: { mimeType: p.inlineData.mimeType, data: p.inlineData.data } });
      else if (typeof p?.fileData?.fileUri === 'string' && /^https:\/\/(www\.youtube\.com\/watch\?v=|youtu\.be\/)/.test(p.fileData.fileUri)) media.push({ fileData: { fileUri: p.fileData.fileUri } });
    }
    const payload = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [...media, { text: user }] }] };
    if (body.search === true) payload.tools = [{ google_search: {} }];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(payload) });

    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      const msg = r.status === 429 ? 'وصلنا للحد المجاني من Google حاليًا، جرّب بعد قليل.'
        : r.status === 404 ? 'اسم نموذج Google غير متاح، حدّث GEMINI_MODEL في الـ Worker.'
        : `خطأ من Google (${r.status}): ${d?.error?.message || ''}`;
      return reply({ error: msg }, r.status === 429 ? 429 : 502);
    }
    if (stream) return new Response(r.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...cors } });

    const d = await r.json().catch(() => ({}));
    const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text) return reply({ error: 'لم يصل رد من Google (قد يكون المحتوى محجوبًا).' }, 502);
    const sources = (d.candidates?.[0]?.groundingMetadata?.groundingChunks || []).filter(c => c.web?.uri).map(c => ({ uri: c.web.uri, title: c.web.title || c.web.uri }));
    return reply({ text, sources, inTok: d.usageMetadata?.promptTokenCount || 0, outTok: d.usageMetadata?.candidatesTokenCount || 0 });
  }
};
