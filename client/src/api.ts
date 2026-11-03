import { chatLocal, generateLocal, NAME, planLocal, proxyUrl, refineLocal, researchLocal } from './ai';
import { ingestFile, ingestUrl as ingestUrlLocal } from './ingest';

export const getProviders = async () => ({ providers: [{ id: 'gemini', name: NAME, model: 'Google', enabled: !!(await proxyUrl()) }] });
export const ingest = (f: File) => ingestFile(f);
export const ingestUrl = (u: string) => ingestUrlLocal(u);
export const generate = (b: { kind: string; text: string; mode: string; lang: string; extra?: string }) => generateLocal(b);
export const refine = (b: { kind: string; text: string; current: string; instruction: string; lang: string }) => refineLocal(b);
export const chatApi = (b: { question: string; context: string; history: any[]; lang: string; search?: boolean; signal?: AbortSignal; onDelta?: (t: string) => void }) => chatLocal(b);
export const planRequest = (b: { request: string; materials: string[]; lang: string }) => planLocal(b);
export const researchApi = (b: { query: string; lang: string }) => researchLocal(b);
