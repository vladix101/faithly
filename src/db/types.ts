// Data models shared by the native (SQLite) and web (IndexedDB) data adapters.

export interface Book {
  id: number;
  code: string;
  testament: 'OT' | 'NT';
  name: string;
  short_name: string;
  abbr: string;
  chapter_count: number;
}

export interface Verse {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface Heading {
  before_verse: number;
  kind: 'section' | 'title';
  text: string;
}

export interface VerseRange {
  bookId: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

export interface Prayer {
  id: string;
  category: 'morning' | 'evening' | 'meal' | 'other';
  title: string;
  note: string | null;
}

export interface PrayerPart extends VerseRange {
  verses: Verse[];
}

export type FastType = 'none' | 'water' | 'oil' | 'fish' | 'dairy';

export interface CalendarDay {
  date: string;
  year: number;
  julian_date: string;
  weekday: number;
  available: number;
  is_red: number;
  fast_type: FastType;
  fast_name: string | null;
  folk: string | null;
}

export interface CalendarEvent {
  date: string;
  ord: number;
  kind: 'movable' | 'fixed' | 'memorial';
  title: string;
  is_red: number;
  is_bold: number;
}

export interface ContentSource {
  id: string;
  kind: string;
  title: string;
  edition: string | null;
  author_publisher: string | null;
  url: string | null;
  license: string;
  retrieved_at: string;
  coverage: string | null;
  notes: string | null;
}

// ---------- user data ----------
export interface ReadingPosition {
  book_id: number;
  chapter: number;
  verse: number;
}

export interface Favorite {
  id: number;
  kind: 'verse' | 'prayer';
  book_id: number | null;
  chapter: number | null;
  verse_start: number | null;
  verse_end: number | null;
  prayer_id: string | null;
  created_at: string;
}

export interface Note {
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
  updated_at: string;
}
