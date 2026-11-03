// كل مزود = كائن واحد يطبّق Provider. لإضافة مزود جديد: أضف كائنًا في الأسفل فقط.
export interface Result { text: string; inTok: number; outTok: number; }
export interface Provider {
  id: string; name: string; model: string; enabled: boolean;
  priceIn: number; priceOut: number; // $ per 1M tokens
  complete(system: string, user: string): Promise<Result>;
}
const env = (k: string, d = '') => process.env[k] || d;
const price = (id: string, dir: 'IN' | 'OUT') => Number(env(`PRICE_${id.toUpperCase()}_${dir}`, '0'));

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${data?.error?.message || data?.error || r.statusText}`);
  return data;
}

function openaiLike(id: string, name: string, baseUrl: string, key: string, model: string): Provider {
  return {
    id, name, model, enabled: !!key && !!model && !!baseUrl, priceIn: price(id, 'IN'), priceOut: price(id, 'OUT'),
    async complete(system, user) {
      const d = await post(`${baseUrl}/chat/completions`, { Authorization: `Bearer ${key}` },
        { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
      return { text: d.choices?.[0]?.message?.content || '', inTok: d.usage?.prompt_tokens || 0, outTok: d.usage?.completion_tokens || 0 };
    }
  };
}

const gemini: Provider = {
  id: 'gemini', name: 'Google Gemini', model: env('GEMINI_MODEL', 'gemini-flash-latest'), enabled: !!env('GEMINI_API_KEY'),
  priceIn: price('gemini', 'IN'), priceOut: price('gemini', 'OUT'),
  async complete(system, user) {
    const d = await post(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      { 'x-goog-api-key': env('GEMINI_API_KEY') },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] });
    const text = (d.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
    return { text, inTok: d.usageMetadata?.promptTokenCount || 0, outTok: d.usageMetadata?.candidatesTokenCount || 0 };
  }
};

const anthropic: Provider = {
  id: 'anthropic', name: 'Anthropic Claude', model: env('ANTHROPIC_MODEL', 'claude-sonnet-4-5'), enabled: !!env('ANTHROPIC_API_KEY'),
  priceIn: price('anthropic', 'IN'), priceOut: price('anthropic', 'OUT'),
  async complete(system, user) {
    const d = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
      { model: this.model, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] });
    const text = (d.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return { text, inTok: d.usage?.input_tokens || 0, outTok: d.usage?.output_tokens || 0 };
  }
};

export const providers: Provider[] = [
  openaiLike('openai', 'OpenAI GPT', 'https://api.openai.com/v1', env('OPENAI_API_KEY'), env('OPENAI_MODEL', 'gpt-4o-mini')),
  gemini,
  anthropic,
  openaiLike(env('COMPAT_NAME', 'custom').toLowerCase(), env('COMPAT_NAME', 'custom'), env('COMPAT_BASE_URL').replace(/\/$/, ''), env('COMPAT_API_KEY', 'none'), env('COMPAT_MODEL'))
];
