# Rediseño UX/UI — estado (2026-10-06)

Documento complementario de `docs/UX-REDESIGN-AUDIT.md`. Resume **lo que ya está aplicado**, lo verificado y lo que sigue pendiente. Es un avance por fases, no el cierre del rediseño completo.

## 1. Resumen
Se aplicó el patrón de navegación y de contenido de los mockups aprobados (riel oscuro en escritorio; cabecera compacta + barra inferior en móvil) al **panel del personal** y, con los mismos componentes, a la **app del cliente**. Se rehicieron Inicio, Tickets, Agenda (Día/Semana/Mes), CRM (tablero), Tienda (Pedidos/Productos), Avisos y «Más», y se crearon *Clientes* y *Cotizaciones* (existían en el mockup y no en la app) con datos reales. No se tocó seguridad, RLS, auth, MFA, roles, proxy, Server Actions de negocio ni integraciones.

## 2. Pantallas modificadas
Personal: `/b` (Inicio), `/b/tickets`, `/b/clientes` (nueva), `/b/cotizaciones` (nueva), `/b/agenda`, `/b/crm`, `/b/tienda`, `/b/pedidos` (pestañas), `/b/mas` (nueva), `/avisos`.
Cliente: `/c` (Inicio: «Lo que sigue»), `/c/mas`, y el contenedor de todas las rutas `/c/*`.

## 3. Componentes
Creados: `AppNav` (`RailNav`, `BottomNav`), `AppTopBar`, `StaffShell`, `ClientShell`, `SignOut` (ícono y fila), `kit` (`Avatar`, `StatCard`, `ListRow`, `FilterChip`, `ChipRow`, `SearchField`, `Section`, `TextLink`, `PrimaryLink`, `SegmentTabs`), set `NavIcon` (21 íconos), `lib/domain/agenda` (fechas en hora de Colombia, con pruebas).
Retirados por duplicados: `AppHeader`, `StaffNav`, `ClientNav`.
Tokens nuevos en `globals.css`: radios, sombras, colores semánticos (ok/warn/danger/info), movimiento (`.press`, `.enter`, 150–300 ms, anulado con `prefers-reduced-motion`).

## 4. Uso del skill `apple-design`
Se instaló en `.claude/skills/apple-design` y se leyeron antes de decidir: `tab-bars.md` (evitar pestañas desbordadas → riel/barra con «Más» agrupado), `sidebars.md`, `layout.md` (jerarquía, áreas seguras), `accessibility.md` (objetivos ≥ 44 pt, contraste, movimiento reducido), `loading.md`, `lists-and-tables.md`, `search-fields.md`. Apple HIG guía ergonomía y accesibilidad; la identidad (Manrope, naranja, negro) y la composición son las del mockup.

## 5. Comparación con los mockups
Capturas generadas por la prueba `05-panel-ux` en `tests/e2e/.out/ux-*.png` (escritorio 1440×900 y móvil 390×844). Coinciden: riel de 84 px con iconos y etiquetas, campana con contador, avatar con iniciales, chip «Administración» (solo SUPERADMIN), tarjeta de cifras oscura, «Requieren acción» y «Agenda de hoy», chips con contador, rejilla semanal con carriles para eventos que se cruzan, tablero CRM por columnas, tabla de productos con insignia de stock, lista de avisos con punto naranja.

## 6. Datos reales y datos mock
Todo proviene de consultas a Supabase bajo RLS (el técnico ve solo lo suyo). Cuando no hay datos se muestra un estado vacío con texto útil. **Datos mock introducidos en producción: 0** (búsqueda de `mock|fake|dummy|lorem|hardcod|seed` en los 22 archivos de `src/` modificados: sin coincidencias). Los eventos `[E2E]` de la agenda se insertan solo en la base local de pruebas.

## 7. Verificación
- `npm run check`: typecheck, lint (0 errores), 380 tests, build — OK.
- E2E (local, build de producción): escenarios 01–05. El 05 valida riel/barra inferior, ausencia de desbordes, objetivos táctiles, menús por rol (técnico sin Tienda/Reportes/Administración, rutas administrativas bloqueadas por el servidor), búsqueda, agenda y cierre de sesión.

## 8. Accesibilidad y rendimiento
Objetivos táctiles de navegación ≥ 44 px (verificado en la prueba), `aria-current`, `aria-label` en íconos, enlace «Saltar al contenido» conservado, foco visible, filtros como enlaces (funcionan sin JavaScript), vistas de agenda renderizadas en servidor. Los filtros y búsquedas del panel se resuelven en el servidor, sin estado de cliente adicional.

## 9. Fase 2 aplicada (2026-10-06)
Nuevo `components/ui/detail.tsx`: `StatusHero` (tarjeta oscura con código, estado y mensaje), `ProgressSteps` (avance del servicio para el cliente), `Timeline` (historial vertical), `InfoList` y `Panel`.
Rehechas: detalle de ticket del cliente (héroe + avance + historial) y del personal (héroe, fichas de cliente/equipo, historial), lista «Mis servicios», Tienda (chips), Reportes (cifras + barras proporcionales sin librerías), Usuarios (avatar), Privacidad (buscador común) y filtros del catálogo de servicios. Cargas y errores: `loading.tsx`/`error.tsx` existentes en `/b` y `/c`; háptica ya integrada en `SubmitButton` (respeta movimiento reducido).
`npm run check` OK. Sin E2E completo (a petición).

## 10. Pendiente real
Cotización/firma, pagos, documentos, equipos, carrito, perfil y ayuda del cliente; legal, comercial, cobertura, ajustes y proyectos del personal (heredan la base, sin rehacer); contraste AA con herramienta automática; capturas comparativas tras la próxima ejecución del E2E.
