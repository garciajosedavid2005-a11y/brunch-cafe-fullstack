# PR «Fase 1: salón y comandas» (rama `Brayan` → `main`)

> Texto listo para abrir el pull request en GitHub (no se pudo crear desde la terminal: falta `gh`).
> Enlace: https://github.com/garciajosedavid2005-a11y/brunch-cafe-fullstack/compare/main...Brayan
> `main` todavía no tiene la Fase 0, así que el PR también la incluye (detalle en `docs/PROGRESO.md`).

## Qué trae

Servicio a la mesa desde una tablet: **Mesa → Comanda → Cuenta**. La cocina en vivo (KDS) es de la Fase 2 y el cobro, de la Fase 3.

- **Permisos y sesión (1.1):** 13 permisos de salón asignables por rol. La sesión del personal dura 12 h y la del cliente y el admin, 2 h. Hay un botón «Cambiar de usuario» para tablets compartidas.
- **Zonas y mesas (1.2):** se configuran en Admin › Salón: mesas combinables y activas o inactivas. Hay un salón de ejemplo (`npm run seed:salon`).
- **Estaciones y modificadores (1.3):** cada producto va a Cocina o Barra. Los grupos de opciones pueden ser obligatorios u opcionales, con mínimo, máximo y recargo.
- **Cuentas y comandas (1.4, 1.5):**
  - Una cuenta por mesa ocupada (o por varias mesas unidas), con rondas de ítems.
  - Cada ítem guarda la copia del nombre y del precio del momento.
  - Todo cambio va en una transacción, con control de versión (`409 CUENTA_MODIFICADA`) y un Evento.
  - «Enviar ronda» es idempotente.
  - API en `/api/v1/staff/salon`.
- **Panel de sala `/staff` para tablet (1.6, 1.7):**
  - Plano de mesas por zonas, con el estado en texto e icono.
  - Acciones por permiso: abrir, bloquear, limpiar, mover, unir, separar y transferir.
  - Toma de comanda: menú, modificadores, nota, ronda en curso, envío, anulación con motivo, solicitar y cancelar la cuenta.
  - Se actualiza por consultas periódicas (polling).
- **Correcciones de la revisión (1.6r, 1.6b, 1.7b):**
  - El mesero responsable de una cuenta es quien atiende mesas: el admin opera en `/staff` pero no queda como responsable.
  - El admin entra en `/staff` para anular (F1-19).
  - Los campos y botones miden 44 px o más.
  - En las tablas del admin, la columna de estado queda fija.
- **Domicilio (1.9):** sigue en `Pedido`, con `canal: 'domicilio'` y sin migración. La vista de solo lectura «Cuentas abiertas» reúne salón y domicilio.
- **Fuera de la fase:** para llevar (Fase 6).

## Antes de probar (BD existente)

Sigue «Al traer cambios» en `backend/README.md`: Node 22, `npm install` en backend y frontend, y las migraciones `migrate:1.1`, `migrate:1.3` y `migrate:1.5b`, cada una primero con `--dry-run`. En la BD local de Brayan ya están aplicadas. Después, `npm run seed:base` y, para probar, `npm run seed:dev` y `npm run seed:salon`.

## Cómo se verificó

- Backend: 648 tests. Frontend: 315 tests, `lint` y `build` en verde.
- Capturas de tablet (1024×768 y 768×1024) y de escritorio (1280) de cada ítem en `frontend/capturas/` (no se suben). En la tanda de cierre, ningún control mide menos de 44 px y ninguna columna de estado queda tapada (`MEDIR_TACTIL=1`, `MEDIR_SOLAPES=1`).
- Revisores en cada ítem: reglas del proyecto, backend, seguridad, esquema y visual.

## Para revisar con atención

- Las decisiones marcadas «Claude (a confirmar por Brayan)» en `docs/PROGRESO.md`.
- Los pendientes abiertos en `docs/PROGRESO.md`. Los más relevantes:
  - Rellenar `Pedido.canal` antes de la Fase 6.
  - `requireTLS` del SMTP.
  - Objetivos táctiles del sitio público.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
