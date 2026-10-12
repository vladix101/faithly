// Church calendar engine used at content-build time (not shipped in the app).
// All date arithmetic goes through Julian Day Numbers, so the Julian/Gregorian
// difference is computed per date (13 days in 1900–2099, 14 in 2100–2199, …),
// never assumed as a fixed offset.

/** @param {number} y @param {number} m @param {number} d */
export function jdnFromGregorian(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/** @param {number} y @param {number} m @param {number} d */
export function jdnFromJulian(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
}

/** @param {number} jdn @returns {[number, number, number]} */
export function gregorianFromJdn(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return [100 * b + d - 4800 + Math.floor(m / 10), m + 3 - 12 * Math.floor(m / 10), e - Math.floor((153 * m + 2) / 5) + 1];
}

/** @param {number} jdn @returns {[number, number, number]} */
export function julianFromJdn(jdn) {
  const c = jdn + 32082;
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return [d - 4800 + Math.floor(m / 10), m + 3 - 12 * Math.floor(m / 10), e - Math.floor((153 * m + 2) / 5) + 1];
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayFromJdn(jdn) {
  return (jdn + 1) % 7;
}

/** Orthodox Pascha (Julian computus, Meeus), returned as JDN. */
export function paschaJdn(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return jdnFromJulian(year, month, day);
}

const pad = (n) => String(n).padStart(2, '0');
export const isoFromParts = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const isoFromJdn = (jdn) => isoFromParts(...gregorianFromJdn(jdn));

/** Movable feasts relative to Pascha (offset in days). Titles in Cyrillic, as stored. */
export const MOVABLE = [
  { offset: -70, title: 'Недеља о митару и фарисеју' },
  { offset: -63, title: 'Недеља о блудном сину' },
  { offset: -57, title: 'Задушнице (месопусна субота)', kind: 'memorial' },
  { offset: -56, title: 'Месопусна недеља' },
  { offset: -49, title: 'Сиропусна недеља (Беле покладе)' },
  { offset: -48, title: 'Почетак Великог (Часног) поста' },
  { offset: -43, title: 'Тодорова субота' },
  { offset: -42, title: 'Недеља православља' },
  { offset: -28, title: 'Крстопоклона недеља' },
  { offset: -8, title: 'Лазарева субота (Врбица)', major: true },
  { offset: -7, title: 'Цвети – Улазак Господа Исуса Христа у Јерусалим', major: true },
  { offset: -3, title: 'Велики четвртак' },
  { offset: -2, title: 'Велики петак', red: true, major: true },
  { offset: -1, title: 'Велика субота' },
  { offset: 0, title: 'Васкрсење Господа Исуса Христа – Васкрс', red: true, major: true },
  { offset: 1, title: 'Васкрсни понедељак', red: true },
  { offset: 2, title: 'Васкрсни уторак', red: true },
  { offset: 5, title: 'Живоносни источник (Светли петак)' },
  { offset: 7, title: 'Томина недеља' },
  { offset: 24, title: 'Преполовљење Педесетнице' },
  { offset: 39, title: 'Вазнесење Господње – Спасовдан', red: true, major: true },
  { offset: 48, title: 'Духовске задушнице', kind: 'memorial' },
  { offset: 49, title: 'Силазак Светог Духа на апостоле – Духови (Тројице)', red: true, major: true },
  { offset: 50, title: 'Духовски понедељак', red: true },
  { offset: 56, title: 'Недеља свих светих' },
];

export const FAST = { NONE: 'none', WATER: 'water', OIL: 'oil', FISH: 'fish', DAIRY: 'dairy' };

/**
 * Fasting for one civil day, following "Правило поста за целу годину" (svetosavlje.org).
 * Dates of fixed periods are Julian (church) dates.
 * @param {object} p
 * @param {number} p.jdn
 * @param {number} p.pascha  JDN of this church year's Pascha
 * @param {(jm:number, jd:number)=>boolean} p.isRedFixed  red-letter fixed feast on that Julian date
 * @returns {{type: string, name: string | null}}
 */
export function fastingForDay({ jdn, pascha, isRedFixed }) {
  const [, jm, jd] = julianFromJdn(jdn);
  const wd = weekdayFromJdn(jdn);
  const off = jdn - pascha;
  const weekend = wd === 0 || wd === 6;
  const wedFri = wd === 3 || wd === 5;
  const red = isRedFixed(jm, jd);
  const is = (m, d) => jm === m && jd === d;
  const between = (m1, d1, m2, d2) => {
    const v = jm * 100 + jd;
    return v >= m1 * 100 + d1 && v <= m2 * 100 + d2;
  };

  // Fast-free periods ("трапаве седмице") and great feasts
  if (between(12, 25, 12, 31) || between(1, 1, 1, 4)) return { type: FAST.NONE, name: 'Божићни мрсни дани' };
  if (is(1, 6)) return { type: FAST.NONE, name: null };
  if (off >= -69 && off <= -64) return { type: FAST.NONE, name: 'Трапава седмица (после Недеље о митару и фарисеју)' };
  if (off >= 1 && off <= 6) return { type: FAST.NONE, name: 'Светла седмица' };
  if (off >= 50 && off <= 55) return { type: FAST.NONE, name: 'Духовска седмица' };

  // Strict single-day fasts
  if (is(1, 5) || is(8, 29) || is(9, 14)) {
    const name = is(1, 5)
      ? 'Крстовдан – навечерје Богојављења'
      : is(8, 29)
        ? 'Усековање главе св. Јована Крститеља'
        : 'Крстовдан – Воздвижење Часног Крста';
    return { type: weekend ? FAST.OIL : FAST.WATER, name: `${name} (строги пост)` };
  }

  // Cheesefare week: no meat
  if (off >= -55 && off <= -49) return { type: FAST.DAIRY, name: 'Сирна седмица' };

  // Great Lent and Holy Week
  if (off >= -48 && off <= -1) {
    const name = off >= -6 ? 'Велики (Часни) пост – Страсна седмица' : 'Велики (Часни) пост';
    if (off === -7) return { type: FAST.FISH, name };
    if (is(3, 25)) return { type: off >= -2 ? FAST.OIL : FAST.FISH, name };
    return { type: weekend ? FAST.OIL : FAST.WATER, name };
  }

  // Pentecostarion: Thomas Sunday to Pentecost
  if (off >= 7 && off <= 48) {
    if (!wedFri) return { type: FAST.NONE, name: null };
    if (off === 24 || off === 38) return { type: FAST.FISH, name: off === 24 ? 'Преполовљење' : 'Оданије Васкрса' };
    return { type: FAST.OIL, name: null };
  }

  // Apostles' fast: Monday after All Saints until 28 June (Julian)
  if (off >= 57 && (jm < 6 || (jm === 6 && jd <= 28))) {
    const name = 'Петровски пост';
    if (weekend || red) return { type: FAST.FISH, name };
    return { type: wd === 2 || wd === 4 ? FAST.OIL : FAST.WATER, name };
  }

  // Dormition fast 1–14 August (Julian)
  if (between(8, 1, 8, 14)) {
    const name = 'Госпојински пост';
    if (is(8, 6)) return { type: FAST.FISH, name };
    return { type: weekend ? FAST.OIL : FAST.WATER, name };
  }

  // Nativity fast 15 November – 24 December (Julian)
  if (between(11, 15, 12, 24)) {
    const name = 'Божићни пост';
    if (between(11, 15, 12, 17)) {
      if (weekend || red || is(11, 21)) return { type: FAST.FISH, name };
      return { type: wd === 2 || wd === 4 ? FAST.OIL : FAST.WATER, name };
    }
    return { type: wd === 1 || wd === 3 || wd === 5 ? FAST.WATER : FAST.OIL, name: is(12, 24) ? 'Божићни пост – Бадњи дан' : name };
  }

  // Wednesdays and Fridays through the year
  if (wedFri) {
    if (is(6, 29) || is(8, 15) || red) return { type: FAST.FISH, name: wd === 3 ? 'Среда' : 'Петак' };
    return { type: FAST.WATER, name: wd === 3 ? 'Среда' : 'Петак' };
  }
  return { type: FAST.NONE, name: null };
}

/** Saturday strictly before Mitrovdan (26 October Julian) – "Митровске задушнице". */
export function mitrovdanMemorialJdn(julianYear) {
  let j = jdnFromJulian(julianYear, 10, 26) - 1;
  while (weekdayFromJdn(j) !== 6) j--;
  return j;
}
