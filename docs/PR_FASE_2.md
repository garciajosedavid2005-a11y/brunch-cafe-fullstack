# PR «Fase 2: cocina y barra» (rama `Brayan` → `main`)

> Texto listo para abrir el pull request en GitHub (no se pudo crear desde la terminal: falta `gh`).
> Enlace: https://github.com/garciajosedavid2005-a11y/brunch-cafe-fullstack/compare/main...Brayan
> `main` todavía no tiene las fases 0 y 1, así que el PR también las incluye (texto de la Fase 1 en `docs/PR_FASE_1.md`; detalle en `docs/PROGRESO.md`).

## Qué trae

La cocina y la barra reciben las comandas en una pantalla (KDS), marcan lo que preparan y el mesero se entera al momento de lo que está listo para servir. El cobro es de la Fase 3.

- **Permisos de cocina y barra (2.1):** `kds:ver`, `item:preparar`, `pedido:preparar`, `item:servir`, `producto:agotar` y `producto:reactivar`, asignables por rol.
- **Estados del ítem (2.2):**
  - Recorrido «enviado → en preparación → listo → servido», con los tiempos de cada paso y un Evento con quién lo marcó.
  - «Deshacer» durante 10 s para quien lo marcó; después, solo el admin, con motivo.
  - Lo que marca la cocina no provoca `409 CUENTA_MODIFICADA` en la tablet del mesero.
- **Cola por estación (2.3):** rondas enviadas y pedidos a domicilio con líneas de esa estación, de la más antigua a la más nueva. Cada línea del domicilio guarda su estación.
- **Tiempo real (2.4):**
  - Server-Sent Events en `GET /api/v1/staff/eventos`, con permiso por canal (`plano`, `estacion:<codigo>`, `cuenta:<id>`, `mesero:<id>` y `catalogo`).
  - Los avisos llevan solo ids y el polling queda de respaldo.
  - Al cerrar sesión, los flujos se cierran al momento.
- **Pantalla KDS `/kds` (2.5, 2.5b):**
  - Para tablet y TV, con estaciones por rol (cocina → Cocina, barista → Barra).
  - Tiempo de espera con texto, icono y color.
  - «Empezar», «Listo», «Todo listo» y «Deshacer».
  - Sonido activado por defecto, y los anulados tachados con su motivo.
- **Aviso al mesero y «Servir» (2.6):**
  - Franja «Listo para servir» en `/staff` con las cuentas del propio mesero, insignia en la mesa y en la cuenta, y «Servir».
  - El sonido está apagado por defecto en `/staff`.
- **Límite de errores (2.6b):**
  - Si una sección de `/staff`, `/kds` o el admin no puede dibujarse, muestra «Algo salió mal en esta sección» con «Recargar» en lugar de dejar la pantalla en blanco.
  - Las capturas fallan con errores de consola y `npm run humo` revisa el frontend en marcha.
- **Agotados (2.7):**
  - Pestaña «Agotados» en `/staff` y botón en `/kds`, para productos y opciones.
  - Agotan cocina, barista, mesero y admin; reactivan cocina, barista y admin.
  - Queda un Evento y el cambio llega al momento a la toma de comanda, al carrito y al menú.
- **Límites por IP del local (2.8):** como las tablets comparten IP, la recuperación y el restablecimiento de contraseña cuentan por persona, con un tope por IP. `/kds` no se cierra por inactividad (F2-6).
- **Correcciones (2.0b, 2.0c, 2.4b, 2.5c, 2.5d, 2.5e):** navbar sobre fondos claros, paleta del panel, logo y favicon nuevos (también en pestañas oscuras), y el verificador del salón sin `validateSync`.

## Antes de probar (BD existente)

Sigue «Al traer cambios» en `backend/README.md`. Hay dos migraciones nuevas, cada una primero con `--dry-run`:

- `migrate:2.1`: permisos de cocina y barra.
- `migrate:2.5b`: estaciones del KDS en los roles.

En la BD local de Brayan ya están aplicadas, con respaldo previo. Después, `npm run seed:base` y, para probar, `npm run seed:dev`, que crea `cocina.dev` para `/kds`.

## Cómo se verificó

- **Tests:** 907 en el backend y 482 en el frontend, con `lint` y `build` en verde.
- **Capturas** (en `frontend/capturas/`, no se suben):
  - De cada ítem, en tablet (1024×768 y 768×1024).
  - De cierre, también en TV (1920×1080).
  - Una vista con dos pantallas reales: la cocina marca «Listo» y el «Servir» aparece en la tablet del mesero sin recargar.
  - Las capturas fallan si una pantalla queda en blanco o registra errores de consola.
- **Revisores en cada ítem:** reglas del proyecto, backend, seguridad, esquema y visual.

## Para revisar con atención

- **Decisiones marcadas «Claude (a confirmar por Brayan)»** en `docs/PROGRESO.md`. Las que más pesan:
  - El contrato de `POST /staff/items/:itemId/estado` (2.2).
  - `versionCocina` aparte de la versión de la cuenta (2.2).
  - La entidad `modificador` en los Eventos de opciones agotadas (2.7).
  - El canal `catalogo` (2.7).
  - Los topes de los límites por IP (2.8).
- **Pendientes abiertos** en `docs/PROGRESO.md`:
  - Admin › Productos y Admin › Modificadores pueden reactivar un agotado sin Evento (2.7).
  - Falta un enfriamiento por cuenta en la recuperación de contraseña, y hay que fijar `TRUST_PROXY` en producción (2.8).
  - Los avisos en vivo funcionan con una sola instancia del backend (bus en memoria).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
