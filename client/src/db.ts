// تخزين محلي: SQLite على الهاتف (Capacitor)، وlocalStorage على الويب/ويندوز.
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const native = Capacitor.isNativePlatform();
let conn: any = null;
let opening: Promise<void> | null = null;

async function init() {
  if (!native) return;
  if (!opening) {
    opening = (async () => {
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      conn = await sqlite.createConnection('studyai', false, 'no-encryption', 1, false);
      await conn.open();
      await conn.execute('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);');
    })();
  }
  await opening;
}

export async function get<T>(key: string, def: T): Promise<T> {
  try {
    await init();
    if (native) {
      const r = await conn.query('SELECT v FROM kv WHERE k = ?', [key]);
      return r.values && r.values.length ? (JSON.parse(r.values[0].v) as T) : def;
    }
    const s = localStorage.getItem('studyai:' + key);
    return s ? (JSON.parse(s) as T) : def;
  } catch { return def; }
}

export async function set<T>(key: string, value: T): Promise<void> {
  await init();
  const v = JSON.stringify(value);
  if (native) await conn.run('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [key, v]);
  else localStorage.setItem('studyai:' + key, v);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
