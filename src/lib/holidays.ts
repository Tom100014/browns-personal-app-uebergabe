// Gesetzliche Feiertage in Nürnberg (Bayern, evangelisch geprägt — ohne Mariä
// Himmelfahrt). Berechnet die beweglichen Feiertage über das Osterdatum.

function easterSunday(year: number): Date {
  // Anonyme gregorianische (Meeus/Jones/Butcher) Osterformel
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=März, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

export function bavarianHolidays(year: number): { date: string; title: string }[] {
  const easter = easterSunday(year)
  return [
    { date: `${year}-01-01`, title: "Neujahr" },
    { date: `${year}-01-06`, title: "Heilige Drei Könige" },
    { date: iso(addDays(easter, -2)), title: "Karfreitag" },
    { date: iso(addDays(easter, 1)), title: "Ostermontag" },
    { date: `${year}-05-01`, title: "Tag der Arbeit" },
    { date: iso(addDays(easter, 39)), title: "Christi Himmelfahrt" },
    { date: iso(addDays(easter, 50)), title: "Pfingstmontag" },
    { date: iso(addDays(easter, 60)), title: "Fronleichnam" },
    { date: `${year}-10-03`, title: "Tag der Deutschen Einheit" },
    { date: `${year}-11-01`, title: "Allerheiligen" },
    { date: `${year}-12-25`, title: "1. Weihnachtsfeiertag" },
    { date: `${year}-12-26`, title: "2. Weihnachtsfeiertag" },
  ]
}
