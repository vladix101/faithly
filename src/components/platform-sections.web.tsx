// Web-only settings: home-screen install, offline download of the Bible, and backup of
// favorites/notes (browsers may clear site data, so a JSON copy is the safety net).
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { downloadAll, getCalendarYears, getOfflineStatus, type OfflineStatus } from '@/db/content.web';
import { exportBackup, importBackup } from '@/db/user.web';
import { useApp } from '@/state/app';
import { space } from '@/theme/tokens';
import { useWebDbs } from '@/web/dbs';
import { getEnvironment } from '@/web/pwa';

import { InstallInstructions } from './install-instructions';
import { Button, SectionTitle, T } from './ui';

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB`;

export function PlatformSections() {
  const { ui, colors } = useApp();
  const { content, user } = useWebDbs();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const env = getEnvironment();

  const refresh = useCallback(async () => {
    setStatus(await getOfflineStatus(content));
    setYears(await getCalendarYears(content));
  }, [content]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadAll(content, setStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
      void refresh();
    }
  };

  const doExport = async () => {
    const data = await exportBackup(user);
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `faithly-rezervna-kopija-${data.exported_at.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setMessage(ui(`Sačuvano: ${data.favorites.length} omiljenih i ${data.notes.length} beležaka.`));
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setError(null);
      try {
        if (file.size > 5_000_000) throw new Error(ui('Fajl je prevelik.'));
        const added = await importBackup(user, JSON.parse(await file.text()));
        setMessage(ui(`Uvezeno stavki: ${added}. Postojeći podaci su zadržani.`));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    input.click();
  };

  const complete = status && status.downloadedBooks === status.totalBooks;
  const yearRange = years.length ? `${years[0]}–${years[years.length - 1]}` : '';

  return (
    <>
      <SectionTitle>{ui('Početni ekran')}</SectionTitle>
      {env.standalone ? (
        <T variant="body">{ui('Faithly je otvoren sa početnog ekrana.')}</T>
      ) : (
        <View style={{ gap: space.s }}>
          <T variant="body">{ui('Dodaj Faithly na početni ekran da se otvara kao aplikacija, bez trake pregledača.')}</T>
          <InstallInstructions />
        </View>
      )}

      <SectionTitle>{ui('Čitanje bez interneta')}</SectionTitle>
      <View style={{ gap: space.s }}>
        <T variant="body">
          {ui(
            `Citat dana, kalendar (${yearRange}) i molitve sačuvani su na ovom uređaju pri prvom otvaranju. Biblija se preuzima posebno.`,
          )}
        </T>
        {status ? (
          <T variant="body" color={complete ? colors.gold : undefined} accessibilityLiveRegion="polite">
            {complete
              ? ui(`Cela Biblija je sačuvana za čitanje bez interneta (${mb(status.totalBytes)}).`)
              : ui(`Preuzeto: ${status.downloadedBooks} od ${status.totalBooks} knjiga (${mb(status.bytes)} od ${mb(status.totalBytes)}).`)}
          </T>
        ) : null}
        {!complete ? (
          <Button
            label={ui(downloading ? 'Preuzimanje…' : 'Preuzmi celu Bibliju')}
            icon="cloud-download-outline"
            onPress={download}
            disabled={downloading}
          />
        ) : null}
        <T variant="caption" muted>
          {ui('Pretraga Biblije koristi preuzeti tekst. Ažuriranje sadržaja ne briše omiljene i beleške.')}
        </T>
      </View>

      <SectionTitle>{ui('Rezervna kopija')}</SectionTitle>
      <View style={{ gap: space.s }}>
        <T variant="body">
          {ui(
            'Omiljeni i beleške čuvaju se samo u ovom pregledaču. Pregledač ih može obrisati (npr. pri brisanju podataka sajta), pa povremeno sačuvaj kopiju.',
          )}
        </T>
        <Button label={ui('Izvezi omiljene i beleške')} icon="download-outline" kind="secondary" onPress={doExport} />
        <Button label={ui('Uvezi iz fajla')} icon="push-outline" kind="secondary" onPress={doImport} />
        {message ? (
          <T variant="small" color={colors.gold}>
            {message}
          </T>
        ) : null}
        {error ? (
          <T variant="small" color={colors.red}>
            {error}
          </T>
        ) : null}
      </View>
    </>
  );
}
