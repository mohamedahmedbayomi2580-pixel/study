import { useEffect, useRef, useState } from 'react';
import * as L from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { get, set, uid } from './db';
import { ingest, ingestUrl } from './api';
import { Chat, DEFAULT_SETTINGS, Material, Output, Settings } from './types';
import type { Ctx } from './ctx';
import { BrowserPage, ChatPage, ChatsList, FavoritesPage, HelpPage, HistoryPage, HomePage, LibraryPage, RequestPage, SettingsPage, ToolPage } from './pages';

interface NavItem { id: string; ar: string; en: string; icon: LucideIcon; ready: boolean; }
const NAV: NavItem[] = [
  { id: 'home', ar: 'الرئيسية', en: 'Home', icon: L.House, ready: true },
  { id: 'request', ar: 'اطلب ما تريد', en: 'Ask & Plan', icon: L.Wand2, ready: true },
  { id: 'library', ar: 'مكتبتي', en: 'My Library', icon: L.Library, ready: true },
  { id: 'chats', ar: 'المحادثات', en: 'Chats', icon: L.MessageSquare, ready: true },
  { id: 'summary', ar: 'الملخصات', en: 'Summaries', icon: L.FileText, ready: true },
  { id: 'explain', ar: 'الشروحات', en: 'Explanations', icon: L.BookOpen, ready: true },
  { id: 'quiz', ar: 'الأسئلة والاختبارات', en: 'Quizzes', icon: L.ClipboardCheck, ready: true },
  { id: 'flashcards', ar: 'البطاقات التعليمية', en: 'Flashcards', icon: L.Layers, ready: true },
  { id: 'mindmap', ar: 'الخرائط الذهنية', en: 'Mind Maps', icon: L.BrainCircuit, ready: true },
  { id: 'videos', ar: 'الشرح المرئي (فيديو صوتي)', en: 'Narrated lessons', icon: L.PlayCircle, ready: true },
  { id: 'plan', ar: 'خطة المذاكرة', en: 'Study Plan', icon: L.CalendarDays, ready: true },
  { id: 'progress', ar: 'تقدمي الدراسي', en: 'Progress', icon: L.ChartNoAxesCombined, ready: false },
  { id: 'favorites', ar: 'المفضلة', en: 'Favorites', icon: L.Bookmark, ready: true },
  { id: 'history', ar: 'سجل النشاط', en: 'Activity', icon: L.History, ready: true },
  { id: 'browser', ar: 'المتصفح والمواقع', en: 'Browser & Sites', icon: L.Globe, ready: true },
  { id: 'settings', ar: 'الإعدادات', en: 'Settings', icon: L.Settings, ready: true },
  { id: 'help', ar: 'المساعدة', en: 'Help', icon: L.CircleHelp, ready: true }
];
const TOOLS = ['summary', 'explain', 'quiz', 'flashcards', 'mindmap', 'plan', 'videos'];

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [page, setPage] = useState('home');
  const [sel, setSel] = useState('');
  const [openChat, setOpenChat] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [job, setJob] = useState<null | { name: string; steps: { label: string; state: 'wait' | 'run' | 'done' | 'err' }[]; error?: string }>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [q, setQ] = useState('');
  const [agree, setAgree] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setSettings({ ...DEFAULT_SETTINGS, ...(await get<Settings>('settings', DEFAULT_SETTINGS)) });
      setMaterials(await get<Material[]>('materials', []));
      setChats(await get<Chat[]>('chats', []));
      setOutputs(await get<Output[]>('outputs', []));
      setLoaded(true);
    })();
  }, []);
  useEffect(() => { if (loaded) set('settings', settings); }, [settings, loaded]);
  useEffect(() => { if (loaded) set('materials', materials); }, [materials, loaded]);
  useEffect(() => { if (loaded) set('chats', chats); }, [chats, loaded]);
  useEffect(() => { if (loaded) set('outputs', outputs); }, [outputs, loaded]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.dark);
    document.documentElement.dir = settings.lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = settings.lang;
  }, [settings.dark, settings.lang]);

  const lang = settings.lang;
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const notify = (m: string) => setNotes(n => [m, ...n].slice(0, 20));
  const go = (p: string) => { setPage(p); setMobileOpen(false); setQ(''); };
  const pickFile = () => fileRef.current?.click();

  const saveMaterial = (name: string, text: string) => {
    const m: Material = { id: uid(), name, text, createdAt: Date.now() };
    setMaterials([m, ...materials]); setSel(m.id); notify(t('تمت إضافة المادة: ', 'Material added: ') + name);
  };
  async function runJob(name: string, work: () => Promise<{ name?: string; text: string }>) {
    const steps: { label: string; state: 'wait' | 'run' | 'done' | 'err' }[] = [
      { label: t('استخراج النص (الصور والصوت ويوتيوب قد تستغرق وقتًا)', 'Extracting text (images, audio and YouTube may take a while)'), state: 'run' },
      { label: t('حفظ المادة على جهازك', 'Saving to your device'), state: 'wait' }
    ];
    setJob({ name, steps: [...steps] });
    try {
      const r = await work();
      steps[0].state = 'done'; steps[1].state = 'run'; setJob({ name, steps: [...steps] });
      saveMaterial(r.name || name, r.text);
      steps[1].state = 'done'; setJob({ name, steps: [...steps] });
      setTimeout(() => { setJob(null); go('library'); }, 700);
    } catch (e: any) {
      steps[0].state = 'err'; setJob({ name, steps: [...steps], error: e.message });
    }
  }
  const addFromFile = (f: File) => runJob(f.name, () => ingest(f));
  const addFromUrl = (u: string) => runJob(u, () => ingestUrl(u));

  const ctx: Ctx = { t, lang, settings, setSettings, materials, setMaterials, chats, setChats, outputs, setOutputs, sel, setSel, go, notify, pickFile, addFromFile, addFromUrl, openChat, setOpenChat };

  const results = q.trim().length > 1
    ? materials.filter(m => m.name.toLowerCase().includes(q.toLowerCase()) || m.text.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];

  if (!loaded) return <div className="h-full grid place-items-center muted">…</div>;
  const collapsed = settings.collapsed;

  const Sidebar = (
    <aside className={`neu h-full flex flex-col p-3 gap-2 m-3 transition-all ${collapsed ? 'w-[76px]' : 'w-[270px]'}`}>
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="w-10 h-10 rounded-xl grid place-items-center text-white bg-gradient-to-br from-pri to-sec shrink-0"><L.Sparkles size={20} /></div>
        {!collapsed && <span className="font-bold text-lg">study.ai</span>}
      </div>
      <button className="btn btn-pri justify-center" onClick={pickFile} title={t('مشروع جديد', 'New project')}><L.Plus size={18} />{!collapsed && t('مشروع جديد', 'New project')}</button>
      <button className="btn justify-center" onClick={pickFile} title={t('رفع مادة جديدة', 'Upload material')}><L.Upload size={18} />{!collapsed && t('رفع مادة جديدة', 'Upload material')}</button>
      <nav className="flex-1 overflow-y-auto scroll flex flex-col gap-1 py-2">
        {NAV.map(n => (
          <button key={n.id} disabled={!n.ready} onClick={() => go(n.id)} title={t(n.ar, n.en)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${page === n.id ? 'neu-in text-pri font-semibold' : 'hover:neu-sm'} ${!n.ready ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <n.icon size={19} className="shrink-0" />
            {!collapsed && <span className="flex-1 text-start">{t(n.ar, n.en)}</span>}
            {!collapsed && !n.ready && <span className="text-[10px] muted">{t('قريبًا', 'Soon')}</span>}
          </button>
        ))}
      </nav>
      <div className="neu-in p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full grid place-items-center bg-sec/20 text-sec shrink-0"><L.UserRound size={18} /></div>
        {!collapsed && (
          <div className="text-xs leading-5">
            <div className="font-semibold">{t('طالب', 'Student')}</div>
            <div className="muted">{t('حساب محلي · مجاني', 'Local · Free')}</div>
            <div className="muted">{t('المواد: ', 'Materials: ')}{materials.length} · {t('النتائج: ', 'Outputs: ')}{outputs.length}</div>
          </div>
        )}
      </div>
    </aside>
  );

  const body = () => {
    if (TOOLS.includes(page)) return <ToolPage ctx={ctx} kind={page} />;
    switch (page) {
      case 'request': return <RequestPage ctx={ctx} />;
      case 'browser': return <BrowserPage ctx={ctx} />;
      case 'library': return <LibraryPage ctx={ctx} />;
      case 'chats': return openChat ? <ChatPage ctx={ctx} /> : <ChatsList ctx={ctx} />;
      case 'favorites': return <FavoritesPage ctx={ctx} />;
      case 'history': return <HistoryPage ctx={ctx} />;
      case 'settings': return <SettingsPage ctx={ctx} />;
      case 'help': return <HelpPage ctx={ctx} />;
      default: return <HomePage ctx={ctx} />;
    }
  };

  return (
    <div className="h-full flex" >
      <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.aac,.ogg,.flac"
        onChange={e => { const f = e.target.files?.[0]; if (f) addFromFile(f); e.target.value = ''; }} />
      <div className="hidden md:block">{Sidebar}</div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="h-full w-fit" onClick={e => e.stopPropagation()}>{Sidebar}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 p-3 relative">
          <button className="btn !p-2.5" onClick={() => (window.innerWidth < 768 ? setMobileOpen(true) : setSettings({ ...settings, collapsed: !collapsed }))} title="Menu"><L.Menu size={18} /></button>
          <div className="flex-1 relative">
            <L.Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 muted" />
            <input className="field ps-9" placeholder={t('ابحث في كل موادك…', 'Search all your materials…')} value={q} onChange={e => setQ(e.target.value)} />
            {results.length > 0 && (
              <div className="neu absolute z-30 top-12 inset-x-0 p-2 fade">
                {results.map(m => (
                  <button key={m.id} className="w-full text-start p-2 rounded-lg hover:neu-in flex items-center gap-2"
                    onClick={() => { setSel(m.id); go('library'); }}><L.FileText size={16} />{m.name}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button className="btn !p-2.5" onClick={() => setShowNotes(!showNotes)} title={t('الإشعارات', 'Notifications')}>
              <L.Bell size={18} />{notes.length > 0 && <span className="w-2 h-2 rounded-full bg-pri" />}
            </button>
            {showNotes && (
              <div className="neu absolute z-30 top-12 end-0 w-72 p-3 fade text-sm">
                {notes.length === 0 ? <div className="muted">{t('لا توجد إشعارات', 'No notifications')}</div> : notes.map((n, i) => <div key={i} className="py-1.5 border-b border-black/5">{n}</div>)}
                {notes.length > 0 && <button className="btn mt-2 !py-1.5 text-xs" onClick={() => setNotes([])}>{t('مسح', 'Clear')}</button>}
              </div>
            )}
          </div>
          <button className="btn !p-2.5" onClick={() => setSettings({ ...settings, dark: !settings.dark })} title={t('الوضع الليلي', 'Dark mode')}>{settings.dark ? <L.Sun size={18} /> : <L.Moon size={18} />}</button>
          <button className="btn !p-2.5" onClick={() => setSettings({ ...settings, lang: lang === 'ar' ? 'en' : 'ar' })} title="Language"><L.Languages size={18} /><span className="text-xs">{lang === 'ar' ? 'EN' : 'ع'}</span></button>
          <button className="btn !p-2.5" onClick={() => go('settings')} title={t('الحساب', 'Account')}><L.UserRound size={18} /></button>
          <button className="btn !p-2.5 opacity-50 cursor-not-allowed hidden sm:inline-flex" disabled title={t('الاشتراكات قريبًا', 'Subscriptions soon')}><L.Crown size={18} /></button>
        </header>
        <main className="flex-1 overflow-y-auto scroll p-3 pt-0 fade" key={page}>{body()}</main>
      </div>

      {job && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
          <div className="neu p-6 w-full max-w-md fade">
            <div className="font-bold mb-1 truncate">{job.name}</div>
            <div className="muted text-sm mb-4">{t('جاري معالجة المادة', 'Processing material')}</div>
            {job.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                {s.state === 'done' ? <L.CircleCheck className="text-sec" size={20} /> : s.state === 'run' ? <L.Loader size={20} className="animate-spin text-pri" /> : s.state === 'err' ? <L.CircleX className="text-red-500" size={20} /> : <L.Circle size={20} className="muted" />}
                <span>{s.label}</span>
              </div>
            ))}
            {job.error && (<><div className="neu-in p-3 text-sm text-red-500 mt-3">{job.error}</div><button className="btn mt-4" onClick={() => setJob(null)}>{t('إغلاق', 'Close')}</button></>)}
          </div>
        </div>
      )}

      {!settings.welcomed && (
        <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4">
          <div className="neu p-8 w-full max-w-md text-center fade">
            <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white bg-gradient-to-br from-pri to-sec mb-4"><L.Sparkles size={30} /></div>
            <h1 className="text-2xl font-bold mb-3">أهلاً في study ai</h1>
            <p className="leading-8">هذا النموذج لمساعدة الطلاب،<br />وهو من تطوير وإنشاء <b>محمد أحمد</b><br />طالب حاسبات وذكاء اصطناعي – بنها</p>
            <p className="muted text-xs mt-3" dir="ltr">Welcome to study.ai — built to help students.</p>
            <button className="btn btn-pri mt-6 mx-auto" onClick={() => setSettings({ ...settings, welcomed: true })}>ابدأ الآن</button>
          </div>
        </div>
      )}

      {settings.welcomed && !settings.consented && (
        <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4 overflow-y-auto">
          <div className="neu p-7 w-full max-w-md fade my-4">
            <div className="flex items-center gap-2 mb-3"><L.ShieldCheck className="text-sec" /><h2 className="text-xl font-bold">{t('إذن استخدام Google AI', 'Permission to use Google AI')}</h2></div>
            <p className="text-sm leading-7">{t('يستعين study.ai بذكاء Google Gemini لمساعدتك. هل تسمح لصاحب هذا الجهاز بما يلي؟', 'study.ai uses Google Gemini to help you. Do you allow the following?')}</p>
            <ul className="text-sm leading-7 list-disc ps-5 my-2">
              <li>{t('إرسال أسئلتك ونص المواد التي تختارها إلى Google Gemini لإنتاج الشرح والملخصات والبطاقات والخرائط الذهنية والأسئلة.', 'Send your questions and the text of the materials you choose to Google Gemini to produce explanations, summaries, flashcards, mind maps and quizzes.')}</li>
              <li>{t('قراءة الملفات التي تختارها أنت فقط (PDF / DOCX / PPTX / TXT / صور / صوت). الصور والصوت ورابط يوتيوب تُرسل إلى Google لاستخراج نصها.', 'Read only the files you choose (PDF / DOCX / PPTX / TXT / images / audio). Images, audio and YouTube links are sent to Google to extract their text.')}</li>
              <li>{t('حفظ موادك ومحادثاتك ونتائجك داخل هذا الجهاز.', 'Store your materials, chats and results on this device.')}</li>
            </ul>
            <p className="muted text-xs leading-6">{t('تنبيه: وفق شروط Google للخدمة المجانية قد يُستخدم المحتوى المرسل لتحسين منتجاتها، فلا ترسل بيانات شخصية أو حساسة. يمكنك سحب الموافقة في أي وقت من الإعدادات.', 'Note: under Google’s free-service terms, content sent may be used to improve its products, so do not send personal or sensitive data. You can withdraw consent anytime in Settings.')}</p>
            {!agree && <div className="text-red-500 text-sm mt-3">{t('لا يمكن استخدام التطبيق بدون الموافقة.', 'The app cannot be used without consent.')}</div>}
            <div className="flex gap-3 mt-5">
              <button className="btn btn-pri flex-1 justify-center" onClick={() => { setAgree(true); setSettings({ ...settings, consented: true }); }}>{t('أوافق', 'I agree')}</button>
              <button className="btn flex-1 justify-center" onClick={() => { setAgree(false); try { window.close(); } catch {} }}>{t('لا أوافق', 'Decline')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
