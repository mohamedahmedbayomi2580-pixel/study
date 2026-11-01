import { useEffect, useRef, useState } from 'react';
import * as L from 'lucide-react';
import type { Ctx } from './ctx';
import { chatApi, generate } from './api';
import { KeyManager } from './keys';
import { topChunks } from './retrieve';
import { Chat, Output } from './types';
import { uid } from './db';

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`neu p-5 ${className}`}>{children}</div>;
const Title = ({ icon: I, children }: { icon: L.LucideIcon; children: React.ReactNode }) => (
  <h2 className="text-xl font-bold flex items-center gap-2 mb-4"><I size={22} className="text-pri" />{children}</h2>
);
const ago = (ts: number) => new Date(ts).toLocaleString();
const copy = (s: string) => navigator.clipboard?.writeText(s);

/* ---------------- Home ---------------- */
export function HomePage({ ctx }: { ctx: Ctx }) {
  const { t, materials, outputs, go, setSel } = ctx;
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const quizzes = outputs.filter(o => o.kind === 'quiz');
  const sums = outputs.filter(o => o.kind === 'summary');
  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t('أهلاً بك 👋', 'Welcome 👋')}</h1>
        <p className="muted">{t('ارفع مادتك مرة واحدة واحصل على ملخصات وشرح وأسئلة وبطاقات.', 'Upload once and get summaries, explanations, quizzes and flashcards.')}</p>
      </div>
      <Card>
        <h3 className="font-bold text-lg mb-3">{t('ماذا تريد أن تتعلم اليوم؟', 'What do you want to learn today?')}</h3>
        <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) ctx.addFromFile(f); }}
          className={`neu-in p-8 text-center border-2 border-dashed ${drag ? 'border-pri' : 'border-transparent'}`}>
          <L.CloudUpload size={40} className="mx-auto text-pri mb-2" />
          <div className="mb-1">{t('اسحب الملف هنا وأفلته', 'Drag & drop your file here')}</div>
          <div className="muted text-xs mb-4">PDF · DOCX · TXT</div>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="btn btn-pri" onClick={ctx.pickFile}><L.Upload size={16} />{t('رفع ملف', 'Upload')}</button>
            <button className="btn" onClick={() => setShowUrl(!showUrl)}><L.Link size={16} />{t('لصق رابط', 'Paste link')}</button>
            <button className="btn" onClick={ctx.pickFile}><L.FolderPlus size={16} />{t('إنشاء مشروع دراسي', 'New project')}</button>
          </div>
          {showUrl && (
            <div className="flex gap-2 mt-4 fade">
              <input dir="ltr" className="field" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
              <button className="btn btn-pri" disabled={!/^https?:\/\//.test(url)} onClick={() => { ctx.addFromUrl(url); setUrl(''); setShowUrl(false); }}>{t('إضافة', 'Add')}</button>
            </div>
          )}
        </div>
      </Card>
      <div className="grid md:grid-cols-3 gap-4">
        {[[t('المواد', 'Materials'), materials.length, L.Library], [t('الملخصات', 'Summaries'), sums.length, L.FileText], [t('الاختبارات', 'Quizzes'), quizzes.length, L.ClipboardCheck]].map(([l, n, I]: any) => (
          <Card key={l} className="flex items-center gap-4"><div className="neu-in p-3"><I size={22} className="text-sec" /></div><div><div className="text-2xl font-bold">{n}</div><div className="muted text-sm">{l}</div></div></Card>
        ))}
      </div>
      <Card>
        <Title icon={L.Clock}>{t('آخر المواد', 'Recent materials')}</Title>
        {materials.length === 0 ? <div className="muted">{t('لم ترفع أي مادة بعد.', 'No materials yet.')}</div> :
          materials.slice(0, 5).map(m => (
            <button key={m.id} onClick={() => { setSel(m.id); go('summary'); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:neu-in text-start">
              <L.FileText size={18} className="text-pri" /><span className="flex-1 truncate">{m.name}</span><span className="muted text-xs">{ago(m.createdAt)}</span>
            </button>
          ))}
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><Title icon={L.FileText}>{t('آخر الملخصات', 'Latest summaries')}</Title>
          {sums.length === 0 ? <div className="muted">—</div> : sums.slice(0, 3).map(o => <div key={o.id} className="py-1 truncate">{ctx.materials.find(m => m.id === o.materialId)?.name} · <span className="muted text-xs">{ago(o.createdAt)}</span></div>)}</Card>
        <Card><Title icon={L.ClipboardCheck}>{t('آخر الاختبارات', 'Latest quizzes')}</Title>
          {quizzes.length === 0 ? <div className="muted">—</div> : quizzes.slice(0, 3).map(o => <div key={o.id} className="py-1 truncate">{ctx.materials.find(m => m.id === o.materialId)?.name} · <span className="muted text-xs">{ago(o.createdAt)}</span></div>)}</Card>
      </div>
    </div>
  );
}

/* ---------------- Library ---------------- */
export function LibraryPage({ ctx }: { ctx: Ctx }) {
  const { t, materials, setMaterials, sel, setSel, go } = ctx;
  return (
    <div className="max-w-4xl mx-auto">
      <Title icon={L.Library}>{t('مكتبتي', 'My Library')}</Title>
      {materials.length === 0 && <Card className="muted">{t('المكتبة فارغة. ارفع مادة من الرئيسية.', 'Empty. Upload from Home.')}</Card>}
      <div className="flex flex-col gap-3">
        {materials.map(m => (
          <Card key={m.id} className={`flex items-center gap-3 flex-wrap ${sel === m.id ? 'ring-2 ring-pri/50' : ''}`}>
            <L.FileText className="text-pri" />
            <div className="flex-1 min-w-[160px]"><div className="font-semibold truncate">{m.name}</div><div className="muted text-xs">{ago(m.createdAt)} · {m.text.length.toLocaleString()} {t('حرف', 'chars')}</div></div>
            <button className="btn !py-2" onClick={() => { setSel(m.id); go('summary'); }}><L.Sparkles size={16} />{t('تحليل', 'Analyze')}</button>
            <button className="btn !py-2" onClick={() => { setSel(m.id); const c: Chat = { id: uid(), materialId: m.id, title: m.name, messages: [], updatedAt: Date.now() }; ctx.setChats([c, ...ctx.chats]); ctx.setOpenChat(c.id); go('chats'); }}><L.MessageSquare size={16} />{t('محادثة', 'Chat')}</button>
            <button className="btn !py-2 text-red-500" onClick={() => { if (confirm(t('حذف المادة؟', 'Delete material?'))) setMaterials(materials.filter(x => x.id !== m.id)); }}><L.Trash2 size={16} /></button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Tool pages (summary, explain, quiz, flashcards, mindmap, plan) ---------------- */
const TITLES: Record<string, [string, string, L.LucideIcon]> = {
  summary: ['الملخصات', 'Summaries', L.FileText], explain: ['الشروحات', 'Explanations', L.BookOpen],
  quiz: ['الأسئلة والاختبارات', 'Quizzes', L.ClipboardCheck], flashcards: ['البطاقات التعليمية', 'Flashcards', L.Layers],
  mindmap: ['الخرائط الذهنية', 'Mind Maps', L.BrainCircuit], plan: ['خطة المذاكرة', 'Study Plan', L.CalendarDays]
};
function parseJson(s: string): any[] | null {
  const m = s.match(/\[[\s\S]*\]/); if (!m) return null;
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : null; } catch { return null; }
}

export function ToolPage({ ctx, kind }: { ctx: Ctx; kind: string }) {
  const { t, materials, sel, setSel, outputs, setOutputs, settings, lang } = ctx;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [days, setDays] = useState('7');
  const [view, setView] = useState<Output | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [tt, ti, Icon] = TITLES[kind];
  const mat = materials.find(m => m.id === sel) || materials[0];
  const list = outputs.filter(o => o.kind === kind && o.materialId === mat?.id);
  useEffect(() => { setView(list[0] || null); setInfo(null); setErr(''); }, [kind, mat?.id]);

  async function run() {
    if (!mat) return;
    setBusy(true); setErr('');
    try {
      const r = await generate({ kind, text: mat.text, mode: settings.mode, lang, extra: kind === 'plan' ? days : undefined });
      const o: Output = { id: uid(), materialId: mat.id, kind, content: r.content, fav: false, createdAt: Date.now() };
      setOutputs([o, ...outputs]); setView(o); setInfo(r); ctx.notify(t('تم إنشاء: ', 'Generated: ') + t(tt, ti));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  const toggleFav = (o: Output) => { const n = { ...o, fav: !o.fav }; setOutputs(outputs.map(x => (x.id === o.id ? n : x))); setView(n); };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-4">
      <Title icon={Icon}>{t(tt, ti)}</Title>
      {!mat ? <Card className="muted">{t('ارفع مادة أولاً من الصفحة الرئيسية.', 'Upload a material first.')}</Card> : (
        <>
          <Card className="flex flex-wrap gap-3 items-center">
            <select className="field !w-auto flex-1 min-w-[200px]" value={mat.id} onChange={e => setSel(e.target.value)}>
              {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {kind === 'plan' && <label className="flex items-center gap-2 text-sm">{t('عدد الأيام', 'Days')}<input className="field !w-20" type="number" min={1} max={90} value={days} onChange={e => setDays(e.target.value)} /></label>}
            <button className="btn btn-pri" disabled={busy} onClick={run}>{busy ? <L.Loader size={16} className="animate-spin" /> : <L.Sparkles size={16} />}{busy ? t('جاري الإنشاء…', 'Generating…') : t('إنشاء', 'Generate')}</button>
          </Card>
          {err && <Card className="text-red-500 text-sm">{err}</Card>}
          {info && (
            <Card className="text-xs">
              <div className="font-semibold mb-2">{t('حالة النماذج', 'Model status')}</div>
              {info.providers.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 py-0.5">
                  {p.ok ? <L.CircleCheck size={14} className="text-sec" /> : <L.CircleX size={14} className="text-red-500" />}
                  <span className="font-medium">{p.id}</span><span className="muted">{p.role}</span>
                  <span className="muted">{p.ms}ms</span>{p.ok ? <span className="muted">{p.inTok + p.outTok} tok</span> : <span className="text-red-500 truncate">{p.error}</span>}
                </div>
              ))}
            </Card>
          )}
          {view && (
            <Card>
              <div className="flex gap-2 mb-3 flex-wrap">
                <button className="btn !py-1.5 text-sm" onClick={() => copy(view.content)}><L.Copy size={14} />{t('نسخ', 'Copy')}</button>
                <button className="btn !py-1.5 text-sm" onClick={() => toggleFav(view)}><L.Bookmark size={14} className={view.fav ? 'fill-pri text-pri' : ''} />{t('مفضلة', 'Favorite')}</button>
                <button className="btn !py-1.5 text-sm" onClick={() => window.print()}><L.Printer size={14} />{t('طباعة', 'Print')}</button>
              </div>
              <Renderer kind={kind} content={view.content} ctx={ctx} />
            </Card>
          )}
          {list.length > 1 && (
            <div className="muted text-sm flex flex-wrap gap-2 items-center">{t('نتائج سابقة:', 'Previous:')}
              {list.map(o => <button key={o.id} className={`btn !py-1 text-xs ${view?.id === o.id ? 'active' : ''}`} onClick={() => setView(o)}>{ago(o.createdAt)}</button>)}</div>
          )}
        </>
      )}
    </div>
  );
}

function Renderer({ kind, content, ctx }: { kind: string; content: string; ctx: Ctx }) {
  if (kind === 'flashcards') { const a = parseJson(content); if (a) return <Flashcards cards={a} ctx={ctx} />; }
  if (kind === 'quiz') { const a = parseJson(content); if (a) return <Quiz items={a} ctx={ctx} />; }
  return <div className="whitespace-pre-wrap leading-8 text-[15px]">{content}</div>;
}

function Flashcards({ cards, ctx }: { cards: any[]; ctx: Ctx }) {
  const { t } = ctx;
  const [queue, setQueue] = useState(cards.map((_, i) => i));
  const [flip, setFlip] = useState(false);
  const [done, setDone] = useState(0);
  useEffect(() => { setQueue(cards.map((_, i) => i)); setFlip(false); setDone(0); }, [cards]);
  if (queue.length === 0) return <div className="text-center py-8"><L.PartyPopper className="mx-auto text-sec mb-2" size={36} />{t('أنهيت كل البطاقات!', 'All cards done!')}<div><button className="btn mt-3 mx-auto" onClick={() => { setQueue(cards.map((_, i) => i)); setDone(0); }}>{t('إعادة', 'Restart')}</button></div></div>;
  const c = cards[queue[0]];
  const next = (hard: boolean) => { setFlip(false); setTimeout(() => { const [h, ...r] = queue; setQueue(hard ? [...r, h] : r); if (!hard) setDone(d => d + 1); }, 150); };
  return (
    <div>
      <div className="muted text-sm mb-2">{done}/{cards.length}</div>
      <div className="flip h-56 cursor-pointer" onClick={() => setFlip(!flip)}>
        <div className={`flip-inner h-full ${flip ? 'on' : ''}`}>
          <div className="face neu-in text-lg font-semibold">{c.front}</div>
          <div className="face back neu-in text-pri">{c.back}</div>
        </div>
      </div>
      <div className="flex gap-3 justify-center mt-4">
        <button className="btn" onClick={() => setFlip(!flip)}><L.RotateCw size={16} />{t('قلب', 'Flip')}</button>
        <button className="btn text-red-500" onClick={() => next(true)}>{t('صعبة', 'Hard')}</button>
        <button className="btn text-sec" onClick={() => next(false)}>{t('حفظتها', 'Got it')}</button>
      </div>
    </div>
  );
}

function Quiz({ items, ctx }: { items: any[]; ctx: Ctx }) {
  const { t } = ctx;
  const [ans, setAns] = useState<Record<number, number>>({});
  const score = items.reduce((s, q, i) => s + (ans[i] === q.answer ? 1 : 0), 0);
  const all = Object.keys(ans).length === items.length;
  return (
    <div className="flex flex-col gap-5">
      {items.map((q, i) => (
        <div key={i}>
          <div className="font-semibold mb-2">{i + 1}. {q.q}</div>
          <div className="flex flex-col gap-2">
            {(q.options || []).map((o: string, j: number) => {
              const chosen = ans[i] !== undefined; const right = j === q.answer; const mine = ans[i] === j;
              return <button key={j} disabled={chosen} onClick={() => setAns({ ...ans, [i]: j })}
                className={`text-start px-4 py-2.5 rounded-xl transition ${chosen ? (right ? 'neu-in text-sec font-semibold' : mine ? 'neu-in text-red-500' : 'neu-sm opacity-60') : 'neu-sm hover:-translate-y-0.5'}`}>{o}</button>;
            })}
          </div>
          {ans[i] !== undefined && q.explanation && <div className="muted text-sm mt-2 neu-in p-3">{q.explanation}</div>}
        </div>
      ))}
      {all && <div className="neu-in p-4 text-center text-lg font-bold">{t('نتيجتك: ', 'Score: ')}{score}/{items.length}
        <div><button className="btn mt-3 mx-auto text-sm" onClick={() => setAns({})}><L.RotateCw size={14} />{t('إعادة الاختبار', 'Retake')}</button></div></div>}
    </div>
  );
}

/* ---------------- Chats ---------------- */
export function ChatsList({ ctx }: { ctx: Ctx }) {
  const { t, chats, setChats, materials, go } = ctx;
  return (
    <div className="max-w-3xl mx-auto">
      <Title icon={L.MessageSquare}>{t('المحادثات', 'Chats')}</Title>
      <button className="btn btn-pri mb-4" onClick={() => { const c: Chat = { id: uid(), materialId: ctx.sel || materials[0]?.id, title: t('محادثة جديدة', 'New chat'), messages: [], updatedAt: Date.now() }; setChats([c, ...chats]); ctx.setOpenChat(c.id); }}><L.Plus size={16} />{t('محادثة جديدة', 'New chat')}</button>
      {chats.length === 0 && <Card className="muted">{t('لا توجد محادثات.', 'No chats yet.')}</Card>}
      <div className="flex flex-col gap-3">
        {chats.map(c => (
          <Card key={c.id} className="flex items-center gap-3">
            <button className="flex-1 text-start min-w-0" onClick={() => { ctx.setOpenChat(c.id); go('chats'); }}>
              <div className="font-semibold truncate">{c.title}</div><div className="muted text-xs">{c.messages.length} {t('رسالة', 'msgs')} · {ago(c.updatedAt)}</div></button>
            <button className="btn !p-2 text-red-500" onClick={() => setChats(chats.filter(x => x.id !== c.id))}><L.Trash2 size={16} /></button>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ChatPage({ ctx }: { ctx: Ctx }) {
  const { t, chats, setChats, materials, lang, outputs, setOutputs } = ctx;
  const chat = chats.find(c => c.id === ctx.openChat);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.messages.length, busy]);
  if (!chat) return null;
  const mat = materials.find(m => m.id === chat.materialId);
  const update = (c: Chat) => setChats(chats.map(x => (x.id === c.id ? c : x)));

  async function send(q: string) {
    if (!q.trim() || busy || !chat) return;
    setErr(''); setBusy(true); setText('');
    let c: Chat = { ...chat, title: chat.messages.length ? chat.title : q.slice(0, 40), messages: [...chat.messages, { role: 'user', content: q }], updatedAt: Date.now() };
    update(c);
    try {
      const context = mat ? topChunks(mat.text, q + ' ' + (chat.messages.slice(-2).map(m => m.content).join(' '))) : '';
      const r = await chatApi({ question: q, context, history: c.messages.slice(-8, -1), lang });
      c = { ...c, messages: [...c.messages, { role: 'assistant', content: r.answer }], updatedAt: Date.now() };
      update(c);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  const lastAnswer = [...chat.messages].reverse().find(m => m.role === 'assistant');
  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className="btn !p-2" onClick={() => ctx.setOpenChat('')}><L.ArrowRight size={16} className="rtl:rotate-0 ltr:rotate-180" /></button>
        <div className="font-bold truncate flex-1">{chat.title}</div>
        <select className="field !w-auto max-w-[45%]" value={chat.materialId || ''} onChange={e => update({ ...chat, materialId: e.target.value })}>
          <option value="">{t('بدون مادة', 'No material')}</option>
          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto scroll flex flex-col gap-3 pe-1 min-h-[300px]">
        {chat.messages.length === 0 && <div className="muted text-center mt-10">{t('اسأل عن أي جزء في المادة.', 'Ask about anything in the material.')}</div>}
        {chat.messages.map((m, i) => (
          <div key={i} className={`max-w-[88%] p-4 whitespace-pre-wrap leading-7 ${m.role === 'user' ? 'neu-in self-end' : 'neu self-start'}`}>
            {m.content}
            {m.role === 'assistant' && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button className="btn !py-1 !px-2 text-xs" onClick={() => copy(m.content)}><L.Copy size={12} />{t('نسخ', 'Copy')}</button>
                <button className="btn !py-1 !px-2 text-xs" onClick={() => { setOutputs([{ id: uid(), materialId: chat.materialId || '', kind: 'chat', content: m.content, fav: true, createdAt: Date.now() }, ...outputs]); ctx.notify(t('تم الحفظ في المفضلة', 'Saved to favorites')); }}><L.Bookmark size={12} />{t('حفظ', 'Save')}</button>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="neu self-start p-4"><L.Loader className="animate-spin text-pri" size={18} /></div>}
        {err && <div className="text-red-500 text-sm">{err}</div>}
        <div ref={end} />
      </div>
      {lastAnswer && !busy && (
        <div className="flex gap-2 flex-wrap">
          {[[t('بسّطها', 'Simplify'), 'Explain your last answer in simpler words. / بسّط إجابتك الأخيرة.'], [t('نقاط', 'Bullets'), 'Rewrite your last answer as bullet points. / أعد صياغة إجابتك كنقاط.'], [t('أمثلة', 'Examples'), 'Give more examples about it. / أعطني أمثلة إضافية.']].map(([l, p]) =>
            <button key={l} className="btn !py-1.5 text-xs" onClick={() => send(p)}>{l}</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <input className="field" value={text} placeholder={t('اكتب سؤالك…', 'Type your question…')} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(text)} />
        <button className="btn btn-pri" disabled={busy || !text.trim()} onClick={() => send(text)}><L.Send size={16} className="rtl:-scale-x-100" /></button>
      </div>
    </div>
  );
}

/* ---------------- Favorites / History ---------------- */
export function FavoritesPage({ ctx }: { ctx: Ctx }) {
  const { t, outputs, setOutputs, materials } = ctx;
  const favs = outputs.filter(o => o.fav);
  return (
    <div className="max-w-3xl mx-auto"><Title icon={L.Bookmark}>{t('المفضلة', 'Favorites')}</Title>
      {favs.length === 0 && <Card className="muted">—</Card>}
      <div className="flex flex-col gap-3">{favs.map(o => (
        <Card key={o.id}>
          <div className="flex items-center gap-2 mb-2 text-sm muted"><span className="font-semibold text-pri">{o.kind}</span>{materials.find(m => m.id === o.materialId)?.name}
            <button className="ms-auto btn !p-1.5" onClick={() => setOutputs(outputs.map(x => x.id === o.id ? { ...x, fav: false } : x))}><L.X size={14} /></button></div>
          <div className="whitespace-pre-wrap line-clamp-6">{o.content}</div>
        </Card>))}</div></div>
  );
}
export function HistoryPage({ ctx }: { ctx: Ctx }) {
  const { t, outputs, chats, materials } = ctx;
  const rows = [
    ...outputs.map(o => ({ ts: o.createdAt, label: `${t('إنشاء', 'Generated')} ${o.kind}`, sub: materials.find(m => m.id === o.materialId)?.name || '' })),
    ...chats.map(c => ({ ts: c.updatedAt, label: `${t('محادثة', 'Chat')}: ${c.title}`, sub: `${c.messages.length}` })),
    ...materials.map(m => ({ ts: m.createdAt, label: `${t('رفع', 'Uploaded')}: ${m.name}`, sub: '' }))
  ].sort((a, b) => b.ts - a.ts).slice(0, 100);
  return (
    <div className="max-w-3xl mx-auto"><Title icon={L.History}>{t('سجل النشاط', 'Activity')}</Title>
      <Card>{rows.length === 0 ? <div className="muted">—</div> : rows.map((r, i) => <div key={i} className="py-2 border-b border-black/5 flex gap-3"><span className="flex-1 truncate">{r.label} <span className="muted">{r.sub}</span></span><span className="muted text-xs">{ago(r.ts)}</span></div>)}</Card></div>
  );
}

/* ---------------- Settings / Help ---------------- */
export function SettingsPage({ ctx }: { ctx: Ctx }) {
  const { t, settings, setSettings } = ctx;
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <Title icon={L.Settings}>{t('الإعدادات', 'Settings')}</Title>
      <Card className="flex flex-col gap-3">
        <div className="font-semibold">{t('مفاتيح الذكاء الاصطناعي (تعمل مباشرة من جهازك، بدون سيرفر)', 'AI keys (run directly from your device, no server)')}</div>
        <KeyManager t={t} />
      </Card>
      <Card className="flex flex-col gap-3">
        <label className="text-sm font-semibold">{t('وضع المعالجة', 'Processing mode')}</label>
        <div className="flex gap-2 flex-wrap">
          <button className={`btn ${settings.mode === 'fast' ? 'active text-pri' : ''}`} onClick={() => setSettings({ ...settings, mode: 'fast' })}><L.Zap size={16} />{t('سريع (نموذج واحد)', 'Fast (one model)')}</button>
          <button className={`btn ${settings.mode === 'full' ? 'active text-pri' : ''}`} onClick={() => setSettings({ ...settings, mode: 'full' })}><L.Layers size={16} />{t('شامل (كل النماذج + مراجعة)', 'Full (all models + review)')}</button>
        </div>
      </Card>
      <Card><div className="text-sm muted">{t('بياناتك (المواد والمحادثات والنتائج) محفوظة على جهازك فقط.', 'Your data is stored on your device only.')}</div>
        <button className="btn mt-3 text-red-500" onClick={() => { if (confirm(t('مسح كل البيانات المحلية؟', 'Erase all local data?'))) { ctx.setMaterials([]); ctx.setChats([]); ctx.setOutputs([]); } }}><L.Trash2 size={16} />{t('مسح كل البيانات', 'Erase all data')}</button></Card>
    </div>
  );
}
export function HelpPage({ ctx }: { ctx: Ctx }) {
  const { t } = ctx;
  return (
    <div className="max-w-2xl mx-auto"><Title icon={L.CircleHelp}>{t('المساعدة', 'Help')}</Title>
      <Card className="leading-8">
        <ol className="list-decimal ps-5">
          <li>{t('من الإعدادات أضف مفتاح Gemini المجاني (زر احصل على مفتاح) واضغط اختبار.', 'In Settings add a free Gemini key (Get a key) and press Test.')}</li>
          <li>{t('ارفع ملف PDF أو DOCX أو TXT من الرئيسية.', 'Upload a PDF, DOCX or TXT from Home.')}</li>
          <li>{t('افتح الملخصات أو الشرح أو الأسئلة أو البطاقات واضغط إنشاء.', 'Open Summaries/Explanations/Quizzes/Flashcards and press Generate.')}</li>
          <li>{t('اسأل المادة مباشرة من صفحة المحادثات.', 'Ask your material directly in Chats.')}</li>
        </ol>
        <div className="muted text-sm mt-3">study.ai — {t('تطوير محمد أحمد، طالب حاسبات وذكاء اصطناعي – بنها', 'by Mohamed Ahmed, Computers & AI student – Benha')}</div>
      </Card></div>
  );
}
