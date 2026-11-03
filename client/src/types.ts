export type Lang = 'ar' | 'en';
export interface Material { id: string; name: string; text: string; createdAt: number; }
export interface Msg { role: 'user' | 'assistant'; content: string; sources?: { uri: string; title: string }[]; }
export interface Chat { pinned?: boolean; id: string; materialId?: string; title: string; messages: Msg[]; updatedAt: number; }
export interface Output { id: string; materialId: string; kind: string; content: string; fav: boolean; createdAt: number; meta?: any; }
export interface Settings { serverUrl: string; token: string; lang: Lang; dark: boolean; collapsed: boolean; welcomed: boolean; consented: boolean; setupDone: boolean; mode: 'fast' | 'full'; }
export const DEFAULT_SETTINGS: Settings = { serverUrl: 'http://localhost:8787', token: '', lang: 'ar', dark: true, collapsed: false, welcomed: false, consented: false, setupDone: false, mode: 'fast' };
