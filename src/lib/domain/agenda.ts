/** Utilidades de fecha del panel. Colombia no usa horario de verano: America/Bogota es UTC−5 todo el año. */
const TZ = "America/Bogota";
const OFFSET_H = 5;

/** Componentes de una fecha vista en hora de Colombia. */
export function bogotaParts(d: Date | string | number) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(d));
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return { y: Number(g("year")), m: Number(g("month")), d: Number(g("day")), h: Number(g("hour")), min: Number(g("minute")), wd: g("weekday") };
}

/** Clave `YYYY-MM-DD` del día (en Colombia) al que pertenece el instante. */
export function dayKey(d: Date | string | number) {
  const p = bogotaParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Instante UTC en que empieza el día `YYYY-MM-DD` en Colombia. */
export function startOfDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, OFFSET_H, 0, 0));
}

export const addDays = (key: string, n: number) => dayKey(new Date(startOfDay(key).getTime() + n * 86_400_000 + 12 * 3_600_000));

/** Lunes de la semana (la semana va de lunes a domingo, como en el mockup). */
export function weekStart(key: string) {
  const wd = startOfDay(key).getUTCDay(); // el instante cae a las 05:00 UTC del mismo día calendario → getUTCDay coincide con el día de Colombia
  return addDays(key, -((wd + 6) % 7));
}

export const isDayKey = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(startOfDay(s).getTime());

/** Saludo según la hora de Colombia. */
export function greeting(now: Date = new Date()) {
  const h = bogotaParts(now).h;
  return h < 12 ? "Buen día" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export const longDate = (d: Date | string | number) => {
  const s = new Date(d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const timeLabel = (d: Date | string | number) => new Date(d).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TZ });
