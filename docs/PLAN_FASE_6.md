# Plan Fase 6 — Domicilio y fidelización

Pedida por Brayan el 2026-11-19. Orden: 6.1 → 6.8, un commit por ítem y una sola pausa al final de la fase (estado y commits en [PROGRESO.md](PROGRESO.md)). No incluye el cierre final del proyecto.

## Ítems

| ID | Ítem | Qué entrega |
|---|---|---|
| 6.1 | `Pedido.canal` relleno | Migración `m6-…`: rellena `canal: 'domicilio'` SOLO en los pedidos sin canal (`--dry-run`, `--down` que lo quita solo en los que rellenó). Después, los filtros `canal: { $in: ['domicilio', null] }` pasan a `canal: 'domicilio'`. |
| 6.2 | Repartidor asignado | `Pedido.repartidor` (índice `{ repartidor, estado }`). El admin o el cajero lo asignan (permiso nuevo `pedido:asignar_repartidor`). El repartidor ve SOLO sus domicilios, los pasa a «en camino» y «entregado» (permiso nuevo `pedido:entregar`, limitado a los suyos) y registra el cobro solo de los suyos. Usuario `repartidor.dev` en `seed:dev`. |
| 6.3 | Para llevar | Cuenta sin mesa con `canal: 'para_llevar'` y el nombre o teléfono del cliente, abierta desde /staff o la caja; pasa por cocina (KDS: «Para llevar · nombre») y caja; al final, «Entregar» (listo → entregado). Reportes: canal «para llevar» real. |
| 6.4 | Perfil del cliente | En `usuarios` (no es colección heredada): fecha de nacimiento, alergias y preferencias, libreta de direcciones (hasta 5, una principal) y consentimiento de datos (Ley 1581: versión y fecha). Registro: casilla obligatoria. Usuario existente sin la versión vigente: la acepta al iniciar sesión antes de seguir. Carrito: elegir dirección guardada. |
| 6.5 | Alergias visibles al staff | Cliente identificado en la cuenta (por correo o teléfono, desde la toma de comanda o la caja). Aviso «Alergias: …» en la cuenta, en la tarjeta del KDS y en el pedido a domicilio (también en el KDS del domicilio). Solo alergias y preferencias, sin otros datos del cliente. |
| 6.6 | Puntos | Libro inmutable `movimientos_puntos` (acumula, canjea, revierte; único por referencia y tipo) y saldo en el usuario. 1 punto por cada $1.000 pagados (consumo neto, sin propina) al cobrar la cuenta de un cliente identificado o al entregar su domicilio. Canje en la caja: bloques de 100 puntos = $10.000. Historial en Mi cuenta. |
| 6.7 | Cumpleaños y descuentos en comprobante y reportes | 10 % del consumo en UNA compra durante el mes de cumpleaños (registro único por usuario y año). El comprobante guarda sus descuentos (`total = subtotal − descuentos + propina`); nunca bajo $0 y nunca sobre la propina. Reportes: descuentos por tipo. |
| 6.8 | Cierre de la fase | Capturas de lo nuevo, decisiones «a confirmar», pendientes y guía de pruebas a mano. |

## Decisiones de Brayan (2026-11-19)

- **F6-1 · Domicilio:** sigue en `Pedido` (no se migra a `Cuenta`).
- **F6-2 · Repartidor:** el admin o el cajero lo asignan; el repartidor ve solo sus domicilios, marca «en camino» y «entregado» y registra el cobro (reemplaza la decisión 3b.4).
- **F6-3 · Para llevar:** cuentas sin mesa (`para_llevar`) desde /staff o la caja, con nombre o teléfono, por cocina y caja, listo → entregado; en los reportes como «para llevar».
- **F6-4 · `Pedido.canal`:** migración aprobada si el `--dry-run` solo rellena el campo vacío; si toca otra cosa, se detiene.
- **F6-5 · Puntos:** 1 por cada $1.000 pagados (cuenta de cliente identificado o domicilio entregado); 100 puntos = $10.000 en la caja; historial en Mi cuenta; cliente por correo o teléfono.
- **F6-6 · Cumpleaños:** fecha de nacimiento en el perfil; 10 % en UNA compra durante ese mes.
- **F6-7 · Descuentos:** en el comprobante y los reportes; no bajan el total de $0 ni se aplican a la propina.
- **F6-8 · Perfil:** alergias y preferencias visibles al staff (cuenta, KDS y domicilio); libreta de direcciones con una principal; consentimiento Ley 1581 obligatorio en el registro con fecha y versión, y los usuarios existentes lo aceptan en su próximo inicio de sesión.
- **F6-9 · Migraciones:** las que solo agregan colecciones, campos, índices, permisos o roles están aprobadas (mongodump, `--dry-run`, up → down → up); se detiene si alguna modifica o borra datos (salvo la de 6.1).

## Decisiones técnicas: Claude (a confirmar por Brayan)

- **F6-a · Permisos nuevos:** `pedido:asignar_repartidor` (admin por «*» y cajero) y `pedido:entregar` (repartidor: listo → en camino → entregado solo en los suyos); `pedido:ver` del repartidor queda limitado a los suyos en el servicio. `cliente:identificar` (mesero, cajero) para buscar un cliente por correo o teléfono y `puntos:canjear` (cajero). Todo con una migración que solo agrega permisos.
- **F6-b · Para llevar «entregado»:** se reutiliza el estado `servido` del ítem, que en una cuenta para llevar se muestra como «Entregado»; la cuenta se cobra en la caja como las del salón (sin mesa, sin mesero obligatorio: queda quien la abre). Así no se toca el enum del ítem ni las máquinas existentes.
- **F6-c · Puntos:** se calculan sobre lo efectivamente pagado del consumo (después de descuentos, sin propina), redondeando hacia abajo. Un comprobante anulado (nota crédito) revierte los puntos ganados y devuelve los canjeados. El canje solo en el cobro completo de la cuenta (no en el cobro por partes) y sin superar el consumo.
- **F6-d · Cumpleaños:** el 10 % se aplica antes de los puntos, sobre el consumo; se ofrece en la caja (y en el carrito para el domicilio) solo si es el mes de cumpleaños en hora de Bogotá y no se usó ese año. Un índice único `{ usuario, anio }` evita usarlo dos veces.
- **F6-e · Datos del cliente al staff:** al buscar por correo o teléfono, el staff ve nombre, puntos, si cumple este mes y alergias/preferencias; nunca el correo completo ni el teléfono completo en las listas (enmascarados).
- **F6-f · Consentimiento:** versión vigente en configuración del código (`CONSENTIMIENTO_VERSION = '2026-11'`); el login responde `consentimientoPendiente: true` y la API (salvo aceptar, perfil y salir) responde 403 `CONSENTIMIENTO_PENDIENTE` para clientes sin la versión vigente.
- **F6-g · Direcciones:** máximo 5 por cliente, validadas con el mismo `direccion.js` del carrito; el pedido sigue guardando su copia (si se borra una dirección, los pedidos no cambian).
