import { chatLocal, generateLocal, planLocal, refineLocal, researchLocal } from './ai';
import { ingestFile, ingestUrl as ingestUrlLocal } from './ingest';

export const ingest = (f: File) => ingestFile(f);
export const ingestUrl = (u: string) => ingestUrlLocal(u);
export const generate = (b: Parameters<typeof generateLocal>[0]) => generateLocal(b);
export const refine = (b: Parameters<typeof refineLocal>[0]) => refineLocal(b);
export const chatApi = (b: Parameters<typeof chatLocal>[0]) => chatLocal(b);
export const planRequest = (b: Parameters<typeof planLocal>[0]) => planLocal(b);
export const researchApi = (b: Parameters<typeof researchLocal>[0]) => researchLocal(b);
