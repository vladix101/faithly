// App-wide state: both databases, user settings, theme and script conversion.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import type { ContentDb } from '@/db/content';
import { DatabaseProvider, type OpenedDatabases } from '@/db/provider';
import { setSetting, type UserDb } from '@/db/user';
import { cyrToLat, latToCyr } from '@/lib/text/translit';
import { palettes, type Palette } from '@/theme/tokens';

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
  content: ContentDb;
  user: UserDb;
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

function Inner({ dbs, children, onReady }: { dbs: OpenedDatabases; children: ReactNode; onReady: () => void }) {
  const { content, user } = dbs;
  const system = useColorScheme();
  const [settings, setSettings] = useState<Settings>(() => parseSettings(dbs.settings));

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
      await setSetting(user, key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    },
    [user],
  );

  const dark = settings.theme === 'system' ? system === 'dark' : settings.theme === 'dark';
  const value = useMemo<AppState>(() => {
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
    onReady();
  }, [onReady]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function AppProvider({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  return (
    <DatabaseProvider>
      {(dbs) => (
        <Inner dbs={dbs} onReady={onReady}>
          {children}
        </Inner>
      )}
    </DatabaseProvider>
  );
}
