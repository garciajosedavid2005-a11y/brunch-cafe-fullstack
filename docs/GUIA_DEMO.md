# Guía de la demo · Brunch Café (7 a 10 minutos)

Guion para presentar el ciclo completo del servicio, de la reserva al reporte:

**reserva → sentar → comanda → cocina → servir → cobro con descuento (cumpleaños o puntos) → comprobante → inventario que baja solo → reportes.**

## Antes de empezar (15 minutos antes, el mismo día)

1. **Base de datos de la demo.** Usa una base de datos solo para la demo: en `backend/.env` cambia el final de `MONGO_URI` por `/brunch-cafe-demo` y guarda el valor anterior para restaurarlo al terminar. `seed:demo` nunca corre en producción, no toca un salón real y, si encuentra usuarios reales, no escribe nada y pide `npm run seed:demo -- --confirmar`. Nunca borra nada.
2. **Datos de la demo.** En `backend/` ejecuta `npm run seed:demo` **el mismo día y poco antes de empezar**: la reserva de hoy queda a la hora en punto actual, para que «Sentar» funcione durante la demo. Usa la contraseña de prueba de `DEV_USUARIOS_PASSWORD`. Al terminar dice qué preparó; si responde «el salón ya tiene actividad», mira el plan B.
3. **Arranca la aplicación:** `npm run dev` en `backend/` (puerto 4000) y en `frontend/` (puerto 5173).
4. **Abre 5 ventanas con sesiones distintas.** La sesión vive en la cookie: dos pestañas del mismo navegador comparten usuario. Usa perfiles distintos de Chrome o navegadores distintos (Chrome, Edge, Firefox).

   | Ventana | Usuario | Abre en | Para qué |
   |---|---|---|---|
   | 1 · Mesero (tablet) | `mesero.dev@brunchcafe.test` | `http://localhost:5173/staff` | Reserva, sentar, comanda y servir |
   | 2 · Cocina (KDS) | `cocina.dev@brunchcafe.test` | `/kds` | Preparar la ronda |
   | 3 · Caja | `cajero.dev@brunchcafe.test` | `/staff` (abre en Caja) | Cobro con descuento y comprobante |
   | 4 · Administración | `admin.dev@brunchcafe.test` | `/admin` | Inventario y reportes |
   | 5 · Cliente | `cliente.dev@brunchcafe.test` | `/cuenta` | Puntos y cumpleaños (opcional) |

   Inicia sesión en las cinco. En las ventanas 1 y 2 pulsa una vez «Sonido» para que el navegador permita los avisos.
5. **Anota una existencia antes de empezar.** En la ventana 4 entra a **Panel de sala › Inventario › Insumos** y anota cuánto hay de **Huevo** (o del insumo principal del plato que vas a pedir). Al final verás que bajó solo.

**Cómo queda todo después de `seed:demo`:**

| Dónde | Qué hay |
|---|---|
| Salón | Mesa 1 ocupada (un ítem servido, uno listo, uno en preparación y uno por empezar); mesa 2 libre; mesa 3 con la cuenta pedida y **cliente.dev identificado**; mesa 4 libre y **reservada para hoy**; mesas 5 + 6 unidas; mesa 7 por limpiar |
| Reservas | Una reserva de **hoy**, confirmada, para 2, con la **mesa 4**; otra pendiente para mañana; **Familia Rojas** en la lista de espera |
| Caja | Turno abierto con $200.000 de base y dos comprobantes del día |
| Para llevar | La cuenta de **Laura**, con su ronda en cocina |
| Domicilios | Un pedido confirmado, asignado a **repartidor.dev** |
| Inventario | Insumos de ejemplo, con **Leche de almendra** y **Aguacate** bajo el mínimo |
| Cliente | cliente.dev con **250 puntos**, alergia a **maní y nueces** y **cumpleaños este mes** |
| Catálogo | Un producto agotado |

## Guion

### 0:00 · Presentación (30 s)

«Brunch Café pasó de ser una web de pedidos a un sistema completo de servicio a la mesa: reservas, comandas en tablet, cocina en pantalla, caja con descuentos, inventario que se descuenta solo y reportes. Cada persona ve solo lo que le corresponde y todo queda registrado.»

### 0:30 · Reserva y sentar (1 min 30 s) · ventana 1 (mesero)

1. Entra a la pestaña **Reservas**: muestra la reserva de hoy, confirmada, con la **mesa 4**, y la **lista de espera** con la Familia Rojas.
2. En **Mesas**, la mesa 4 muestra la hora de la reserva.
3. Vuelve a **Reservas** y pulsa **Sentar** en la reserva de hoy: la mesa 4 pasa a **Ocupada** con su cuenta abierta.
4. Dentro de la cuenta pulsa **Identificar cliente**, escribe `cliente.dev@brunchcafe.test` y pulsa **Buscar**; elige al cliente. Aparece el aviso **Alergias: Maní y nueces**.

### 2:00 · Comanda (1 min) · ventana 1

1. Pulsa **Ver cuenta / Tomar comanda**.
2. Agrega un desayuno con opciones (por ejemplo, el desayuno clásico con el término del huevo) y una bebida.
3. Pulsa **Enviar ronda**: «la cocina y la barra la reciben al instante».

### 3:00 · Cocina (1 min) · ventana 2

1. La ronda de la mesa 4 aparece sola en la cola, con sonido, su tiempo de espera y el aviso de **alergias**.
2. Señala que en la cola también están el **domicilio** y la cuenta **para llevar de Laura**.
3. Pulsa **Empezar** y después **Todo listo**.

### 4:00 · Servir (30 s) · ventana 1

1. Arriba aparece el aviso **Listo para servir · Mesa 4** sin recargar. Tócalo.
2. Pulsa **Servir** junto a cada plato.
3. Pulsa **Solicitar cuenta**: la mesa pasa a «Cuenta pedida».

### 4:30 · Cobro con descuento y comprobante (2 min) · ventana 3 (caja)

1. La mesa 4 aparece en **Cuentas por cobrar**. Pulsa **Cobrar**.
2. Muestra el aviso de alergias del cliente y marca **Aplicar descuento de cumpleaños**: el 10 % se resta del consumo.
3. Marca también **Canjear puntos**: cada 100 puntos son $10.000, y el canje se limita a lo que queda por pagar.
4. Pulsa **10 %** de propina y, en efectivo, escribe un billete mayor: el cambio se calcula al momento. El botón de cobrar solo se activa cuando los pagos cuadran.
5. Pulsa cobrar. Sale el **comprobante** `CI-00000N` con consumo, **descuento de cumpleaños**, **descuento por puntos**, propina, total pagado, cambio y **puntos ganados**. Pulsa **Imprimir** para mostrar la tirilla.
6. Opcional, ventana 5: en **Mi cuenta › Mis puntos** el cliente ve el canje y los puntos nuevos.

### 6:30 · Inventario que baja solo (1 min) · ventana 4 (admin)

1. Pulsa **Panel de sala** y entra a **Inventario › Insumos**.
2. Muestra que **Huevo** (o el insumo que anotaste) bajó sin que nadie lo restara: «al enviar la ronda se descontó según la receta».
3. En **Alertas** están los insumos bajo el mínimo (Leche de almendra y Aguacate). Opcional: en **Recetas**, el costo y el margen de cada plato.

### 7:30 · Reportes (1 min) · ventana 4

1. Vuelve al panel de administración y entra a **Reportes** › **Hoy**.
2. Muestra las tarjetas: **Ventas**, **Descuentos** (el cumpleaños y los puntos que acabas de dar), **Ventas netas**, propinas y notas crédito.
3. Baja a **Ventas por canal** (salón, domicilio, para llevar) y **Descuentos por tipo**.
4. Pulsa **CSV** en una tabla: «se abre en Excel».
5. Opcional: pestaña **Operación y márgenes** con los tiempos de cocina.

### 8:30 · Cierre (30 s)

«Todo lo que viste queda registrado con quién lo hizo y cuándo: los montos no se alteran después del cobro, un doble clic no cobra dos veces y cada pantalla se actualiza sola. Lo siguiente: despliegue, facturación electrónica DIAN e impresora térmica.»

Si sobra tiempo: en la ventana 1, **Sentar** a la Familia Rojas desde la lista de espera en una mesa libre; o, con `repartidor.dev`, mostrar que el repartidor solo ve el domicilio que le asignaron.

## Plan B si algo falla en vivo

1. **«Sentar» no está disponible** (la reserva quedó para más tarde, porque `seed:demo` se ejecutó después de las :45): usa la **mesa 3**, que ya tiene la cuenta pedida con cliente.dev identificado, y salta directo al cobro (4:30). O sienta a la Familia Rojas desde la lista de espera en la mesa 2 y sigue el guion con ella.
2. **El descuento de cumpleaños no aparece:** ya se usó este año (en un ensayo). Cobra solo con **Canjear puntos**; el comprobante y los reportes muestran el descuento igual.
3. **No deja canjear puntos:** el saldo bajó de 100 en los ensayos. Cobra con el cumpleaños solo, o vuelve a preparar la base (punto 6).
4. **Una pantalla no se actualiza sola** (red del lugar): pulsa F5. Aunque se corte el aviso en vivo, las pantallas vuelven a consultar solas en menos de medio minuto.
5. **Aviso «Alguien más cambió esto»:** es la protección contra cambios simultáneos. Recarga y repite.
6. **El salón no está como esperabas** o el seed dice «incompleta» (por ejemplo, ya cobraste todo en un ensayo): `seed:demo` no toca un salón con actividad. Cambia `MONGO_URI` a otra base vacía (por ejemplo `/brunch-cafe-demo2`), ejecuta `npm run seed:demo` y reinicia el backend. Si dijo «incompleta», es la única salida.
7. **No deja iniciar sesión tras varios intentos** (5 fallos en 15 min): reinicia el backend (`Ctrl+C` y `npm run dev`), que reinicia los contadores.
8. **El backend o el frontend se cayó:** `npm run dev` de nuevo en su carpeta. Los datos están en MongoDB y no se pierden.
9. **No hay impresora:** el comprobante en pantalla es el mismo que se imprime.
10. **Nada funciona:** presenta con las capturas de `frontend/capturas/` (se generan en el equipo con `npm run capturas -- <etiqueta>`): `fase6-cierre/` (reserva, cliente en la comanda, aviso en el KDS, canje y cumpleaños en la caja, reportes), `cierre-final/` (resumen del carrito y Mis pedidos con el 10 %, reportes) y `plano-b-despues/` (plano del salón).

## Al terminar

Si cambiaste `MONGO_URI`, devuélvelo a su valor anterior y reinicia el backend.
