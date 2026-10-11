// API de Mercado Pago SIMULADA (solo pruebas locales): responde GET /v1/orders/:id con la Order que la prueba configure.
// Permite probar el flujo completo de verificación (pendiente → aprobado, rechazo, API caída) sin credenciales ni dinero reales.
import { createServer } from "node:http";

export async function startMpMock(port = 3997) {
  const orders = new Map();
  const state = { down: false, calls: [] };
  const server = createServer((req, res) => {
    const m = /^\/v1\/orders\/([A-Z0-9]+)$/.exec(req.url ?? "");
    state.calls.push(`${req.method} ${req.url}`);
    if (state.down) {
      res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ message: "temporarily unavailable" }));
      return;
    }
    if (req.method === "GET" && m && /^Bearer TEST-/.test(req.headers.authorization ?? "")) {
      const o = orders.get(m[1]);
      if (!o) {
        res.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" }).end("{}");
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve));
  return {
    base: `http://127.0.0.1:${port}`,
    state,
    /** Define/actualiza la Order simulada (mismo formato que la API real). */
    setOrder: (id, order) => orders.set(id, { id, currency: "COP", integration_data: { application_id: "1111111111111111" }, ...order }),
    callsFor: (id) => state.calls.filter((c) => c.endsWith(`/${id}`)).length,
    setDown: (v) => {
      state.down = v;
    },
    stop: () => server.close(),
  };
}
