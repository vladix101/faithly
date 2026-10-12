import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useApp } from '@/state/app';
import { fonts, radius, space, type as typeScale } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Variant = 'display' | 'heading' | 'title' | 'body' | 'small' | 'caption' | 'label' | 'reading';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.serifMedium, fontSize: typeScale.display, lineHeight: typeScale.display * 1.15 },
  heading: { fontFamily: fonts.serifMedium, fontSize: typeScale.heading, lineHeight: typeScale.heading * 1.2 },
  title: { fontFamily: fonts.serifBold, fontSize: typeScale.title, lineHeight: typeScale.title * 1.25 },
  body: { fontFamily: fonts.sans, fontSize: typeScale.body, lineHeight: typeScale.body * 1.45 },
  small: { fontFamily: fonts.sans, fontSize: typeScale.small, lineHeight: typeScale.small * 1.4 },
  caption: { fontFamily: fonts.sans, fontSize: typeScale.caption, lineHeight: typeScale.caption * 1.35 },
  label: { fontFamily: fonts.sansMedium, fontSize: typeScale.small, lineHeight: typeScale.small * 1.3 },
  reading: { fontFamily: fonts.serif, fontSize: typeScale.reading, lineHeight: typeScale.reading * 1.6 },
};

export function T({ variant = 'body', muted, color, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; color?: string }) {
  const { colors } = useApp();
  return <Text {...rest} style={[VARIANTS[variant], { color: color ?? (muted ? colors.inkMuted : colors.ink) }, style]} />;
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useApp();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.screenContent, contentStyle]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Button({
  label,
  icon,
  onPress,
  kind = 'primary',
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useApp();
  const fg = kind === 'primary' ? colors.onGold : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: colors.gold },
        kind === 'secondary' && { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
        kind === 'quiet' && { paddingHorizontal: space.s },
        { opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={19} color={kind === 'quiet' ? colors.gold : fg} /> : null}
      <Text style={[VARIANTS.label, { color: kind === 'quiet' ? colors.gold : fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  active,
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  color?: string;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={23} color={color ?? (active ? colors.gold : colors.ink)} />
    </Pressable>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const { colors } = useApp();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.sunk }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
            ]}>
            <Text style={[VARIANTS.label, { color: selected ? colors.ink : colors.inkMuted, textAlign: 'center' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The manuscript rule: two hairlines with a small gold lozenge. */
export function Ornament({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return (
    <View style={[styles.ornament, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.rule, { backgroundColor: colors.gold }]} />
      <View style={[styles.lozenge, { borderColor: colors.gold }]} />
      <View style={[styles.rule, { backgroundColor: colors.gold }]} />
    </View>
  );
}

export function Row({
  title,
  subtitle,
  onPress,
  right,
  icon,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  icon?: IconName;
  accessibilityLabel?: string;
}) {
  const { colors } = useApp();
  const body = (
    <>
      {icon ? <Ionicons name={icon} size={21} color={colors.gold} style={{ marginRight: space.m }} /> : null}
      <View style={{ flex: 1 }}>
        <T variant="body">{title}</T>
        {subtitle ? (
          <T variant="caption" muted>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} /> : null)}
    </>
  );
  const style = [styles.row, { borderBottomColor: colors.line }];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [...style, { opacity: pressed ? 0.6 : 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <T variant="title" accessibilityRole="header" style={[{ marginTop: space.xl, marginBottom: space.s }, style]}>
      {children}
    </T>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useApp();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.m }}>
      <Ionicons name={icon} size={34} color={colors.gold} />
      <T variant="body" muted style={{ textAlign: 'center', maxWidth: 300 }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: space.l, paddingBottom: space.xxl, paddingTop: space.s },
  button: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: space.l,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
  },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: radius.pill, justifyContent: 'center', paddingHorizontal: space.s },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2, opacity: 0.6 },
  lozenge: { width: 7, height: 7, borderWidth: 1.2, transform: [{ rotate: '45deg' }] },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: space.m, borderBottomWidth: StyleSheet.hairlineWidth },
});
