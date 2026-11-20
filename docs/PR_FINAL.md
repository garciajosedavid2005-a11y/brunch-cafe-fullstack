# Brunch Café: de web de pedidos a POS de servicio a la mesa (Fases 0 a 6)

## Resumen

Esta rama (`Brayan` → `main`, unos 270 commits) convierte el sitio de pedidos de Brunch Café en un punto de venta para servicio a la mesa. Incluye salón con comandas por rondas, pantalla de cocina y barra en vivo, caja completa con turnos y notas crédito, reservas conectadas al plano, inventario con recetas que se descuenta solo, reportes, domicilios con repartidor, cuentas para llevar y fidelización (puntos y cumpleaños).

La guía fue la auditoría de `docs/auditoria/` y el diagnóstico de `docs/DIAGNOSTICO_FASE_A.md`. El estado de cada ítem, las decisiones (fecha · decisión · quién) y los pendientes están en `docs/PROGRESO.md`.

## Qué trae cada fase

**Fase 0 · Bases.** Tests (Vitest, Supertest y MongoDB en memoria en replica set), ESLint, errores con formato único `{ error: { code, message, details } }` y logs con pino. Sesión en cookie `httpOnly` con revocación. Roles y permisos por clave guardados en la BD (RBAC) y primer admin desde el seed. Catálogo en MongoDB, referencias `ObjectId`, fechas en UTC con Bogotá solo para mostrar y estados con código, transiciones y bitácora `Evento`. Transacciones con `Idempotency-Key`, API versionada `/api/v1` y código ordenado por dominios. Se limpiaron las colecciones heredadas. Recuperación de contraseña y confirmación de reservas por SMTP.

**Fase 1 · Salón y comandas.** Zonas y mesas configurables, estaciones (Cocina y Barra) y modificadores con recargo. Cuenta con rondas, anulación con motivo, transferencias, mesas unidas, movidas y bloqueadas. Plano de mesas en tablet y toma de comanda en `/staff`. Alta de personal con el enlace «Crea tu contraseña». Domicilio con dirección flexible y opciones del plato. Cuentas abiertas en un solo listado.

**Fase 2 · Cocina y barra (KDS).** Estados del ítem con sus tiempos y «Todo listo». «Deshacer» dentro de 10 s. Cola por estación en `/kds` con alertas de tiempo y domicilios por estación. Tiempo real con Server-Sent Events por canal, sin datos sensibles. El mesero recibe el aviso «Listo para servir» y marca «servido». Agotar y reactivar productos y opciones durante el servicio. Límites por IP del local y plano visual del salón.

**Fase 3 · Cobro en caja.** Pantalla Caja con propina y pago mixto (efectivo, tarjeta y transferencia) y cambio calculado. Comprobante interno `CI-000001` consecutivo, inmutable e imprimible en tirilla de 80 mm. Pulido visual, opciones por defecto y baja de cuentas del personal.

**Fase 3b · Caja completa.** Turno con base y arqueo por método. División de la cuenta en partes iguales o por ítems. Anulación con nota crédito `NC-000001`. Cobro de domicilios al recibirlos, una sola vez.

**Fase 4 · Reservas en el salón.** Mesa asignada sin solapamientos y aforo por franja. Mesa apartada con anticipación configurable. «Sentar» abre la cuenta y existe el no-show. Lista de espera, aviso en vivo de reservas, cierre automático de reservas y esperas vencidas.

**Fase 5 · Inventario y reportes.** Insumos con libro de movimientos inmutable y costo promedio ponderado. Recetas por producto y por opción. Descuento automático al enviar la ronda o confirmar el domicilio, y devolución o merma al anular. Agotado automático. Proveedores, órdenes de compra y recepciones con lotes y vencimientos, más alertas de stock y vencimiento. Reportes de ventas (día, franja, producto, categoría, canal, mesero y método) y de operación (rotación, tiempos por estación y margen), con CSV.

**Fase 6 · Domicilio y fidelización.** Canal del pedido. Repartidor asignado, que solo ve, lleva y cobra lo suyo. Cuentas para llevar. Perfil del cliente con fecha de nacimiento (fija tras el primer registro; solo el admin la corrige), alergias, preferencias, hasta 5 direcciones y consentimiento de datos versionado (Ley 1581). Alergias visibles al personal al identificar al cliente. Puntos (1 por cada $1.000; canje de 100 = $10.000) con libro inmutable. 10 % de cumpleaños una vez al año. Descuentos en el comprobante y en los reportes (ventas netas).

**Cierre.** README de la raíz y del backend actualizados, manual de usuario por rol, guion de la demo y `seed:demo` con los datos de las Fases 3b a 6.

## Seguridad

- **Autenticación:** cookie `httpOnly` con versión de token. Desactivar, cambiar el rol o cambiar la contraseña corta el acceso en la siguiente petición. El personal y el admin cierran todas sus sesiones al salir. Hay límites de intentos en login, registro, recuperación y búsqueda de clientes.
- **Autorización:** `requirePermission` por clave en cada ruta, nunca por nombre de rol, y comprobada antes de leer datos. El alcance es propio: el cliente solo ve lo suyo (un id ajeno da 404), el repartidor solo sus domicilios y la cocina solo su estación. Nadie otorga un rol con permisos que no tiene. Protecciones contra el auto-bloqueo y para no quedar sin admin.
- **Integridad:** esquemas estrictos con Zod (sin asignación masiva). Montos calculados en el servidor. Escrituras condicionales con versión (409 si otro cambió antes) y transacciones en todo lo que toca varias colecciones (cobro, inventario, puntos, cumpleaños). `Idempotency-Key` en cobros, pedidos, aperturas, envíos y recepciones. Índices únicos contra el doble descuento y el doble canje.
- **Trazabilidad:** bitácora inmutable `Evento` de estados, cobros, anulaciones, asignaciones y correcciones, con quién y cuándo. Los comprobantes y los libros de inventario y puntos son inmutables; un error se corrige con nota crédito o movimiento contrario.
- **Datos personales:** consentimiento versionado. El personal ve alergias y preferencias, pero no el correo ni el teléfono completos. Los Eventos y los logs no guardan teléfonos, contraseñas ni cookies.
- **Migraciones:** todas con `--dry-run` y `--down`, con un `mongodump` antes. Cada una se aplicó up → down → up en la BD de trabajo.
- **Revisión:** cada ítem pasó por revisores de reglas, backend, seguridad, esquema y visual. Lo bloqueante se corrigió antes del commit.

## Tests

| Suite | Resultado al cerrar |
|---|---|
| Backend (Vitest + Supertest + MongoDB en replica set) | 115 archivos, 1255 tests en verde |
| Frontend (Vitest + Testing Library) | 113 archivos, 652 tests en verde |
| Lint (backend y frontend) | Sin errores ni reglas desactivadas |
| Build del frontend | En verde |
| Humo (`npm run humo`) | `/staff`, `/kds` y `/admin` sin pantallas en blanco ni errores de consola |
| Capturas (`npm run capturas`) | Una carpeta por ítem en `frontend/capturas/`, con medición de contraste y paleta |

Cada corrección lleva un test que se vio fallar antes del cambio.

## Cómo probar

1. MongoDB en replica set (`docker compose up -d` o `npm run mongo:replica-set`).
2. En `backend/`: `.env` desde `.env.example` (`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `ADMIN_*` y `DEV_USUARIOS_PASSWORD`). Luego `npm install`, las migraciones pendientes con `--dry-run` (tabla en `backend/README.md`), `npm run seed:base`, `npm run seed:menu`, `npm run seed:dev` y `npm run dev`.
3. En `frontend/`: `npm install` y `npm run dev`.
4. Para el recorrido completo, usa una BD aparte con `npm run seed:demo` y sigue `docs/GUIA_DEMO.md`: reserva, sentar, comanda, cocina, servir, cobro con cumpleaños o puntos, comprobante, inventario y reportes, con los usuarios `*.dev@brunchcafe.test`.
5. Las tareas de cada rol están en `docs/MANUAL_USUARIO.md`.
6. Verificación: `npm test` y `npm run lint` en las dos carpetas, `npm run build` y `npm run humo` en `frontend/`.

## Trabajo futuro

- **Despliegue:** API y frontend por HTTPS con `CLIENT_URL` exacto, `COOKIE_SECURE`/`COOKIE_SAMESITE` y `TRUST_PROXY` según el proxy, MongoDB gestionado en replica set, respaldos programados y monitoreo de `/api/health`.
- **Inicio de sesión con Google:** OAuth como alternativa al correo y la contraseña, enlazado a la cuenta existente por correo verificado y con el consentimiento de datos.
- **Facturación electrónica DIAN:** hoy se emite un comprobante interno, «no válido como factura electrónica». Falta integrar un proveedor tecnológico, con resolución de numeración, CUFE, impuestos discriminados y notas crédito electrónicas.
- **Plano C del salón (propuesta C de 2.6c):** muros, puertas y cada mesa en su sitio real con `Mesa.posicion` (ya existe en el modelo); falta editarla en Admin › Salón y resolver los choques a 768×1024.
- **PIN en tablets:** cambio rápido de usuario con un PIN corto en las tablets compartidas, sin escribir el correo y la contraseña en cada turno.
- **Impresora térmica:** impresión directa de comandas y comprobantes (ESC/POS), en lugar de la impresión del navegador.
- **Escalado a varios servidores:** los avisos en vivo (SSE) y la caché de sesión viven hoy en memoria de un solo proceso. Para varias instancias hace falta un bus compartido (por ejemplo, change streams de MongoDB o Redis pub/sub), caché compartida y límites por IP en un almacén común.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
