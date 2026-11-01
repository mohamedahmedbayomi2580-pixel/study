// نفس واجهة الاستدعاء السابقة، لكن التنفيذ الآن محلي على الجهاز بدون سيرفر.
import { chatLocal, generateLocal, loadConf, NAMES, PIDS } from './ai';
import { ingestFile, ingestUrl as ingestUrlLocal } from './ingest';

export const getProviders = async () => {
  const c = await loadConf();
  return { providers: PIDS.map(id => ({ id, name: NAMES[id], model: c[id].model, enabled: !!c[id].key.trim() })) };
};
export const ingest = (f: File) => ingestFile(f);
export const ingestUrl = (u: string) => ingestUrlLocal(u);
export const generate = (b: { kind: string; text: string; mode: string; lang: string; extra?: string }) => generateLocal(b);
export const chatApi = (b: { question: string; context: string; history: any[]; lang: string }) => chatLocal(b);
