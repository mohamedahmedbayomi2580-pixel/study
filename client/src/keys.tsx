import { useEffect, useState } from 'react';
import * as L from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AiConf, KEY_LINKS, loadConf, NAMES, PIDS, PId, saveConf, testKey } from './ai';

export const openLink = (u: string) => (Capacitor.isNativePlatform() ? Browser.open({ url: u }) : window.open(u, '_blank'));

export function KeyManager({ t }: { t: (ar: string, en: string) => string }) {
  const [conf, setConf] = useState<AiConf | null>(null);
  const [state, setState] = useState<Record<string, string>>({});
  useEffect(() => { loadConf().then(setConf); }, []);
  if (!conf) return null;
  const upd = (id: PId, patch: Partial<{ key: string; model: string }>) => { const n = { ...conf, [id]: { ...conf[id], ...patch } }; setConf(n); saveConf(n); };
  const test = async (id: PId) => {
    setState(s => ({ ...s, [id]: '…' }));
    try { await testKey(id, conf[id]); setState(s => ({ ...s, [id]: 'ok' })); } catch (e: any) { setState(s => ({ ...s, [id]: e.message })); }
  };
  return (
    <div className="flex flex-col gap-4">
      {PIDS.map(id => (
        <div key={id} className="neu-in p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap"><b className="flex-1">{NAMES[id]}</b>
            <button className="btn !py-1.5 text-xs" onClick={() => openLink(KEY_LINKS[id])}><L.ExternalLink size={14} />{t('احصل على مفتاح', 'Get a key')}</button></div>
          <input dir="ltr" type="password" className="field" placeholder="API key" value={conf[id].key} onChange={e => upd(id, { key: e.target.value.trim() })} />
          <input dir="ltr" className="field text-xs" value={conf[id].model} onChange={e => upd(id, { model: e.target.value.trim() })} />
          <div className="flex items-center gap-2 text-sm">
            <button className="btn !py-1.5 text-xs" disabled={!conf[id].key} onClick={() => test(id)}><L.PlugZap size={14} />{t('اختبار', 'Test')}</button>
            {state[id] === 'ok' && <span className="text-sec flex items-center gap-1"><L.CircleCheck size={14} />{t('يعمل', 'Works')}</span>}
            {state[id] && state[id] !== 'ok' && state[id] !== '…' && <span className="text-red-500 text-xs break-all">{state[id]}</span>}
            {state[id] === '…' && <L.Loader size={14} className="animate-spin" />}
          </div>
        </div>
      ))}
      <div className="muted text-xs">{t('المفاتيح تُحفظ على جهازك فقط داخل التطبيق، ولا تُرسل إلا للمزود نفسه.', 'Keys are stored only on your device and sent only to the provider itself.')}</div>
    </div>
  );
}
