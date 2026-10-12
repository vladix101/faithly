// Faithly visual tokens: parchment and ink, with gold leaf used sparingly
// and cinnabar reserved for red-letter days.

export interface Palette {
  bg: string;
  surface: string;
  sunk: string;
  ink: string;
  inkMuted: string;
  line: string;
  gold: string;
  goldSoft: string;
  onGold: string;
  red: string;
  redSoft: string;
}

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#F6F0E3',
    surface: '#FCF8EF',
    sunk: '#EDE4D1',
    ink: '#23201B',
    inkMuted: '#6B6252',
    line: '#DDD0B6',
    gold: '#9A7531',
    goldSoft: '#EADDBE',
    onGold: '#FFFDF7',
    red: '#A3352B',
    redSoft: '#F3DDD6',
  },
  dark: {
    bg: '#1B1814',
    surface: '#25211B',
    sunk: '#141210',
    ink: '#EFE6D3',
    inkMuted: '#A99E89',
    line: '#3B352B',
    gold: '#D4B46C',
    goldSoft: '#3A3124',
    onGold: '#1B1814',
    red: '#E8877B',
    redSoft: '#3D2522',
  },
};

export const fonts = {
  serif: 'Alegreya_400Regular',
  serifItalic: 'Alegreya_400Regular_Italic',
  serifMedium: 'Alegreya_500Medium',
  serifBold: 'Alegreya_700Bold',
  sans: 'AlegreyaSans_400Regular',
  sansMedium: 'AlegreyaSans_500Medium',
  sansBold: 'AlegreyaSans_700Bold',
} as const;

/** Type scale (base 17, ratio ~1.25) */
export const type = {
  caption: 14,
  small: 15.5,
  body: 17,
  reading: 19,
  title: 22,
  heading: 27,
  display: 34,
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 36 } as const;
export const radius = { s: 8, m: 14, pill: 999 } as const;
