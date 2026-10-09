import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cfg = JSON.parse(readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };

describe("tareas programadas (plan Hobby de Vercel)", () => {
  it("máximo 2 tareas y cada una una sola vez al día (límite del plan Hobby)", () => {
    expect(cfg.crons.length).toBeLessThanOrEqual(2);
    for (const c of cfg.crons) expect(c.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/); // minuto hora * * * = una vez al día
  });
  it("sincroniza el catálogo a las 11:00 y a las 16:00 de Colombia (UTC−5 = 16:00 y 21:00 UTC)", () => {
    const hours = cfg.crons.filter((c) => c.path.startsWith("/api/cron/catalog-sync")).map((c) => c.schedule.split(" ")[1]).sort();
    expect(hours).toEqual(["16", "21"]);
  });
  it("cada ejecución también corre las tareas periódicas (housekeeping), que antes tenían su propia tarea", () => {
    for (const c of cfg.crons) expect(c.path).toContain("housekeeping=1");
    const route = readFileSync(path.resolve(__dirname, "../../src/app/api/cron/catalog-sync/route.ts"), "utf8");
    expect(route).toMatch(/runHousekeeping/);
    expect(route).toMatch(/timingSafeEqual/); // el secreto del cron sigue siendo obligatorio
  });
});
