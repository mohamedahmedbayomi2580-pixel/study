import { useEffect, useRef, useState } from 'react';
import * as L from 'lucide-react';
import type { Ctx } from './ctx';
import { chatApi, generate, planRequest, refine, researchApi } from './api';
import { availableProviders, getUsage, PId, PIDS, PNAMES, resetUsage, testProvider } from './ai';
const stamp = (m: string) => `${new Date().toLocaleTimeString()} · ${m}`;
import { topChunks } from './retrieve';
import { Chat, Output } from './types';
import { uid } from './db';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
const openLink = (u: string) => (Capacitor.isNativePlatform() ? Browser.open({ url: u }) : window.open(u, '_blank'));

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
          <div className="muted text-xs mb-4">PDF · DOCX · PPTX · TXT · JPG/PNG · MP3/WAV · YouTube</div>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="btn btn-pri" onClick={ctx.pickFile}><L.Upload size={16} />{t('رفع ملف', 'Upload')}</button>
            <button className="btn" onClick={() => setShowUrl(!showUrl)}><L.Link size={16} />{t('لصق رابط', 'Paste link')}</button>
            <button className="btn" onClick={ctx.pickFile}><L.FolderPlus size={16} />{t('إنشاء مشروع دراسي', 'New project')}</button>
            <button className="btn" onClick={() => go('request')}><L.Wand2 size={16} />{t('اطلب ما تريد', 'Ask & plan')}</button>
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
  mindmap: ['الخرائط الذهنية', 'Mind Maps', L.BrainCircuit], plan: ['خطة المذاكرة', 'Study Plan', L.CalendarDays], videos: ['الشرح المرئي بالصوت', 'Narrated lessons', L.PlayCircle]
};
const STYLES: Record<string, string> = {
  masri: 'Explain in Egyptian Arabic dialect (اللهجة المصرية) mixed naturally with English technical terms, like a friendly university professor.',
  fusha: 'Explain in formal Modern Standard Arabic (الفصحى).',
  simple: 'Explain in very simple words for a complete beginner, with everyday examples.'
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
  const [style, setStyle] = useState('masri');
  const [avail, setAvail] = useState<PId[]>([]);
  const [prov, setProv] = useState('auto');
  const [verify, setVerify] = useState(false);
  useEffect(() => { availableProviders().then(setAvail); }, [settings.geminiKey, settings.openaiKey, settings.anthropicKey, settings.serverUrl]);
  const [tt, ti, Icon] = TITLES[kind];
  const mat = materials.find(m => m.id === sel) || materials[0];
  const list = outputs.filter(o => o.kind === kind && o.materialId === mat?.id);
  useEffect(() => { setView(list[0] || null); setInfo(null); setErr(''); }, [kind, mat?.id]);

  async function run() {
    if (!mat) return;
    setBusy(true); setErr('');
    try {
      const r = await generate({ kind, text: mat.text, mode: settings.mode, lang, provider: prov === 'auto' ? undefined : (prov as PId), verify, extra: kind === 'plan' ? 'Days available: ' + days : kind === 'explain' ? STYLES[style] : undefined });
      const o: Output = { id: uid(), materialId: mat.id, kind, content: r.content, fav: false, createdAt: Date.now() };
      setOutputs([o, ...outputs]); setView(o); setInfo(r); ctx.notify(t('تم إنشاء: ', 'Generated: ') + t(tt, ti));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }
  const [refText, setRefText] = useState('');
  async function doRefine(instr?: string) {
    const ins = (instr ?? refText).trim(); if (!ins || !mat || !view) return;
    setBusy(true); setErr('');
    try {
      const r = await refine({ kind, text: mat.text, current: view.content, instruction: ins, lang, provider: prov === 'auto' ? undefined : (prov as PId) });
      const n = { ...view, content: r.content }; setOutputs(outputs.map(x => (x.id === view.id ? n : x))); setView(n); setRefText('');
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
            {avail.length > 1 && (
              <>
                <select className="field !w-auto" value={prov} onChange={e => setProv(e.target.value)}>
                  <option value="auto">{t('النموذج: تلقائي', 'Model: auto')}</option>
                  {avail.map(p => <option key={p} value={p}>{PNAMES[p]}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={verify} onChange={e => setVerify(e.target.checked)} />{t('مراجعة بنموذج ثانٍ', 'Verify with a 2nd model')}</label>
              </>
            )}
            {kind === 'explain' && (
              <select className="field !w-auto" value={style} onChange={e => setStyle(e.target.value)}>
                <option value="masri">{t('باللهجة المصرية', 'Egyptian dialect')}</option><option value="fusha">{t('بالفصحى', 'Formal Arabic')}</option><option value="simple">{t('مبسّط للمبتدئين', 'Beginner-simple')}</option>
              </select>
            )}
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
          {view && kind !== 'plan' && (
            <Card className="flex flex-col gap-3">
              <div className="text-sm font-semibold">{t('اطلب تعديلًا من الذكاء الاصطناعي', 'Ask the AI to modify this')}</div>
              <div className="flex gap-2 flex-wrap">
                <input className="field flex-1 min-w-[200px]" value={refText} onChange={e => setRefText(e.target.value)}
                  placeholder={kind === 'flashcards' ? t('مثال: زوّد 10 بطاقات عن الفصل الثاني', 'e.g. add 10 cards about chapter 2') : t('مثال: بسّط أكثر / زوّد أسئلة أصعب', 'e.g. simplify / add harder questions')}
                  onKeyDown={e => e.key === 'Enter' && doRefine()} />
                <button className="btn btn-pri" disabled={busy || !refText.trim()} onClick={() => doRefine()}>{busy ? <L.Loader size={16} className="animate-spin" /> : <L.Wand2 size={16} />}{t('نفّذ', 'Apply')}</button>
              </div>
              {(kind === 'flashcards' || kind === 'quiz') && (
                <div><button className="btn !py-1.5 text-sm" disabled={busy} onClick={() => doRefine(kind === 'flashcards' ? 'Add 10 more NEW flashcards covering other parts of the material.' : 'Add 5 more NEW questions covering other parts of the material.')}><L.Plus size={14} />{kind === 'flashcards' ? t('زوّد 10 بطاقات', 'Add 10 cards') : t('زوّد 5 أسئلة', 'Add 5 questions')}</button></div>
              )}
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
  if (kind === 'videos') { const a = parseJson(content); if (a) return <VideoPlayer scenes={a} ctx={ctx} />; }
  if (kind === 'mindmap') { const a = parseJson(content); if (a && a[0]) return <MindMap root={a[0]} ctx={ctx} />; }
  return <div className="whitespace-pre-wrap leading-8 text-[15px]">{content}</div>;
}

function VideoPlayer({ scenes, ctx }: { scenes: any[]; ctx: Ctx }) {
  const { t, lang } = ctx;
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hasVoice, setHasVoice] = useState(true);
  const playRef = useRef(false);
  const pick = () => {
    const vs = window.speechSynthesis.getVoices(); const pre = lang === 'ar' ? 'ar' : 'en';
    return vs.find(v => v.lang.toLowerCase().startsWith(pre + '-eg')) || vs.find(v => v.lang.toLowerCase().startsWith(pre)) || null;
  };
  useEffect(() => {
    if (!supported) return;
    const chk = () => setHasVoice(!!pick());
    chk(); window.speechSynthesis.addEventListener('voiceschanged', chk);
    return () => { window.speechSynthesis.removeEventListener('voiceschanged', chk); window.speechSynthesis.cancel(); };
  }, []);
  const speak = (idx: number) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(scenes[idx]?.narration || ''));
    const v = pick(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
    u.onend = () => { if (!playRef.current) return; if (idx + 1 < scenes.length) { setI(idx + 1); speak(idx + 1); } else { playRef.current = false; setPlaying(false); } };
    window.speechSynthesis.speak(u);
  };
  const toggle = () => { if (playing) { playRef.current = false; setPlaying(false); window.speechSynthesis.cancel(); } else { playRef.current = true; setPlaying(true); speak(i); } };
  const goTo = (n: number) => { const k = Math.max(0, Math.min(scenes.length - 1, n)); setI(k); if (playRef.current) speak(k); else window.speechSynthesis?.cancel(); };
  const sc = scenes[i] || {};
  return (
    <div className="flex flex-col gap-3">
      <div className="muted text-xs">{t('شرح مرئي بالصوت: شرائح يقرؤها صوت الجهاز. هذا ليس فيديو مولّدًا بالذكاء الاصطناعي ولا يُصدَّر كملف MP4.', 'Narrated slides read by your device voice. Not an AI-generated video and cannot be exported as MP4.')}</div>
      {!supported && <div className="text-red-500 text-sm">{t('هذا الجهاز لا يدعم القراءة الصوتية.', 'This device does not support speech.')}</div>}
      {supported && !hasVoice && <div className="text-amber-500 text-sm">{t('لم أجد صوتًا للغة المطلوبة على جهازك؛ ثبّت حزمة الصوت العربي من إعدادات النظام.', 'No voice found for this language on your device.')}</div>}
      <div className="neu-in p-6 min-h-[220px] flex flex-col gap-3">
        <div className="text-xl font-bold text-pri">{i + 1}/{scenes.length} · {sc.title}</div>
        <ul className="list-disc ps-5 leading-8">{(sc.bullets || []).map((b: string, k: number) => <li key={k}>{b}</li>)}</ul>
        <div className="mt-auto muted text-sm leading-7 border-t pt-3" style={{ borderColor: 'var(--sh1)' }}>{sc.narration}</div>
      </div>
      <div className="flex gap-3 justify-center">
        <button className="btn" onClick={() => goTo(i - 1)} disabled={i === 0}><L.SkipForward size={16} className="rtl:rotate-0 ltr:rotate-180" /></button>
        <button className="btn btn-pri" onClick={toggle} disabled={!supported}>{playing ? <L.Pause size={16} /> : <L.Play size={16} />}{playing ? t('إيقاف', 'Pause') : t('تشغيل', 'Play')}</button>
        <button className="btn" onClick={() => goTo(i + 1)} disabled={i >= scenes.length - 1}><L.SkipBack size={16} className="rtl:rotate-0 ltr:rotate-180" /></button>
      </div>
    </div>
  );
}
function MapNode({ n, depth }: { n: any; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const kids: any[] = Array.isArray(n.children) ? n.children : [];
  return (
    <div className="ms-5 ps-3 my-1.5 border-s-2" style={{ borderColor: 'var(--sh1)' }}>
      <button onClick={() => setOpen(!open)} className={`px-3 py-1.5 rounded-xl text-sm text-start ${depth === 0 ? 'btn-pri font-bold' : depth === 1 ? 'neu-sm font-semibold text-pri' : 'neu-sm'}`}>
        {kids.length > 0 && <span className="me-1 opacity-60">{open ? '−' : '+'}</span>}{n.title}
      </button>
      {open && kids.map((k, i) => <MapNode key={i} n={k} depth={depth + 1} />)}
    </div>
  );
}
function MindMap({ root, ctx }: { root: any; ctx: Ctx }) {
  const [z, setZ] = useState(1);
  return (
    <div>
      <div className="flex gap-2 mb-3"><button className="btn !p-2" onClick={() => setZ(Math.min(1.6, z + 0.15))}><L.ZoomIn size={16} /></button>
        <button className="btn !p-2" onClick={() => setZ(Math.max(0.6, z - 0.15))}><L.ZoomOut size={16} /></button>
        <span className="muted text-xs self-center">{ctx.t('اضغط على أي فرع لفتحه أو طيّه', 'Tap a branch to expand/collapse')}</span></div>
      <div className="overflow-auto neu-in p-4"><div style={{ transform: `scale(${z})`, transformOrigin: 'top right', width: 'max-content', minWidth: '100%' }}><MapNode n={root} depth={0} /></div></div>
    </div>
  );
}
function Flashcards({ cards, ctx }: { cards: any[]; ctx: Ctx }) {
  const { t } = ctx;
  const [queue, setQueue] = useState(cards.map((_, i) => i));
  const [flip, setFlip] = useState(false);
  const [done, setDone] = useState(0);
  useEffect(() => { setQueue(cards.map((_, i) => i)); setFlip(false); setDone(0); }, [cards.length]);
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
  const [q, setQ] = useState('');
  const shown = chats
    .filter(c => !q.trim() || c.title.toLowerCase().includes(q.toLowerCase()) || c.messages.some(m => m.content.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  return (
    <div className="max-w-3xl mx-auto">
      <Title icon={L.MessageSquare}>{t('المحادثات', 'Chats')}</Title>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button className="btn btn-pri" onClick={() => { const c: Chat = { id: uid(), materialId: ctx.sel || materials[0]?.id, title: t('محادثة جديدة', 'New chat'), messages: [], updatedAt: Date.now() }; setChats([c, ...chats]); ctx.setOpenChat(c.id); }}><L.Plus size={16} />{t('محادثة جديدة', 'New chat')}</button>
        <input className="field flex-1 min-w-[180px]" placeholder={t('ابحث في المحادثات…', 'Search chats…')} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {shown.length === 0 && <Card className="muted">{t('لا توجد محادثات.', 'No chats found.')}</Card>}
      <div className="flex flex-col gap-3">
        {shown.map(c => (
          <Card key={c.id} className="flex items-center gap-3">
            <button className="flex-1 text-start min-w-0" onClick={() => { ctx.setOpenChat(c.id); go('chats'); }}>
              <div className="font-semibold truncate">{c.pinned && <L.Pin size={14} className="inline text-pri me-1" />}{c.title}</div><div className="muted text-xs">{c.messages.length} {t('رسالة', 'msgs')} · {ago(c.updatedAt)}</div></button>
            <button className="btn !p-2" title={t('تثبيت', 'Pin')} onClick={() => setChats(chats.map(x => (x.id === c.id ? { ...x, pinned: !x.pinned } : x)))}><L.Pin size={16} className={c.pinned ? 'text-pri' : ''} /></button>
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
  const [web, setWeb] = useState(false);
  const [model, setModel] = useState('auto');
  const [avail, setAvail] = useState<PId[]>([]);
  useEffect(() => { availableProviders().then(setAvail); }, [ctx.settings.geminiKey, ctx.settings.openaiKey, ctx.settings.anthropicKey, ctx.settings.serverUrl]);
  const [live, setLive] = useState('');
  const liveRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat?.messages.length, busy, live]);
  if (!chat) return null;
  const mat = materials.find(m => m.id === chat.materialId);
  const update = (c: Chat) => setChats(chats.map(x => (x.id === c.id ? c : x)));

  async function send(q: string, baseChat?: Chat) {
    const base = baseChat || chat!;
    if (!q.trim() || busy) return;
    setErr(''); setBusy(true); setText(''); liveRef.current = '';
    const ac = new AbortController(); abortRef.current = ac;
    let c: Chat = { ...base, title: base.messages.length ? base.title : q.slice(0, 40), messages: [...base.messages, { role: 'user', content: q }], updatedAt: Date.now() };
    update(c);
    try {
      const context = mat ? topChunks(mat.text, q + ' ' + base.messages.slice(-2).map(m => m.content).join(' ')) : '';
      const r = await chatApi({ question: q, context, history: c.messages.slice(-8, -1), lang, search: web, provider: model, signal: ac.signal, onDelta: tx => { liveRef.current = tx; setLive(tx); } });
      c = { ...c, messages: [...c.messages, { role: 'assistant', content: r.answer, sources: r.sources }], updatedAt: Date.now() };
      update(c);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        if (liveRef.current) { c = { ...c, messages: [...c.messages, { role: 'assistant', content: liveRef.current + ' ⏹' }], updatedAt: Date.now() }; update(c); }
      } else setErr(e.message);
    }
    setLive(''); setBusy(false); abortRef.current = null;
  }
  const regen = () => {
    const idx = chat.messages.map(m => m.role).lastIndexOf('user'); if (idx < 0 || busy) return;
    send(chat.messages[idx].content, { ...chat, messages: chat.messages.slice(0, idx) });
  };
  const lastAnswer = [...chat.messages].reverse().find(m => m.role === 'assistant');
  return (
    <div className="max-w-3xl mx-auto h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className="btn !p-2" onClick={() => ctx.setOpenChat('')}><L.ArrowRight size={16} className="rtl:rotate-0 ltr:rotate-180" /></button>
        <div className="font-bold truncate flex-1">{chat.title}</div>
        <button className="btn !p-2" title={t('نسخ المحادثة كلها', 'Copy whole chat')} onClick={() => { copy(chat.messages.map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n\n')); ctx.notify(t('تم نسخ المحادثة', 'Chat copied')); }}><L.ClipboardCopy size={16} /></button>
        {avail.length > 1 && (
          <select className="field !w-auto max-w-[30%]" value={model} onChange={e => setModel(e.target.value)} title={t('النموذج', 'Model')}>
            <option value="auto">{t('تلقائي', 'Auto')}</option>{avail.map(p => <option key={p} value={p}>{PNAMES[p]}</option>)}
          </select>
        )}
        <select className="field !w-auto max-w-[40%]" value={chat.materialId || ''} onChange={e => update({ ...chat, materialId: e.target.value })}>
          <option value="">{t('بدون مادة', 'No material')}</option>
          {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto scroll flex flex-col gap-3 pe-1 min-h-[300px]">
        {chat.messages.length === 0 && <div className="muted text-center mt-10">{t('اسأل عن أي جزء في المادة، أو فعّل 🌐 للبحث في Google.', 'Ask about the material, or enable 🌐 to search Google.')}</div>}
        {chat.messages.map((m, i) => (
          <div key={i} className={`max-w-[88%] p-4 whitespace-pre-wrap leading-7 ${m.role === 'user' ? 'neu-in self-end' : 'neu self-start'}`}>
            {m.content}
            {m.sources && m.sources.length > 0 && (
              <div className="mt-3 flex flex-col gap-1 text-xs"><div className="muted">{t('المصادر (Google):', 'Sources (Google):')}</div>
                {m.sources.slice(0, 5).map((sc, k) => <button key={k} onClick={() => openLink(sc.uri)} className="text-start text-pri truncate underline">{sc.title}</button>)}</div>
            )}
            {m.role === 'assistant' && (
              <div className="flex gap-2 mt-3 flex-wrap">
                <button className="btn !py-1 !px-2 text-xs" onClick={() => copy(m.content)}><L.Copy size={12} />{t('نسخ', 'Copy')}</button>
                <button className="btn !py-1 !px-2 text-xs" onClick={() => { setOutputs([{ id: uid(), materialId: chat.materialId || '', kind: 'chat', content: m.content, fav: true, createdAt: Date.now() }, ...outputs]); ctx.notify(t('تم الحفظ في المفضلة', 'Saved to favorites')); }}><L.Bookmark size={12} />{t('حفظ', 'Save')}</button>
                {i === chat.messages.length - 1 && !busy && <button className="btn !py-1 !px-2 text-xs" onClick={regen}><L.RefreshCw size={12} />{t('إجابة أخرى', 'Regenerate')}</button>}
              </div>
            )}
          </div>
        ))}
        {busy && live && <div className="neu self-start p-4 whitespace-pre-wrap leading-7 max-w-[88%]">{live}</div>}
        {busy && !live && <div className="neu self-start p-4 flex items-center gap-2"><L.Loader className="animate-spin text-pri" size={18} />{web && <span className="muted text-xs">{t('أبحث في Google…', 'Searching Google…')}</span>}</div>}
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
        <button className={`btn !p-2.5 ${web ? 'active text-pri' : ''}`} onClick={() => setWeb(!web)} title={t('البحث في Google', 'Search Google')}><L.Globe size={18} /></button>
        <input className="field" value={text} placeholder={t('اكتب سؤالك…', 'Type your question…')} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(text)} />
        {busy
          ? <button className="btn text-red-500" onClick={() => abortRef.current?.abort()} title={t('إيقاف التوليد', 'Stop')}><L.Square size={16} /></button>
          : <button className="btn btn-pri" disabled={!text.trim()} onClick={() => send(text)}><L.Send size={16} className="rtl:-scale-x-100" /></button>}
      </div>
    </div>
  );
}

/* ---------------- Request: plan before execute ---------------- */
const KIND_LABEL: Record<string, [string, string]> = {
  videos: ['درس صوتي مرئي', 'Narrated lesson'], summary: ['ملخص', 'Summary'], explain: ['شرح', 'Explanation'], quiz: ['أسئلة MCQ', 'Quiz'],
  flashcards: ['بطاقات', 'Flashcards'], mindmap: ['خريطة ذهنية', 'Mind map'], plan: ['خطة مذاكرة', 'Study plan']
};
type Row = { key: string; label: string; state: 'run' | 'done' | 'err'; ms?: number; error?: string };

export function RequestPage({ ctx }: { ctx: Ctx }) {
  const { t, materials, outputs, setOutputs, lang, go, setSel } = ctx;
  const [req, setReq] = useState('');
  const [matId, setMatId] = useState(ctx.sel || materials[0]?.id || '');
  const [plan, setPlan] = useState<any>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [doSearch, setDoSearch] = useState(false);
  const [extra, setExtra] = useState('');
  const [models, setModels] = useState<Record<string, string>>({});
  const [verify, setVerify] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'planning' | 'ready' | 'running' | 'done'>('idle');
  const [rows, setRows] = useState<Row[]>([]);
  const [res, setRes] = useState<{ text: string; sources: { uri: string; title: string }[] } | null>(null);
  const [err, setErr] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const mat = materials.find(m => m.id === matId);

  async function analyze() {
    if (!req.trim()) return;
    setErr(''); setPhase('planning'); setRes(null); setRows([]); setLog([stamp(t('تحليل الطلب…', 'Analyzing request…'))]);
    try {
      const p = await planRequest({ request: req, materials: materials.map(m => m.name), lang });
      setLog(l => [...l, stamp(t('الخطة جاهزة: ', 'Plan ready: ') + p.tasks.map((x: any) => `${x.kind}→${PNAMES[x.model as PId]}`).join(', '))]);
      setPlan(p); setModels(Object.fromEntries(p.tasks.map((x: any) => [x.kind, x.model]))); setVerify(false); setPicked(p.tasks.map((x: any) => x.kind)); setDoSearch(p.needsSearch); setPhase('ready');
    } catch (e: any) { setErr(e.message); setPhase('idle'); }
  }
  async function execute(only?: string[]) {
    if (picked.length && !mat) { setErr(t('اختر مادة أولاً.', 'Pick a material first.')); return; }
    if (!picked.length && !doSearch) { setErr(t('اختر مهمة واحدة على الأقل.', 'Pick at least one task.')); return; }
    setErr(''); setPhase('running');
    const all = [...picked.map(k => ({ key: k, label: t(KIND_LABEL[k][0], KIND_LABEL[k][1]) })), ...(doSearch ? [{ key: 'research', label: t('بحث في Google', 'Google search') }] : [])];
    const list = only ? all.filter(x => only.includes(x.key)) : all;
    if (only) setRows(r => r.map(x => (only.includes(x.key) ? { ...x, state: 'run' as const, error: undefined } : x)));
    else { setRes(null); setLog([]); setRows(list.map(x => ({ ...x, state: 'run' as const }))); }
    const addLog = (m: string) => setLog(l => [...l, stamp(m)]);
    const patch = (key: string, p: Partial<Row>) => setRows(r => r.map(x => (x.key === key ? { ...x, ...p } : x)));
    const created: Output[] = [];
    await Promise.all(list.map(async x => {
      const t0 = Date.now();
      addLog(t('بدء: ', 'Start: ') + x.label + (x.key === 'research' ? ' → Google Search' : ` → ${PNAMES[models[x.key] as PId] || ''}`));
      try {
        if (x.key === 'research') {
          const r = await researchApi({ query: plan?.searchQuery || req, lang });
          setRes(r); created.push({ id: uid(), materialId: mat?.id || '', kind: 'research', content: r.text, fav: true, createdAt: Date.now(), meta: { sources: r.sources } });
        } else {
          const ex = [x.key === 'plan' ? 'Days available: 7.' : '', extra.trim(), 'Student request: ' + req.slice(0, 300)].filter(Boolean).join(' ');
          const r = await generate({ kind: x.key, text: mat!.text, mode: 'fast', lang, extra: ex, provider: models[x.key] as PId, verify });
          r.providers.forEach(rp => addLog(`${x.label}: ${PNAMES[rp.id]} · ${rp.role} · ${rp.ok ? 'OK' : 'ERR ' + rp.error} · ${(rp.ms / 1000).toFixed(1)}s`));
          created.push({ id: uid(), materialId: mat!.id, kind: x.key, content: r.content, fav: false, createdAt: Date.now() });
        }
        patch(x.key, { state: 'done', ms: Date.now() - t0 });
        addLog(`${x.label}: ✔ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (e: any) { patch(x.key, { state: 'err', error: e.message }); addLog(`${x.label}: ✖ ${e.message}`); }
    }));
    setOutputs([...created, ...outputs]); setPhase('done');
    ctx.notify(t('اكتمل تنفيذ الطلب', 'Request completed'));
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <Title icon={L.Wand2}>{t('اطلب ما تريد', 'Ask & plan')}</Title>
      <Card className="flex flex-col gap-3">
        <textarea className="field min-h-[110px]" value={req} onChange={e => setReq(e.target.value)}
          placeholder={t('اكتب طلبك بحرية، مثال: اشرح لي الملف بالتفصيل واعمل أسئلة اختيار من متعدد ولخّص أهم النقاط', 'Write freely, e.g. explain the file in detail, make MCQs and summarize the key points')} />
        <div className="flex gap-2 flex-wrap items-center">
          <select className="field !w-auto flex-1 min-w-[200px]" value={matId} onChange={e => setMatId(e.target.value)}>
            <option value="">{t('بدون مادة (بحث فقط)', 'No material (search only)')}</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="btn btn-pri" disabled={!req.trim() || phase === 'planning' || phase === 'running'} onClick={analyze}>
            {phase === 'planning' ? <L.Loader size={16} className="animate-spin" /> : <L.ListChecks size={16} />}{t('حلّل طلبي واعرض الخطة', 'Analyze & show plan')}</button>
        </div>
        <div className="muted text-xs">{t('هذه الخطوة ترسل إلى مزود الذكاء الاصطناعي نص طلبك وأسماء ملفاتك فقط، ولا يُرسل محتوى أي ملف قبل أن تضغط «ابدأ التنفيذ».', 'This step sends only your request text and file names to the AI provider. No file content is sent until you press “Start”.')}</div>
      </Card>
      {err && <Card className="text-red-500 text-sm">{err}</Card>}

      {plan && (phase === 'ready' || phase === 'running' || phase === 'done') && (
        <Card className="flex flex-col gap-4 fade">
          <div className="font-bold flex items-center gap-2"><L.ClipboardList size={18} className="text-pri" />{t('خطة التنفيذ', 'Execution plan')}</div>
          <div><div className="text-xs muted">{t('فهم المطلوب', 'Understanding')}</div><div className="leading-7">{plan.understanding}</div></div>
          <div><div className="text-xs muted">{t('المصادر', 'Sources')}</div><div className="leading-7">{plan.sources}</div></div>
          <div>
            <div className="text-xs muted mb-1">{t('الأدوات (يمكنك إلغاء أي واحدة)', 'Tools (untick any)')}</div>
            <div className="flex flex-col gap-2">
              {plan.tasks.map((x: any) => (
                <label key={x.kind} className="neu-in p-3 flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1" disabled={phase === 'running'} checked={picked.includes(x.kind)} onChange={e => setPicked(e.target.checked ? [...picked, x.kind] : picked.filter(k => k !== x.kind))} />
                  <div className="flex-1"><div className="font-semibold">{t(KIND_LABEL[x.kind][0], KIND_LABEL[x.kind][1])}</div><div className="muted text-sm">{x.why}</div></div>
                  {plan.available.length > 1 && (
                    <select className="field !w-auto !py-1 text-xs" disabled={phase === 'running'} value={models[x.kind] || ''} onChange={e => setModels({ ...models, [x.kind]: e.target.value })}>
                      {plan.available.map((pp: PId) => <option key={pp} value={pp}>{PNAMES[pp]}</option>)}
                    </select>
                  )}
                </label>
              ))}
              {plan.available.length > 1 && (
                <label className="neu-in p-3 flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-1" disabled={phase === 'running'} checked={verify} onChange={e => setVerify(e.target.checked)} />
                  <div><div className="font-semibold">{t('مراجعة بنموذج ثانٍ', 'Verify with a second model')}</div><div className="muted text-sm">{t('نموذج مختلف يراجع الشرح والملخص ويحذف ما لا يسنده المصدر.', 'A different model reviews text outputs against the source.')}</div></div>
                </label>
              )}
              <label className="neu-in p-3 flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1" disabled={phase === 'running'} checked={doSearch} onChange={e => setDoSearch(e.target.checked)} />
                <div><div className="font-semibold">{t('بحث في Google', 'Google search')}</div><div className="muted text-sm">{plan.searchQuery || t('يبحث عن معلومات حديثة ومصادر', 'Looks up current info and sources')}</div></div>
              </label>
            </div>
          </div>
          {plan.media && <div><div className="text-xs muted">{t('صور / فيديو / مستندات', 'Images / video / documents')}</div><div className="leading-7 text-sm">{plan.media}</div></div>}
          {plan.tips.length > 0 && (
            <div><div className="text-xs muted mb-1">{t('نصائح الدكتور', 'Professor tips')}</div>
              <ul className="list-disc ps-5 leading-7 text-sm">{plan.tips.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
          )}
          <input className="field" disabled={phase === 'running'} value={extra} onChange={e => setExtra(e.target.value)} placeholder={t('تعليمات إضافية (اختياري)، مثال: ركّز على الفصل 3', 'Extra instructions (optional)')} />
          <button className="btn btn-pri justify-center" disabled={phase === 'running'} onClick={() => execute()}>
            {phase === 'running' ? <L.Loader size={16} className="animate-spin" /> : <L.Play size={16} />}{t('ابدأ التنفيذ', 'Start')}</button>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="flex flex-col gap-2 fade">
          <div className="font-bold mb-1">{t('حالة التنفيذ', 'Progress')}</div>
          {rows.map(r => (
            <div key={r.key} className="flex items-center gap-3">
              {r.state === 'run' ? <L.Loader size={18} className="animate-spin text-pri" /> : r.state === 'done' ? <L.CircleCheck size={18} className="text-sec" /> : <L.CircleX size={18} className="text-red-500" />}
              <span className="flex-1">{r.label}</span>
              {r.ms && <span className="muted text-xs">{(r.ms / 1000).toFixed(1)}s</span>}
              {r.state === 'done' && r.key !== 'research' && <button className="btn !py-1 !px-2 text-xs" onClick={() => { if (mat) setSel(mat.id); go(r.key); }}>{t('فتح', 'Open')}</button>}
              {r.error && <span className="text-red-500 text-xs">{r.error}</span>}
            </div>
          ))}
          {phase === 'done' && rows.some(r => r.state === 'err') && (
            <button className="btn mt-2 self-start" onClick={() => execute(rows.filter(r => r.state === 'err').map(r => r.key))}><L.RefreshCw size={16} />{t('أعد المحاولة للمهام الفاشلة', 'Retry failed tasks')}</button>
          )}
        </Card>
      )}

      {log.length > 0 && (
        <details className="neu p-4 text-xs"><summary className="cursor-pointer font-semibold">{t('سجل خطوات التنفيذ', 'Execution log')}</summary>
          <div className="mt-2 flex flex-col gap-1 muted" dir="ltr">{log.map((l, i) => <div key={i}>{l}</div>)}</div></details>
      )}
      {res && (
        <Card className="fade">
          <div className="font-bold mb-2 flex items-center gap-2"><L.Globe size={18} className="text-pri" />{t('نتيجة البحث', 'Search result')}</div>
          <div className="whitespace-pre-wrap leading-8 text-[15px]">{res.text}</div>
          {res.sources.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 text-xs"><div className="muted">{t('المصادر (Google):', 'Sources (Google):')}</div>
              {res.sources.slice(0, 8).map((sc, k) => <button key={k} onClick={() => openLink(sc.uri)} className="text-start text-pri truncate underline">{sc.title}</button>)}</div>
          )}
        </Card>
      )}
    </div>
  );
}

/* ---------------- Browser & sites (manual, user-controlled) ---------------- */
const SITES: [string, string][] = [['ChatGPT', 'https://chatgpt.com'], ['Google Gemini', 'https://gemini.google.com'], ['Claude', 'https://claude.ai'], ['Google AI Studio', 'https://aistudio.google.com']];
export function BrowserPage({ ctx }: { ctx: Ctx }) {
  const { t, outputs, setOutputs, chats, setChats } = ctx;
  const [target, setTarget] = useState('');
  const [last, setLast] = useState('');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [reply, setReply] = useState('');
  const open = (name: string, url: string) => {
    if (!confirm(t(`سيتم فتح ${name} في متصفح جهازك ونسخ طلبك. لن يُرسل أي شيء تلقائيًا، وأنت من يسجّل الدخول ويلصق الطلب. متابعة؟`, `This opens ${name} in your device browser and copies your prompt. Nothing is sent automatically; you sign in and paste it yourself. Continue?`))) return;
    if (prompt.trim()) copy(prompt);
    setLast(name); openLink(url);
  };
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <Title icon={L.Globe}>{t('المتصفح والمواقع', 'Browser & Sites')}</Title>
      <Card className="flex flex-col gap-3">
        <div className="text-sm leading-7 muted">{t('افتح أي موقع ذكاء اصطناعي بإذنك في متصفح جهازك (الذي تختاره أنت)، سجّل الدخول بحسابك، والصق طلبك، ثم انسخ الرد وارجع لتحفظه هنا. لا يقرأ التطبيق صفحات هذه المواقع تلقائيًا لأن ذلك يخالف شروطها، ولا يخزّن أي كلمة مرور.', 'Open any AI site in your own browser with your permission, sign in yourself, paste your prompt, then copy the reply back here. The app never reads those pages automatically (against their terms) and never stores passwords.')}</div>
        <textarea className="field min-h-[90px]" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={t('اكتب الطلب الذي تريد نسخه…', 'Write the prompt to copy…')} />
        <div className="flex gap-2 flex-wrap">{SITES.map(([n, u]) => <button key={n} className="btn" onClick={() => open(n, u)}><L.ExternalLink size={16} />{n}</button>)}</div>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="font-semibold">{t('احفظ الرد الذي نسخته', 'Save the reply you copied')}</div>
        <input className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('عنوان (اختياري)', 'Title (optional)')} />
        <textarea className="field min-h-[120px]" value={reply} onChange={e => setReply(e.target.value)} placeholder={t('الصق الرد هنا', 'Paste the reply here')} />
        <select className="field" value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">{t('احفظه كملاحظة في المفضلة', 'Save as a note in favorites')}</option>
          {chats.map(c => <option key={c.id} value={c.id}>{t('أضفه إلى محادثة: ', 'Add to chat: ')}{c.title}</option>)}
        </select>
        <button className="btn btn-pri self-start" disabled={!reply.trim()} onClick={() => {
          if (target) { setChats(chats.map(c => (c.id === target ? { ...c, messages: [...c.messages, { role: 'assistant' as const, content: (last ? `(${last}) ` : '') + reply }], updatedAt: Date.now() } : c))); setReply(''); ctx.notify(t('أُضيف الرد إلى المحادثة', 'Reply added to chat')); return; }
          setOutputs([{ id: uid(), materialId: '', kind: 'note', content: (title ? title + '\n\n' : '') + reply, fav: true, createdAt: Date.now() }, ...outputs]); setReply(''); setTitle(''); ctx.notify(t('تم حفظ الرد في المفضلة', 'Reply saved to favorites')); }}><L.Save size={16} />{t('حفظ في المفضلة', 'Save to favorites')}</button>
      </Card>
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
  const [res, setRes] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<Record<string, { calls: number; inTok: number; outTok: number }>>({});
  useEffect(() => { getUsage().then(setUsage); }, []);
  const test = async (p: PId) => { setRes(r => ({ ...r, [p]: '…' })); try { await testProvider(p); setRes(r => ({ ...r, [p]: 'ok' })); } catch (e: any) { setRes(r => ({ ...r, [p]: e.message })); } };
  const keyOf: Record<PId, 'geminiKey' | 'openaiKey' | 'anthropicKey'> = { gemini: 'geminiKey', openai: 'openaiKey', anthropic: 'anthropicKey' };
  const links: Record<PId, string> = { gemini: 'https://aistudio.google.com/apikey', openai: 'https://platform.openai.com/api-keys', anthropic: 'https://console.anthropic.com/settings/keys' };
  const note: Record<PId, [string, string]> = {
    gemini: ['مجاني. الأفضل للبداية.', 'Free. Best to start.'],
    openai: ['اختياري. الـ API مدفوع ويحتاج رصيدًا (اشتراك الشات لا يكفي).', 'Optional. The API is paid and needs credit (a chat subscription is not enough).'],
    anthropic: ['اختياري. الـ API مدفوع ويحتاج رصيدًا (اشتراك الشات لا يكفي).', 'Optional. The API is paid and needs credit (a chat subscription is not enough).']
  };
  const kinds = ['chat', 'summary', 'explain', 'quiz', 'flashcards', 'mindmap', 'plan', 'videos'];
  const labels: Record<string, [string, string]> = { chat: ['المحادثة', 'Chat'], summary: ['الملخصات', 'Summaries'], explain: ['الشرح', 'Explain'], quiz: ['الأسئلة', 'Quiz'], flashcards: ['البطاقات', 'Flashcards'], mindmap: ['الخرائط', 'Mind maps'], plan: ['الخطة', 'Plan'], videos: ['الشرح المرئي', 'Narrated'] };
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <Title icon={L.Settings}>{t('الإعدادات', 'Settings')}</Title>
      <Card className="flex flex-col gap-3">
        <div className="font-semibold flex items-center gap-2"><L.Cpu size={18} className="text-pri" />{t('نماذج الذكاء الاصطناعي (Study AI Engine)', 'AI models (Study AI Engine)')}</div>
        {PIDS.map(p => (
          <div key={p} className="neu-in p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap"><b className="flex-1">{PNAMES[p]}</b>
              <button className="btn !py-1.5 text-xs" onClick={() => openLink(links[p])}><L.ExternalLink size={14} />{t('احصل على مفتاح', 'Get a key')}</button></div>
            <div className="muted text-xs">{t(note[p][0], note[p][1])}</div>
            <input dir="ltr" type="password" className="field" placeholder="API key" value={settings[keyOf[p]] || ''} onChange={e => setSettings({ ...settings, [keyOf[p]]: e.target.value.trim() })} />
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <button className="btn !py-1.5 text-xs" onClick={() => test(p)}><L.PlugZap size={14} />{t('اختبار', 'Test')}</button>
              {res[p] === 'ok' && <span className="text-sec flex items-center gap-1"><L.CircleCheck size={14} />{t('يعمل', 'Works')}</span>}
              {res[p] === '…' && <L.Loader size={14} className="animate-spin" />}
              {res[p] && res[p] !== 'ok' && res[p] !== '…' && <span className="text-red-500 text-xs break-all">{res[p]}</span>}
            </div>
          </div>
        ))}
        <div className="muted text-xs">{t('المفاتيح تُحفظ على جهازك فقط وتُرسل للمزود نفسه. للاستخدام الشخصي: لا توزّع التطبيق وبه مفاتيحك.', 'Keys are stored on your device only and sent to the provider itself. Personal use: do not distribute the app with your keys.')}</div>
        <details className="text-sm"><summary className="cursor-pointer muted">{t('إعدادات متقدمة (للمطوّر)', 'Advanced (developer)')}</summary>
          <label className="block mt-2 mb-1">{t('عنوان وسيط Google (بدل مفتاح Gemini، للتوزيع على الطلبة)', 'Google proxy URL (instead of a Gemini key, for students)')}</label>
          <input dir="ltr" className="field" placeholder="https://study-ai-proxy.xxxx.workers.dev" value={settings.serverUrl.includes('localhost') ? '' : settings.serverUrl}
            onChange={e => setSettings({ ...settings, serverUrl: e.target.value.trim() || 'http://localhost:8787' })} />
          <label className="block mt-2 mb-1">{t('اسم نموذج ChatGPT', 'ChatGPT model name')}</label>
          <input dir="ltr" className="field" placeholder="gpt-4o-mini" value={settings.openaiModel || ''} onChange={e => setSettings({ ...settings, openaiModel: e.target.value.trim() })} />
          <label className="block mt-2 mb-1">{t('اسم نموذج Claude', 'Claude model name')}</label>
          <input dir="ltr" className="field" placeholder="claude-sonnet-4-5" value={settings.anthropicModel || ''} onChange={e => setSettings({ ...settings, anthropicModel: e.target.value.trim() })} />
        </details>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="font-semibold">{t('النموذج الافتراضي لكل نوع مهمة', 'Default model per task type')}</div>
        <div className="muted text-xs">{t('«تلقائي» = Gemini (المجاني) أولًا. يظهر الاختيار الفعلي بين النماذج حين تضيف أكثر من مفتاح.', '“Auto” = free Gemini first. Real choice appears once you add more than one key.')}</div>
        <div className="grid grid-cols-2 gap-2">
          {kinds.map(k => (
            <label key={k} className="flex items-center gap-2 text-sm"><span className="flex-1">{t(labels[k][0], labels[k][1])}</span>
              <select className="field !w-auto !py-1 text-xs" value={settings.taskModel?.[k] || 'auto'} onChange={e => setSettings({ ...settings, taskModel: { ...(settings.taskModel || {}), [k]: e.target.value } })}>
                <option value="auto">{t('تلقائي', 'Auto')}</option>{PIDS.map(p => <option key={p} value={p}>{PNAMES[p]}</option>)}
              </select></label>
          ))}
        </div>
      </Card>
      <Card className="flex flex-col gap-2">
        <div className="font-semibold flex items-center gap-2"><L.Gauge size={18} className="text-pri" />{t('استهلاك كل نموذج (على هذا الجهاز)', 'Usage per model (this device)')}</div>
        {Object.keys(usage).length === 0 ? <div className="muted text-sm">{t('لا يوجد استهلاك مسجّل بعد.', 'No usage recorded yet.')}</div> :
          PIDS.filter(p => usage[p]).map(p => <div key={p} className="flex items-center gap-2 text-sm"><b className="flex-1">{PNAMES[p]}</b><span className="muted">{usage[p].calls} {t('طلب', 'calls')} · {usage[p].inTok.toLocaleString()} + {usage[p].outTok.toLocaleString()} tok</span></div>)}
        <div className="muted text-xs">{t('الأرقام توكنات (Tokens) وليست مبالغ؛ السعر الفعلي يظهر في لوحة حساب كل مزود.', 'Numbers are tokens, not money; see each provider dashboard for the real cost.')}</div>
        <button className="btn !py-1.5 text-xs self-start" onClick={() => { resetUsage(); setUsage({}); }}><L.RotateCcw size={14} />{t('تصفير', 'Reset')}</button>
      </Card>
      <Card><div className="text-sm muted">{t('بياناتك (المواد والمحادثات والنتائج) محفوظة على جهازك. نص المادة يُرسل للمزود الذي تختاره عند الطلب فقط.', 'Your data is stored on your device. Material text is sent to the provider you choose only on request.')}</div>
        <button className="btn mt-3 text-red-500" onClick={() => { if (confirm(t('مسح كل البيانات المحلية؟', 'Erase all local data?'))) { ctx.setMaterials([]); ctx.setChats([]); ctx.setOutputs([]); } }}><L.Trash2 size={16} />{t('مسح كل البيانات', 'Erase all data')}</button>
        <button className="btn mt-3 ms-2" onClick={() => setSettings({ ...settings, consented: false })}><L.ShieldOff size={16} />{t('سحب الموافقة', 'Withdraw consent')}</button></Card>
    </div>
  );
}
export function HelpPage({ ctx }: { ctx: Ctx }) {
  const { t } = ctx;
  return (
    <div className="max-w-2xl mx-auto"><Title icon={L.CircleHelp}>{t('المساعدة', 'Help')}</Title>
      <Card className="leading-8">
        <ol className="list-decimal ps-5">
          <li>{t('تأكد من اتصال الإنترنت ووافق على استخدام Google عند أول تشغيل.', 'Make sure you are online and accepted the Google consent.')}</li>
          <li>{t('ارفع ملف PDF أو DOCX أو TXT من الرئيسية.', 'Upload a PDF, DOCX or TXT from Home.')}</li>
          <li>{t('افتح الملخصات أو الشرح أو الأسئلة أو البطاقات واضغط إنشاء.', 'Open Summaries/Explanations/Quizzes/Flashcards and press Generate.')}</li>
          <li>{t('اسأل المادة مباشرة من صفحة المحادثات.', 'Ask your material directly in Chats.')}</li>
        </ol>
        <div className="muted text-sm mt-3">study.ai — {t('تطوير محمد أحمد، طالب حاسبات وذكاء اصطناعي – بنها', 'by Mohamed Ahmed, Computers & AI student – Benha')}</div>
      </Card></div>
  );
}
