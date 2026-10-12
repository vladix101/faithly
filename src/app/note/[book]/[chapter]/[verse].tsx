import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { getVerses, type Verse } from '@/db/content';
import { getNote, saveNote } from '@/db/user';
import { useBook } from '@/hooks/use-content';
import { formatRef } from '@/lib/format';
import { useApp } from '@/state/app';
import { fonts, radius, space } from '@/theme/tokens';

export default function NoteScreen() {
  const p = useLocalSearchParams<{ book: string; chapter: string; verse: string }>();
  const [bookId, chapter, verse] = [Number(p.book), Number(p.chapter), Number(p.verse)];
  const { content, user, colors, ui, c } = useApp();
  const book = useBook(bookId);
  const [text, setText] = useState('');
  const [verseRow, setVerseRow] = useState<Verse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getNote(user, bookId, chapter, verse), getVerses(content, { bookId, chapter, verseStart: verse, verseEnd: verse })]).then(
      ([note, verses]) => {
        setText(note?.text ?? '');
        setVerseRow(verses[0] ?? null);
        setLoaded(true);
      },
    );
  }, [user, content, bookId, chapter, verse]);

  const save = async () => {
    await saveNote(user, bookId, chapter, verse, text);
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Screen edges={['bottom']}>
        <T variant="label" color={colors.gold}>
          {book ? c(formatRef(book.short_name, chapter, verse)) : ''}
        </T>
        {verseRow ? (
          <T variant="reading" style={{ marginTop: space.s }}>
            {c(verseRow.text)}
          </T>
        ) : null}
        <TextInput
          multiline
          editable={loaded}
          value={text}
          onChangeText={setText}
          placeholder={ui('Vaša beleška uz ovaj stih')}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={ui('Tekst beleške')}
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.line, color: colors.ink }]}
          textAlignVertical="top"
        />
        <T variant="caption" muted style={{ marginTop: space.s }}>
          {ui('Beleške ostaju samo na ovom telefonu. Prazna beleška se briše.')}
        </T>
        <View style={{ flexDirection: 'row', gap: space.m, marginTop: space.l }}>
          <Button label={ui('Otkaži')} kind="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
          <Button label={ui('Sačuvaj')} icon="checkmark" onPress={save} disabled={!loaded} style={{ flex: 1 }} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: space.l,
    minHeight: 160,
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.l,
    fontFamily: fonts.sans,
    fontSize: 17,
  },
});
