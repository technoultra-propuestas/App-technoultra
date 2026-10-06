# Auditoría UX/UI — TechnoUltra (2026-10-06)

Alcance: la aplicación existente (no se crea otra). Fuentes: mockups aprobados (`mockups/panel supersu o crm/vista pc` y `vista mobile`, 14 capturas), identidad TechnoUltra (Manrope, #FF8A00, #FF9F2A, #000, #121212, #F6F6F5, #5C5C59, #FFF), guías del skill `apple-design` (HIG; citadas por archivo y encabezado) y el código actual.

**Regla de contenido:** el mockup define *cómo se ve*; la base de datos define *qué hay*. Los nombres, tickets, cifras y precios que aparecen en las capturas son de ejemplo y **no** se copian a la aplicación.

## 1. Qué muestran los mockups (resumen verificable)

| Elemento | Escritorio | Móvil |
|---|---|---|
| Navegación | Riel lateral oscuro (#121212) de ~84 px, iconos + etiqueta: Inicio, Tickets, Clientes, Cotizar, Agenda, CRM, Tienda, Reportes, Más; abajo campana con contador, avatar con iniciales y salir | Cabecera oscura compacta (logo + campana) y barra inferior de 5: Inicio, Tickets, Agenda, CRM, Más |
| Contenido | Columna centrada (~1290 px), título 30 px extra-bold, acción principal naranja arriba a la derecha | Tarjetas a ancho completo, título + botón naranja |
| Inicio | Saludo con fecha, botón «Nuevo ticket», 4 tarjetas de cifras (la primera oscura), «Requieren acción» (lista con icono, título, detalle, flecha) y «Agenda de hoy» | Igual en una columna (cifras 2×2) |
| Listas | Buscador + chips con contador, filas en tarjeta con insignia de estado | Igual, chips con desplazamiento horizontal |
| Clientes | Cuadrícula de tarjetas con iniciales, celular, nº de equipos y tickets | — |
| Cotizaciones | 3 cifras + tabla (código, cliente/ticket/equipo, total, estado) | — |
| Agenda | Navegación ‹ Hoy ›, Día/Semana/Mes, leyenda por colores, rejilla semanal con «hoy» resaltado | Día = lista de eventos; Semana = rejilla con scroll |
| CRM | Tablero por columnas (Pendiente … No responde) con filtros Todos/Mantenimientos/Garantías/Proyectos | — |
| Tienda | Pestañas Pedidos/Productos, tabla con icono, categoría, precio, garantía, instalación y stock | — |
| Avisos | Lista con punto naranja de «no leído» y «Marcar todas leídas» | — |
| Chip «Administración» | Flotante abajo a la derecha (acceso a lo administrativo) | Flotante sobre la barra inferior |

## 2. Estado actual (hallazgos del código)

Archivos revisados: `src/app/b/layout.tsx`, `src/components/ui/{AppHeader,StaffNav,ClientNav,layout,form,icons}.tsx`, `src/app/globals.css`, `src/app/b/page.tsx`, rutas `/b/*` y `/c/*`.

- **Un solo contenedor de 1040 px** y cabecera + fila de «pastillas» para todo el personal. No hay riel lateral ni barra inferior en el CRM.
- **`StaffNav` tiene hasta 17 pestañas** en una fila con desplazamiento horizontal (SUPERADMIN): choca con HIG `tab-bars.md › Best practices` («Avoid overflow tabs») y esconde secciones.
- **No existen** las vistas *Clientes* ni *Cotizaciones* del mockup, aunque los datos sí existen (`customers`, `quotes`).
- **Panel de inicio** (`/b`) casi vacío: dos cifras y un botón; el mockup tiene «Requieren acción» y «Agenda de hoy».
- **Tokens incompletos:** solo colores y fuente; radios (14/16/20), sombras, movimiento y estados repetidos «a mano» en cada archivo (`rounded-[14px]`, `text-[#9A2B1E]`, etc.).
- **Componentes duplicados:** `Card`/`EmptyState`/`LinkButton`/`Select`/`Textarea` en `layout.tsx`, `Field`/`SubmitButton`/`Alert` en `form.tsx`; botones de acción escritos a mano en decenas de formularios (`rounded-2xl bg-brand …`). No hay `FilterChip`, `SearchField`, `StatCard`, `ListItem`, `StatusBadge` reutilizables (la insignia vive en `layout.tsx`).
- **Móvil del personal:** el menú de pastillas ocupa el alto de pantalla y se desplaza; no hay barra inferior ni zona de pulgar.
- **Bien:** safe areas (`pt-safe`/`pb-safe`), `100dvh`, `prefers-reduced-motion`, foco visible naranja, objetivos táctiles ≥ 44 px en la mayoría de controles, enlace «Saltar al contenido».

## 3. Tabla por pantalla

Leyenda: ✅ alineado · ◐ parcial · ✗ no alineado / no existe. «HIG» cita archivos del skill.

### Personal (`/b`)

| Pantalla | Desktop | Mobile | Mockup | Apple HIG | Problemas | Mejora |
|---|---|---|---|---|---|---|
| Shell del CRM | ✗ | ✗ | Riel + cabecera oscura + barra inferior | `sidebars.md`, `tab-bars.md` | 17 pestañas en fila; sin riel ni barra inferior | `StaffShell`: riel (≥ lg), cabecera compacta y barra de 5 (< lg); «Más» agrupa el resto |
| Inicio `/b` | ◐ | ◐ | Saludo + cifras + «Requieren acción» + «Agenda de hoy» | `layout.md › Visual hierarchy` | Solo 2 cifras; sin acciones sugeridas ni agenda | Reconstruir con consultas reales (tickets por estado, citas de hoy) |
| Tickets `/b/tickets` | ◐ | ◐ | Buscador + chips con contador + filas | `search-fields.md`, `lists-and-tables.md` | Revisar filtros/contadores y búsqueda | `SearchField` + `FilterChip` con contadores reales |
| Ticket detalle | ◐ | ◐ | (sin mockup) | `layout.md`, `alerts.md` | Página larga con muchas tarjetas; acciones de estado a la derecha | Reordenar jerarquía sin tocar acciones ni máquina de estados |
| Clientes | ✗ | ✗ | Cuadrícula con iniciales | `lists-and-tables.md` | La vista no existe | Nueva `/b/clientes` con datos reales (RLS del rol) |
| Cotizaciones | ✗ | ✗ | Cifras + tabla | `lists-and-tables.md` | La vista no existe | Nueva `/b/cotizaciones` con datos reales |
| Agenda | ◐ | ◐ | Día/Semana/Mes + leyenda por colores | `layout.md` | Mantener eventos reales; revisar leyenda y densidad | Aplicar estilo del mockup |
| CRM | ◐ | ◐ | Tablero por columnas | `lists-and-tables.md` | Ajustar tarjetas/columnas | Estilo del mockup, estados reales |
| Tienda / Pedidos | ◐ | ◐ | Pestañas + tabla | `lists-and-tables.md` | Productos y pedidos en rutas separadas | Pestañas Pedidos/Productos comunes |
| Avisos `/avisos` | ◐ | ◐ | Punto naranja + «Marcar todas leídas» | `notifications.md` | Revisar no leídas y destino del clic | Estilo del mockup |
| Reportes, Servicios, Cobertura, Legal, Comercial, Privacidad, Ajustes, Usuarios, Seguridad, Proyectos, Pedidos | ◐ | ◐ | Sin mockup (entran por «Más») | `settings.md`, `lists-and-tables.md` | Accesibles solo con la fila de pastillas | Centro «Más» (`/b/mas`) agrupado por área |

### Cliente (`/c`) y público

| Pantalla | Desktop | Mobile | Mockup | Apple HIG | Problemas | Mejora |
|---|---|---|---|---|---|---|
| Shell del cliente | ◐ | ✅ | Sin mockup | `tab-bars.md` | Cabecera distinta a la del personal | Unificar tokens y cabecera con el personal |
| Inicio, Servicios, Solicitar, Tickets, Detalle, Cotización/Aprobación, Pagos, Documentos, Equipos, Tienda, Pedidos, Perfil | ◐ | ◐ | Sin mockup | `layout.md`, `forms` (`entering-data.md`) | Estilos manuales repetidos | Migrar a los componentes del sistema |
| Auth, onboarding, legal, sitio público | ✅ | ✅ | Diseño aprobado previo | — | — | Solo ajustes de tokens |

## 4. Prioridades

### Critical
- Ninguno de seguridad: el rediseño **no** toca RLS, auth, MFA, roles, proxy, Server Actions ni secretos.

### High
1. Shell del personal sin patrón de navegación del mockup (riel/barra inferior) y con 17 pestañas en fila.
2. Faltan vistas *Clientes* y *Cotizaciones* aunque los datos existen.
3. Panel de inicio sin acciones («Requieren acción») ni agenda del día.

### Medium
4. Tokens y componentes duplicados (botones, insignias, chips, buscador, tarjetas de cifras).
5. Estados vacío/carga/error heterogéneos entre pantallas.
6. Consistencia cliente ↔ personal (cabecera, insignias, espaciado).

### Low
7. Microinteracciones (150–300 ms), retroalimentación háptica donde exista soporte, textos de error más accionables.
8. Rendimiento: revisar hidratación de componentes cliente que podrían ser de servidor.

## 5. Plan por fases

1. **Auditoría** (este documento).
2. **Design system:** tokens (radios, sombras, movimiento) y componentes reutilizables: `Button`, `StatCard`, `ListItem`, `StatusBadge`, `FilterChip`, `SearchField`, `PageHeader`, `EmptyState`, `Avatar`.
3. **Shell:** riel + cabecera + barra inferior del personal; `/b/mas`; mismos tokens en el cliente.
4. **Pantallas:** Inicio, Tickets, Clientes, Cotizaciones, Agenda, CRM, Tienda, Avisos y el resto de rutas, de forma progresiva.
5. **Verificación:** lint, typecheck, tests, build, E2E, revisión visual contra los mockups (escritorio y móvil) y búsqueda de datos de ejemplo en producción.

Restricción permanente: **datos falsos introducidos en producción = 0**.
