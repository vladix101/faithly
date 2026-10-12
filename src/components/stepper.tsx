import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app';
import { radius, space } from '@/theme/tokens';

import { IconButton, T } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');

export function Stepper({
  label,
  value,
  onMinus,
  onPlus,
  minusLabel,
  plusLabel,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  minusLabel: string;
  plusLabel: string;
}) {
  const { colors } = useApp();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surface, borderColor: colors.line }]} accessible={false}>
      <IconButton icon="remove" label={minusLabel} onPress={onMinus} />
      <View style={{ alignItems: 'center', minWidth: 64 }} accessible accessibilityLabel={`${label}: ${value}`}>
        <T variant="title" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
        <T variant="caption" muted>
          {label}
        </T>
      </View>
      <IconButton icon="add" label={plusLabel} onPress={onPlus} />
    </View>
  );
}

/** Hour and minute (5-minute steps) of the daily reminder. */
export function ReminderTimePicker({
  hour,
  minute,
  onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const { ui } = useApp();
  const set = (h: number, m: number) => onChange((h + 24) % 24, (m + 60) % 60);
  return (
    <View style={styles.timeRow}>
      <Stepper
        label={ui('sat')}
        value={pad(hour)}
        minusLabel={ui('Sat ranije')}
        plusLabel={ui('Sat kasnije')}
        onMinus={() => set(hour - 1, minute)}
        onPlus={() => set(hour + 1, minute)}
      />
      <Stepper
        label={ui('minut')}
        value={pad(minute)}
        minusLabel={ui('Pet minuta ranije')}
        plusLabel={ui('Pet minuta kasnije')}
        onMinus={() => set(hour, minute % 5 ? minute - (minute % 5) : minute - 5)}
        onPlus={() => set(hour, minute + 5 - (minute % 5))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.m,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
    flex: 1,
  },
  timeRow: { flexDirection: 'row', gap: space.m, marginVertical: space.m },
});
