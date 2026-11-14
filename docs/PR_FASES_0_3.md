# PR «Brunch Café: POS de servicio a la mesa (Fases 0 a 3)» (rama `Brayan` → `main`)

> Texto final para abrir el pull request en GitHub. Enlace:
> https://github.com/garciajosedavid2005-a11y/brunch-cafe-fullstack/compare/main...Brayan
> Reúne todo el trabajo de la rama: `main` todavía no tiene ninguna de estas fases. Los textos `docs/PR_FASE_1.md` y `docs/PR_FASE_2.md` quedan como históricos. El detalle de cada ítem, con sus decisiones y commits, está en `docs/PROGRESO.md`.

## Resumen

Brunch Café pasa de ser una web de pedidos a domicilio a un **sistema de servicio a la mesa**:
- el mesero toma la comanda en una tablet;
- la cocina y la barra la ven al instante en su pantalla (KDS);
- el mesero se entera de lo que está listo;
- la caja cobra con propina y pago mixto, y emite un comprobante interno.

El sitio del cliente (menú, domicilios, reservas y reseñas) se conserva y se hizo más seguro. El proyecto se cierra con la Fase 3; las Fases 4 a 6 quedan como trabajo futuro.

**Flujo completo:** mesa → comanda → cocina → servir → pedir la cuenta → cobrar → comprobante → mesa por limpiar.

## Fase 0 · Bases (seguridad, datos y orden)

- **Infraestructura:**
  - Tests con Vitest y Supertest sobre un MongoDB en memoria con réplica, de modo que las transacciones son reales.
  - ESLint 9, logger estructurado (pino).
  - Errores con un único formato `{ error: { code, message, details } }`.
- **Autenticación:**
  - Cookie `httpOnly`, `sameSite` y `secure` según el entorno, en lugar del token en `localStorage`.
  - Mensajes genéricos, `helmet`, CORS por lista y límites de intentos.
  - Recuperación de contraseña sin revelar qué correos existen.
- **Permisos desde la base de datos (RBAC):**
  - Permisos asignables por rol desde Admin › Roles.
  - `requirePermission` en todas las rutas.
  - Revocación inmediata al cambiar un rol o desactivar a alguien.
  - El frontend decide por permisos, nunca por el nombre del rol.
- **Datos:**
  - Catálogo en MongoDB con precios enteros en COP.
  - Referencias por `ObjectId`.
  - Estados como enums con máquinas de transición (quién puede y si exige motivo).
  - Registro inmutable `Evento` de cada cambio.
  - Fechas en UTC, que se muestran en `America/Bogota`.
- **Consistencia:** `conTransaccion()` en toda escritura múltiple e `Idempotency-Key` en las operaciones que no deben repetirse.
- **Orden:**
  - API versionada `/api/v1`.
  - Backend organizado por dominios (`src/modulos/*`).
  - Se limpió el código heredado.
  - Reseñas verificadas: la de un producto, solo con un pedido recibido que lo incluya; la general, con un pedido recibido o una reserva completada.
  - Confirmación de reservas por correo (SMTP).

## Fase 1 · Salón y comandas

- **Zonas y mesas:**
  - Se configuran en Admin › Salón: mesas combinables, activas o inactivas.
  - Hay un salón de ejemplo.
- **Estaciones y modificadores:**
  - Cada producto va a Cocina o Barra.
  - Grupos de opciones obligatorios u opcionales, con mínimo, máximo y recargo.
- **Cuentas y comandas:**
  - Una cuenta por mesa, o por mesas unidas, con rondas.
  - Cada ítem guarda la copia del nombre y del precio del momento.
  - Control de versión (`409 CUENTA_MODIFICADA`) para que dos tablets no se pisen.
  - Envío idempotente.
- **Panel del personal `/staff` (tablet):**
  - Plano de mesas.
  - Acciones por permiso: abrir, bloquear, limpiar, mover, unir, separar y transferir.
  - Toma de comanda con modificadores, notas, anulación con motivo y solicitud de la cuenta.
- **Domicilio:** sigue en `Pedido`, con su horario y direcciones flexibles. «Cuentas abiertas» reúne salón y domicilio.

## Fase 2 · Cocina y barra (KDS)

- **Recorrido del ítem:**
  - Enviado → en preparación → listo → servido, con el tiempo de cada paso y quién lo marcó.
  - «Deshacer» durante 10 s; después, solo el administrador y con motivo.
- **Pantalla `/kds`:**
  - Para tablet y TV, con la estación según el rol.
  - Cola de la más antigua a la más nueva, con los domicilios incluidos.
  - Tiempo de espera con texto, icono y color.
  - «Empezar», «Listo», «Todo listo» y sonido.
- **Tiempo real:**
  - Server-Sent Events con permiso por canal.
  - Las consultas periódicas quedan de respaldo.
  - Los flujos se cierran al cerrar sesión.
- **Aviso al mesero:** «Listo para servir» con la mesa; abre la cuenta y «Servir» va junto a cada ítem.
- **Agotados:** agotar y reactivar productos y opciones desde la operación; el cambio llega al momento al menú y a la comanda.
- **Robustez:**
  - Límite de errores por sección: nunca una pantalla en blanco.
  - Límites por IP pensados para tablets que comparten la red del local.

## Fase 3 · Cobro en caja (mínima)

- **Permiso `cuenta:cobrar`:** cobran el cajero y el administrador; el mesero no (F3-1). Se aplicó con una migración.
- **Caja en `/staff`:**
  - «Por cobrar» lista solo las cuentas pedidas (F3-6), en vivo por el canal `caja`.
  - «Cobradas hoy» muestra los cobros del día en hora de Bogotá.
- **Cobro (`POST /api/v1/staff/caja/cuentas/:id/cobrar`):**
  - Propina voluntaria con atajos «10 %» y «Sin propina» (F3-3).
  - Efectivo, tarjeta y transferencia, combinables (F3-2).
  - Cambio del efectivo.
  - «Cobrar» siempre visible en una barra fija abajo.
  - Todo en una transacción: cuenta cerrada, mesas por limpiar, comprobante y Evento.
  - Idempotente, sin doble cobro.
- **Comprobante interno:**
  - Consecutivo `CI-000001`, sin reinicio y sin huecos (F3-4).
  - Inmutable, con «Consumo + Propina = Total pagado».
  - Leyendas «Precios con impuestos incluidos» (F3-5) y «Documento no válido como factura electrónica».
  - Imprimible en tirilla de 80 mm.
- **Plano ilustrado (propuesta B):**
  - Mesas con sillas y anillo de tiempo.
  - Mesas unidas dibujadas como una sola.
  - Objetivos táctiles de 44 px o más, contraste de 4,5:1 o más y respeto de «reducir movimiento».
- **Pulido (3.5):**
  - Un barrido de la API comprueba que ninguna ruta responde 500 ante entradas inválidas.
  - Seed de demostración, guía de la demo y manual de uso.

## Seguridad

- **Autorización:**
  - Permiso en cada ruta.
  - Sin IDOR: el cliente solo ve lo suyo.
  - El permiso de cada canal en vivo se vuelve a comprobar con los permisos actuales.
  - Los esquemas Zod son estrictos: no se acepta asignación masiva.
- **Sesiones:**
  - Cookie `httpOnly`, revocación inmediata y versión del token.
  - 12 h para el personal y 2 h para clientes y administradores.
- **Contraseñas:**
  - bcrypt.
  - Enlaces de un solo uso: 30 min para recuperar y 24 h para crear la contraseña.
  - Espera de 60 s entre correos.
  - Límites por IP y por correo.
- **Dinero:**
  - Montos enteros en COP, calculados en el servidor.
  - Los pagos deben cuadrar exactamente.
  - Comprobante y Eventos inmutables, consecutivo transaccional.
- **Errores:**
  - Un solo formato, sin trazas ni datos internos en las respuestas.
  - Los 500 van al log con su causa.
- **Producción:**
  - `TRUST_PROXY` documentado.
  - Las semillas de prueba (`seed:dev`, `seed:demo`) se niegan a correr en producción.
  - Ningún secreto en el código.
- **Revisión:** en cada ítem pasaron los revisores de reglas, backend, seguridad, esquema y visual. Lo bloqueante se corrigió antes de cada commit.

## Tests

| | Archivos | Tests |
|---|---|---|
| Backend | 76 | 950 |
| Frontend | 85 | 509 |
| **Total** | **161** | **1459** |

Antes de cada commit se ejecutaron `npm test`, `npm run lint` y `npm run build` en backend y frontend; desde la Fase 2, también `npm run humo` (el frontend en marcha sin pantallas en blanco ni errores de consola). Los cambios visuales se revisaron con capturas en tablet (1024×768 y 768×1024). Las capturas no se suben al repositorio.

## Cómo probar

1. **Requisitos:** Node 22 LTS y MongoDB con réplica (las transacciones la necesitan). Ejecuta `npm install` en `backend/` y en `frontend/`.
2. **Base de datos existente:** sigue «Al traer cambios» en `backend/README.md`. Las migraciones van en orden, cada una primero con `--dry-run` y con su `--down`. La última es `migrate:3.1`.
3. **Datos de prueba:** en una base de datos de desarrollo, `npm run seed:demo` lo prepara todo: base, menú, modificadores, salón de ejemplo, usuarios `*.dev@brunchcafe.test` (contraseña de `DEV_USUARIOS_PASSWORD`) y un salón en servicio con cuentas, cocina y cobros. Por partes: `seed:base`, `seed:menu`, `seed:modificadores`, `seed:salon` y `seed:dev`.
4. **Arranque:** `npm run dev` en `backend/` (puerto 4000) y en `frontend/` (puerto 5173).
5. **Recorrido:** `docs/GUIA_DEMO.md` trae un guion de 5 a 7 minutos con una ventana por rol. `docs/MANUAL_USUARIO.md` explica cada tarea por rol.
6. **Tests:** `npm test` en cada carpeta.

## Trabajo futuro

- **Fase 4 · Reservas conectadas al salón:** asignar mesa a la reserva, llegada y lista de espera.
- **Fase 5 · Inventario y reportes:** insumos y recetas con descuento al preparar; ventas, mermas por anulación y tiempos de cocina (ya se registran).
- **Fase 6 · Domicilio y fidelización** (con un rol nuevo de repartidor): para llevar, domicilio dentro del motor de cuentas, repartidores y puntos.
- **Plano C:** plano arquitectónico con la posición real de cada mesa, editable en el admin.
- **Facturación electrónica DIAN:** proveedor tecnológico, CUFE, XML UBL 2.1 y resolución de numeración. Hoy el comprobante es interno.
- **Turnos de caja:** apertura con base, arqueo y cierre (`caja:abrir` y `caja:cerrar`), anulación de comprobantes y notas crédito.
- **Impresora térmica:** impresión directa (ESC/POS) y apertura del cajón; hoy se imprime desde el navegador en tirilla de 80 mm.
- **Otros pendientes** (en `docs/PROGRESO.md`):
  - división de la cuenta;
  - cobro de domicilios en la caja (hoy siguen contra entrega);
  - impuestos y descuentos desglosados;
  - bus de avisos para varias instancias del backend;
  - navegación con flechas en los métodos de pago.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
