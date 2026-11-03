import { Chat, Lang, Material, Output, Settings } from './types';
export interface Ctx {
  t: (ar: string, en: string) => string;
  lang: Lang;
  settings: Settings; setSettings: (s: Settings) => void;
  materials: Material[]; setMaterials: (m: Material[]) => void;
  chats: Chat[]; setChats: (c: Chat[]) => void;
  outputs: Output[]; setOutputs: (o: Output[]) => void;
  sel: string; setSel: (id: string) => void;
  go: (p: string) => void;
  notify: (msg: string) => void;
  pickFile: () => void;
  addFromFile: (f: File) => Promise<void>;
  addFromUrl: (u: string) => Promise<void>;
  openChat: string; setOpenChat: (id: string) => void;
}
