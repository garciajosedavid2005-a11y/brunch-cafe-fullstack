# Guía de la demo · Brunch Café (5 a 7 minutos)

Guion para presentar el ciclo completo del servicio a la mesa: **mesa → comanda → cocina → servir → cuenta → cobro → comprobante**, más lo que ve el cliente y el administrador.

## Antes de empezar (10 minutos antes, el mismo día)

1. **Base de datos de la demo.** Lo más seguro es una base de datos solo para la demo. En `backend/.env`, cambia el final de `MONGO_URI` por `/brunch-cafe-demo` y guarda una copia del valor anterior para restaurarlo al terminar. Sobre la base de datos de trabajo, que tiene usuarios reales, `seed:demo` no escribe nada y pide repetirlo con `npm run seed:demo -- --confirmar`. Nunca borra nada, y con un salón real (mesas que no son de ejemplo) no lo toca.
2. **Datos de la demo.** En `backend/` ejecuta:
   ```
   npm run seed:demo
   ```
   Usa la contraseña de prueba de `DEV_USUARIOS_PASSWORD`, la misma de `seed:dev`. Al terminar dice qué preparó. Si responde «el salón ya tiene actividad», mira el plan B (punto 5).
3. **Arranca la aplicación:** `npm run dev` en `backend/` (puerto 4000) y `npm run dev` en `frontend/` (puerto 5173).
4. **Abre 5 ventanas, cada una con su propia sesión.** La sesión vive en la cookie del navegador: dos pestañas del mismo navegador comparten usuario. Usa perfiles distintos de Chrome o navegadores distintos (Chrome, Edge, Firefox…). Una ventana de incógnito sirve para una sola persona.

   | Ventana | Usuario | Abre en |
   |---|---|---|
   | 1 · Cliente | `cliente.dev@brunchcafe.test` | `http://localhost:5173/menu` |
   | 2 · Mesero (tablet) | `mesero.dev@brunchcafe.test` | `/staff` |
   | 3 · Cocina (KDS) | `cocina.dev@brunchcafe.test` | `/kds` |
   | 4 · Caja | `cajero.dev@brunchcafe.test` | `/staff`, que abre en la pestaña Caja |
   | 5 · Administración | `admin.dev@brunchcafe.test` | `/admin` |

   Inicia sesión en las cinco antes de empezar. En las ventanas 2 (mesero) y 3 (cocina), pulsa una vez «Sonido» para que el navegador permita los avisos con sonido.

**Cómo queda la demo después de `seed:demo`:**
- **Mesas:**
  - Mesa 1: ocupada, con un ítem servido, uno «Listo para servir», uno en preparación y uno por empezar.
  - Mesas 2 y 4: libres.
  - Mesa 3: con la cuenta pedida.
  - Mesas 5 y 6: unidas.
  - Mesa 7: por limpiar.
- **Caja:** dos comprobantes del día (si el seed se ejecutó hoy: «Cobradas hoy» usa la fecha de Bogotá).
- **Catálogo:** un postre agotado (la panna cotta).
- **Cliente:** una reserva pendiente para mañana y un pedido a domicilio confirmado.

## Guion

### 0:00 · Presentación (30 s)

«Brunch Café pasó de ser una web de pedidos a un sistema para atender en el salón: el mesero toma la comanda en la tablet, la cocina la ve al instante y la caja cobra con su comprobante. Todo queda registrado y cada persona ve solo lo que le corresponde.»

### 0:30 · Cliente (1 min) · ventana 1

1. En **Menú**, muestra que la panna cotta (agotada) ya no aparece: el cliente no puede pedirla.
2. Agrega un desayuno al carrito y muestra que pide elegir sus opciones (por ejemplo, el término del huevo).
3. Pulsa el **carrito** (arriba) y muestra el formulario de entrega. No hace falta enviarlo: el pedido confirmado ya existe.
4. En **Mi cuenta**, muestra «Mis pedidos» (el domicilio confirmado) y «Mis reservas» (la de mañana, pendiente).

### 1:30 · Mesero (1 min 30 s) · ventana 2

1. En **Mesas**, muestra el plano:
   - el resumen «N de 7 mesas ocupadas»;
   - los colores con su texto (Libre, Ocupada, Cuenta pedida, Por limpiar);
   - el anillo de tiempo de cada mesa y las mesas 5 + 6 dibujadas como una sola.
2. Arriba aparece el aviso **«Listo para servir»** con el botón **Mesa 1 (1)**. Tócalo: se abre la cuenta y, junto al plato listo, pulsa **Servir**. Vuelve al plano con **Volver al plano**.
3. Toca la **mesa 2** (libre), elige los comensales y pulsa **Abrir cuenta**.
4. Pulsa **Ver cuenta / Tomar comanda**, agrega dos platos de cocina (por ejemplo, el omelette y el cheesecake) y pulsa **Enviar ronda 1**.
5. Si queda tiempo, muestra la pestaña **Agotados**: ahí está la panna cotta, y el mesero también puede agotar.

### 3:00 · Cocina (1 min) · ventana 3

1. La ronda de la mesa 2 aparece sola en la cola, con sonido y su tiempo de espera.
2. Pulsa **Empezar** y después **Listo** en un plato, o **Todo listo** para la ronda completa.
3. Señala que en la cola también está el **domicilio confirmado** del cliente.
4. Vuelve a la ventana 2: el aviso **«Listo para servir»** con la mesa 2 aparece sin recargar. Tócalo y pulsa **Servir** junto a cada plato.

### 4:00 · Caja (1 min 30 s) · ventanas 2 y 4

1. En la ventana 2, dentro de la cuenta de la mesa 2, pulsa **Solicitar cuenta**. La mesa pasa a «Cuenta pedida».
2. En la ventana 4 (Caja), la mesa 2 aparece sola en **Por cobrar**, junto a la mesa 3. Pulsa **Cobrar**.
3. Pulsa **10 %** para la propina y escribe en «Recibido» un billete mayor: el cambio se calcula al momento. El botón **Cobrar** queda siempre a la vista abajo y solo se habilita cuando los pagos cuadran.
4. Pulsa **Cobrar**. Sale el **comprobante** `CI-00000N` con las líneas, «Consumo + Propina = Total pagado», el pago y el cambio, y las leyendas «Precios con impuestos incluidos» y «Documento no válido como factura electrónica». Pulsa **Imprimir** para mostrar la tirilla de 80 mm.
5. Si queda tiempo, cobra la mesa 3 con **pago mixto**: tarjeta y transferencia.
6. En la ventana 2, la mesa 2 ya está **Por limpiar**. Tócala y pulsa **Marcar como limpia**.

### 5:30 · Administración (1 min) · ventana 5

1. **Productos:** la panna cotta agotada y su interruptor «Disponible».
2. **Salón:** zonas y mesas, cuáles se pueden unir.
3. **Roles:** qué puede hacer cada rol (el mesero no cobra; el cajero sí).
4. **Pedidos** y **Reservas:** el domicilio confirmado y la reserva de mañana para confirmar.

### 6:30 · Cierre (30 s)

«Todo lo que viste queda registrado con quién lo hizo y cuándo; los montos no se pueden alterar después del cobro y cada pantalla se actualiza sola. Lo siguiente: facturación electrónica, turnos de caja e impresora térmica.»

## Plan B si algo falla en vivo

1. **Una pantalla no se actualiza sola** (red del lugar o proxy): pulsa F5. Si el flujo en vivo se corta, las pantallas vuelven a consultar al servidor por su cuenta, así que el cambio llega igual en menos de medio minuto.
2. **Aviso «La cuenta cambió» (Otra persona la modificó…) o, en cocina, «Otra persona ya cambió este ítem»:** es la protección contra cambios simultáneos. Recarga y repite la acción.
3. **No deja iniciar sesión tras varios intentos** (límite de 5 fallos en 15 min): usa la ventana de otro rol, o reinicia el backend (`Ctrl+C` y `npm run dev`), que reinicia los contadores.
4. **El backend o el frontend se cayó:** `npm run dev` de nuevo en su carpeta. Los datos están en MongoDB y no se pierden.
5. **El salón no está como esperabas** o el seed dice «incompleta» (por ejemplo, ya cobraste todo en un ensayo): `seed:demo` no toca un salón con actividad. Hay dos salidas:
   - en cada mesa ocupada pulsa **Solicitar cuenta**, cóbrala en la Caja, marca todas las mesas como limpias y vuelve a ejecutar `npm run seed:demo`;
   - o cambia a otra base de datos vacía (por ejemplo `/brunch-cafe-demo2`) y ejecútalo allí. Si dijo «incompleta», solo sirve esta salida.
6. **No hay impresora:** el comprobante en pantalla es el mismo que se imprime.
7. **Nada funciona:** presenta con las capturas de `frontend/capturas/`, generadas en el equipo con `npm run capturas`:
   - `plano-b-despues/` para el plano;
   - `fase3-caja/` para la caja y el comprobante;
   - las del KDS de la Fase 2.

## Al terminar

Si cambiaste `MONGO_URI`, devuélvelo a su valor anterior y reinicia el backend.
