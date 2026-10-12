// "Add to Home Screen" help for the web build. Uses the real install prompt where the
// browser offers one (Android Chrome), otherwise shows the manual steps.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useApp } from '@/state/app';
import { space } from '@/theme/tokens';
import { canPromptInstall, getEnvironment, promptInstall, subscribe } from '@/web/pwa';

import { Button, T } from './ui';

const IOS_STEPS = [
  'Otvori link u Safariju.',
  'Izaberi Share / Deli (kvadrat sa strelicom nagore).',
  'Izaberi Add to Home Screen / Dodaj na početni ekran.',
  'Pokreni Faithly preko nove ikonice.',
  'U podešavanjima uključi podsetnik i odobri notifikacije.',
];

export function InstallInstructions() {
  const { ui, colors } = useApp();
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  const env = getEnvironment();
  if (env.standalone) return null;

  if (env.ios) {
    return (
      <View style={{ gap: space.xs }}>
        {env.iosOtherBrowser ? (
          <T variant="body" color={colors.red}>
            {ui('Ovaj pregledač na iPhone-u ne može da uključi podsetnike. Kopiraj link i otvori ga u Safariju.')}
          </T>
        ) : null}
        {IOS_STEPS.map((s, i) => (
          <T key={s} variant="body">
            {`${i + 1}. ${ui(s)}`}
          </T>
        ))}
      </View>
    );
  }
  if (canPromptInstall()) {
    return <Button label={ui('Instaliraj Faithly')} icon="download-outline" onPress={() => void promptInstall()} />;
  }
  return (
    <T variant="body">{ui('Za instalaciju otvori meni pregledača (⋮) i izaberi „Instaliraj aplikaciju” ili „Dodaj na početni ekran”.')}</T>
  );
}
