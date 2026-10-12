import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getBooks, type Book } from '@/db/content';
import { localDateKey } from '@/lib/dates';
import { useApp } from '@/state/app';

let booksCache: Book[] | null = null;

/** Book list (66 rows) loaded once per app run. */
export function useBooks(): Book[] | null {
  const { content } = useApp();
  const [books, setBooks] = useState<Book[] | null>(booksCache);
  useEffect(() => {
    if (booksCache) return;
    getBooks(content).then((b) => {
      booksCache = b;
      setBooks(b);
    });
  }, [content]);
  return books;
}

export function useBook(id: number): Book | undefined {
  return useBooks()?.find((b) => b.id === id);
}

/**
 * Runs a memoized async loader on mount, whenever it changes (pass a useCallback) and
 * whenever the screen regains focus. The latest result wins; errors are logged.
 */
export function useLoader<T>(load: () => Promise<T>): [T | undefined, () => void] {
  const [value, setValue] = useState<T>();
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    load()
      .then((v) => {
        if (id === seq.current) setValue(v);
      })
      .catch((e) => console.warn(e));
  }, [load]);
  useFocusEffect(run);
  return [value, run];
}

/** The local calendar day, refreshed when the app returns to the foreground or the screen is focused. */
export function useToday(): string {
  const [today, setToday] = useState(localDateKey());
  useFocusEffect(useCallback(() => setToday(localDateKey()), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setToday(localDateKey());
    });
    const timer = setInterval(() => setToday(localDateKey()), 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return today;
}

export type { SQLiteDatabase };
