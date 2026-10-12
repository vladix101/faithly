import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import type { FastType } from '@/db/content';
import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';

import { T, type IconName } from './ui';

export const FAST_LABEL: Record<FastType, string> = {
  none: 'Nema posta',
  water: 'Post na vodi',
  oil: 'Post na ulju',
  fish: 'Riba dozvoljena',
  dairy: 'Bez mesa (sirna sedmica)',
};

const FAST_ICON: Record<FastType, IconName> = {
  none: 'restaurant-outline',
  water: 'water-outline',
  oil: 'color-fill-outline',
  fish: 'fish-outline',
  dairy: 'egg-outline',
};

export const FAST_DISCLAIMER = 'Kalendar prikazuje opšta pravila posta. Lično pravilo posta dogovara se sa sveštenikom.';

export function FastBadge({ type, name }: { type: FastType; name?: string | null }) {
  const { colors, ui, c } = useApp();
  const fasting = type !== 'none';
  return (
    <View style={{ gap: space.xs }}>
      <View
        accessible
        accessibilityLabel={`${ui(FAST_LABEL[type])}${name ? `, ${c(name)}` : ''}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.s,
          alignSelf: 'flex-start',
          paddingVertical: 6,
          paddingHorizontal: space.m,
          borderRadius: radius.pill,
          backgroundColor: fasting ? colors.goldSoft : colors.sunk,
        }}>
        <Ionicons name={FAST_ICON[type]} size={17} color={fasting ? colors.gold : colors.inkMuted} />
        <T variant="label">{ui(FAST_LABEL[type])}</T>
      </View>
      {name ? (
        <T variant="small" muted>
          {c(name)}
        </T>
      ) : null}
    </View>
  );
}
