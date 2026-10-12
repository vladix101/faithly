// App-wide state: both databases, user settings, theme and script conversion.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { deleteDatabaseAsync, openDatabaseAsync, SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import contentMeta from '@/assets/db/content.json';
import { verifyContent } from '@/db/content';
import { getAllSettings, migrateUserDb, setSetting, USER_DB_NAME } from '@/db/user';
import { cyrToLat, latToCyr } from '@/lib/text/translit';
import { palettes, type Palette } from '@/theme/tokens';

/** A new file name for every content build, so an app update imports the new asset. */
export const CONTENT_DB_NAME = `content-${contentMeta.content_version}-${contentMeta.sha256.slice(0, 10)}.db`;

export type Script = 'lat' | 'cyr';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  script: Script;
  theme: ThemePref;
  readingScale: number;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  feastReminders: boolean;
  lastTimeZone: string;
}

const DEFAULTS: Settings = {
  script: 'lat',
  theme: 'system',
  readingScale: 1,
  reminderEnabled: false,
  reminderHour: 9,
  reminderMinute: 0,
  feastReminders: false,
  lastTimeZone: '',
};

function parseSettings(raw: Record<string, string>): Settings {
  const num = (k: keyof Settings, d: number) => (raw[k] !== undefined && Number.isFinite(Number(raw[k])) ? Number(raw[k]) : d);
  return {
    script: raw.script === 'cyr' ? 'cyr' : 'lat',
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    readingScale: Math.min(1.8, Math.max(0.8, num('readingScale', 1))),
    reminderEnabled: raw.reminderEnabled === '1',
    reminderHour: Math.min(23, Math.max(0, num('reminderHour', 9))),
    reminderMinute: Math.min(59, Math.max(0, num('reminderMinute', 0))),
    feastReminders: raw.feastReminders === '1',
    lastTimeZone: raw.lastTimeZone ?? '',
  };
}

interface AppState {
  content: SQLiteDatabase;
  user: SQLiteDatabase;
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  /** App-authored Latin string → user's script */
  ui: (latin: string) => string;
  /** Stored Cyrillic content → user's script */
  c: (cyrillic: string) => string;
  colors: Palette;
  dark: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

function Inner({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  const content = useSQLiteContext();
  const system = useColorScheme();
  const [user, setUser] = useState<SQLiteDatabase | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await openDatabaseAsync(USER_DB_NAME);
      await migrateUserDb(db);
      const raw = await getAllSettings(db);
      // Remove the previous content database after an update imported a new one.
      if (raw.contentDbName && raw.contentDbName !== CONTENT_DB_NAME) {
        await deleteDatabaseAsync(raw.contentDbName).catch(() => undefined);
      }
      await setSetting(db, 'contentDbName', CONTENT_DB_NAME);
      if (!cancelled) {
        setSettings(parseSettings(raw));
        setUser(db);
      }
    })().catch((e: unknown) => setError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
      if (user) await setSetting(user, key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    },
    [user],
  );

  const dark = settings.theme === 'system' ? system === 'dark' : settings.theme === 'dark';
  const value = useMemo<AppState | null>(() => {
    if (!user) return null;
    const cyr = settings.script === 'cyr';
    return {
      content,
      user,
      settings,
      update,
      ui: cyr ? latToCyr : (s) => s,
      c: cyr ? (s) => s : cyrToLat,
      colors: palettes[dark ? 'dark' : 'light'],
      dark,
    };
  }, [content, user, settings, update, dark]);

  useEffect(() => {
    if (value) onReady();
  }, [value, onReady]);

  if (error) throw error;
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AppProvider({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  return (
    <SQLiteProvider
      databaseName={CONTENT_DB_NAME}
      assetSource={{ assetId: require('@/assets/db/content.db') }}
      onInit={(db) => verifyContent(db, contentMeta.schema_version)}>
      <Inner onReady={onReady}>{children}</Inner>
    </SQLiteProvider>
  );
}
