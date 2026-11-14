// Capturas de pantalla para revisión visual (npm run capturas -- <etiqueta>).
// 1.3b · Entorno aislado: el script arranca su propia API (backend/scripts/entorno-capturas.js) sobre
// la BD «brunch-cafe-capturas», que se vacía y se siembra en cada ejecución (seed:base sin el admin
// real, menú, modificadores, salón y usuarios *.dev, sin datos personales), y su propio Vite. La BD de
// trabajo y los servidores de desarrollo (4000 y 5173) no se tocan; al terminar se detiene todo.
// La contraseña de los usuarios *.dev es DEV_USUARIOS_PASSWORD (entorno o backend/.env; no se muestra).
//   CAPTURAS_API_PORT (4100) · CAPTURAS_FRONT_PORT (5174) · ANCHOS (1280,1024,768) · SOLO (vistas)
//   ZONA_NAVEGADOR (por defecto America/Bogota): zona del navegador simulado
import { chromium, request } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";

const PUERTO_API = process.env.CAPTURAS_API_PORT || "4100";
const PUERTO_FRONT = process.env.CAPTURAS_FRONT_PORT || "5174";
const FRONT = `http://localhost:${PUERTO_FRONT}`;
const API = `http://localhost:${PUERTO_API}/api/v1`;
const BACKEND = resolve(process.cwd(), "../backend");

// DEV_USUARIOS_PASSWORD del entorno o, si no está, de backend/.env (sin imprimirla)
const leerClave = async () => {
  if (process.env.DEV_USUARIOS_PASSWORD) return process.env.DEV_USUARIOS_PASSWORD;
  try {
    const env = await readFile(join(BACKEND, ".env"), "utf8");
    return env.match(/^DEV_USUARIOS_PASSWORD=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
  } catch {
    return "";
  }
};
const CLAVE = await leerClave();
// Pendiente de 2.7 · Hora fija (como el reloj de los tests): la API y el navegador ven hoy a las 6:00 a. m. de
// Bogotá (CAPTURAS_HORA=HH:MM para otra), con el reloj en marcha desde ahí. Así las vistas no dependen de la
// hora real (carrito-problema fallaba después de las 4:00 p. m.: no quedaban horas de domicilio). A las 6:00
// la primera franja de domicilio (8:00) queda con 2 h de margen aunque la ejecución dure (el servidor exige 1 h).
const HORA_CAPTURAS = /^\d{2}:\d{2}$/.test(process.env.CAPTURAS_HORA || "") ? process.env.CAPTURAS_HORA : "06:00";
const HOY_BOGOTA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const DESFASE_MS = new Date(`${HOY_BOGOTA}T${HORA_CAPTURAS}:00-05:00`).getTime() - Date.now();
const ahoraCapturas = () => Date.now() + DESFASE_MS;
const ETIQUETA = process.argv[2] || "actual";
// Cada tamaño es un ancho (alto 900, página completa) o ANCHOxALTO (1.6: pantalla de tablet, solo lo visible)
const TAMANOS = (process.env.ANCHOS || "1280,1024,768").split(",").map((t) => {
  const [ancho, alto] = t.toLowerCase().split("x").map(Number);
  return { ancho, alto: alto || 900, etiqueta: alto ? `${ancho}x${alto}` : `${ancho}`, pantalla: Boolean(alto) };
});
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
// 1.5c · MEDIR_TACTIL=1: además de la captura, mide los botones visibles y lista los de < 44 px de alto
const MEDIR_TACTIL = process.env.MEDIR_TACTIL === "1";
const pequenos = [];
// 1.6b · MEDIR_SOLAPES=1: en las tablas con acciones fijas, lista las columnas que quedan debajo de ellas
const MEDIR_SOLAPES = process.env.MEDIR_SOLAPES === "1";
const solapes = [];
// 2.0b · Siempre que haya navbar público: contraste de sus enlaces (normal, activo y hover) y de las
// barras de la hamburguesa contra lo que hay detrás de verdad (capas compuestas); sobre una foto no se
// puede calcular y se informa aparte. Texto ≥ 4,5:1; barras de la hamburguesa (no texto) ≥ 3:1
const contrastesNavbar = [];
const SALIDA = join(process.cwd(), "capturas", ETIQUETA);

const SOLO_PUBLICAS = SOLO && SOLO.every((v) => ["inicio", "menu", "login", "registro", "nosotros", "nosotros-ubicacion", "pie", "comentarios"].includes(v));
if (!CLAVE && !SOLO_PUBLICAS) {
  console.error("Define DEV_USUARIOS_PASSWORD (≥ 10 caracteres) en el entorno o en backend/.env.");
  process.exit(1);
}

const USUARIOS = {
  admin: "admin.dev@brunchcafe.test",
  cliente: "cliente.dev@brunchcafe.test",
  mesero: "mesero.dev@brunchcafe.test",
  cocina: "cocina.dev@brunchcafe.test", // 2.5 · KDS
};

// ── Entorno aislado: API sobre la BD de capturas + Vite apuntando a ella ──
const procesos = [];
const errores = [];
const arrancar = (nombre, args, opciones) => {
  const hijo = spawn(process.execPath, args, { ...opciones, stdio: ["ignore", "ignore", "pipe"] });
  hijo.stderr.on("data", (d) => errores.push(`[${nombre}] ${d}`));
  procesos.push(hijo);
  return hijo;
};
const detenerTodo = () => {
  for (const hijo of procesos) if (hijo.exitCode === null) hijo.kill();
};
process.on("exit", detenerTodo);

const esperar = async (url, hijo, nombre, segundos = 90) => {
  for (let i = 0; i < segundos * 2; i += 1) {
    if (hijo.exitCode !== null) throw new Error(`${nombre} terminó antes de tiempo:\n${errores.join("").slice(-1500)}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // aún no responde
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${nombre} no respondió en ${segundos} s (${url}). ¿Está ocupado el puerto?`);
};

const api = arrancar("api", ["scripts/entorno-capturas.js"], {
  cwd: BACKEND,
  env: { ...process.env, DEV_USUARIOS_PASSWORD: CLAVE, CAPTURAS_API_PORT: PUERTO_API, CAPTURAS_FRONT_URL: FRONT, CAPTURAS_DESFASE_MS: String(DESFASE_MS) },
});
const vite = arrancar("vite", [join(process.cwd(), "node_modules/vite/bin/vite.js"), "--port", PUERTO_FRONT, "--strictPort"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_API_URL: `http://localhost:${PUERTO_API}/api` },
});
try {
  await esperar(`http://localhost:${PUERTO_API}/api/health`, api, "La API de capturas");
  await esperar(FRONT, vite, "Vite");
  console.log(`Entorno de capturas listo (BD brunch-cafe-capturas · API ${PUERTO_API} · web ${PUERTO_FRONT} · hora ${HORA_CAPTURAS} de Bogotá).`);
} catch (error) {
  console.error(error.message);
  detenerTodo();
  process.exit(1);
}

const abrirPestanaAdmin = (nombre) => async (page) => {
  await page.goto(`${FRONT}/admin`);
  await page.getByRole("button", { name: nombre, exact: true }).first().click();
  await page.waitForLoadState("networkidle");
};

// 1.7b · Muestra todas las opciones del primer <select> del panel de la mesa (cuando termina de cargar)
const desplegarSelect = async (p) => {
  const select = p.locator(".panel-mesa select").first();
  await select.waitFor();
  await p.waitForFunction(() => !document.querySelector(".panel-mesa select")?.disabled);
  await select.evaluate((s) => { s.size = s.options.length; s.style.height = "auto"; s.style.backgroundImage = "none"; });
};

// 1.12 · Pedido a domicilio con opciones (una vez por ejecución), creado por la API como el cliente:
// el plato con un grupo obligatorio, con la primera opción de cada grupo obligatorio y una nota
let pedidoConOpcionesHecho = false;
const productoConOpciones = async (contexto) => {
  const catalogo = await (await contexto.get(`${API}/catalogo?incluir=modificadores`)).json();
  const producto = catalogo.productos.find((pr) => pr.modificadores?.some((g) => g.obligatorio));
  if (!producto) throw new Error("No hay en la BD de capturas un plato con un grupo de opciones obligatorio");
  return producto;
};
const pedidoConOpciones = async () => {
  if (pedidoConOpcionesHecho) return;
  const cliente = await request.newContext();
  try {
    await cliente.post(`${API}/auth/login`, { data: { correo: USUARIOS.cliente, contraseña: CLAVE } });
    const producto = await productoConOpciones(cliente);
    const modificadores = producto.modificadores.filter((g) => g.obligatorio)
      .map((g) => ({ grupoId: g.id, opcionIds: [g.opciones.find((o) => o.disponible).id] }));
    const extras = producto.modificadores.find((g) => !g.obligatorio && g.opciones.some((o) => o.precioExtra > 0));
    if (extras) modificadores.push({ grupoId: extras.id, opcionIds: [extras.opciones.find((o) => o.precioExtra > 0).id] });
    const metodos = await (await cliente.get(`${API}/cliente/metodos-pago`)).json();
    const hora = `${String(Math.min(16, Math.max(9, new Date(ahoraCapturas()).getUTCHours() - 5 + 2))).padStart(2, "0")}:00`;
    const res = await cliente.post(`${API}/cliente/pedidos`, {
      headers: { "Idempotency-Key": `capturas-opciones-${Date.now()}` },
      data: {
        items: [{ productoRef: producto.id, cantidad: 2, modificadores, nota: "Sin sal, por favor" }],
        nombre: "Cliente Prueba", telefono: "3000000000", direccion: "Cra 36B Oriente #30-06", hora, barrio: "Centro",
        metodoPagoId: metodos[0].id,
      },
    });
    if (!res.ok()) console.log(`  (no se creó el pedido con opciones: ${res.status()} ${(await res.text()).slice(0, 160)})`);
    pedidoConOpcionesHecho = res.ok();
  } finally {
    await cliente.dispose();
  }
};
// Abre el diálogo de opciones del plato desde el menú (si el frontend lo tiene) y elige la opción `n`
const agregarPlatoConOpciones = async (p, { n = 0, nota = "" } = {}) => {
  const producto = await productoConOpciones(p.context().request);
  const tarjeta = p.locator(`#producto-${producto.codigo}`);
  await tarjeta.scrollIntoViewIfNeeded();
  await tarjeta.getByRole("button", { name: "Agregar al carrito" }).click({ force: true });
  const dialogo = p.getByRole("dialog");
  if (!(await dialogo.isVisible().catch(() => false))) return false;
  for (const grupo of producto.modificadores.filter((g) => g.obligatorio)) {
    const disponibles = grupo.opciones.filter((o) => o.disponible);
    await dialogo.getByRole("radio", { name: disponibles[Math.min(n, disponibles.length - 1)].nombre }).check();
  }
  // Un extra con recargo en la primera línea, para ver el total del pie y del carrito con el recargo
  const extras = producto.modificadores.find((g) => !g.obligatorio && g.opciones.some((o) => o.precioExtra > 0 && o.disponible));
  if (extras && n === 0) await dialogo.getByRole("checkbox", { name: new RegExp(`^${extras.opciones.find((o) => o.precioExtra > 0 && o.disponible).nombre}`) }).check();
  if (nota) await dialogo.getByRole("textbox").fill(nota);
  return true;
};

// 1.7 · Ayudas de la toma de comanda. `disponibilidad` usa una sesión de admin aparte (BD de capturas)
let sesionAdmin = null;
const disponibilidad = async (nombre, disponible) => {
  if (!sesionAdmin) {
    sesionAdmin = await request.newContext();
    await sesionAdmin.post(`${API}/auth/login`, { data: { correo: USUARIOS.admin, contraseña: CLAVE } });
  }
  const productos = await (await sesionAdmin.get(`${API}/admin/productos`)).json();
  const producto = productos.find((pr) => pr.nombre === nombre);
  if (!producto) throw new Error(`No está el producto «${nombre}» en la BD de capturas`);
  const res = await sesionAdmin.put(`${API}/admin/productos/${producto.id ?? producto._id}`, { data: { disponible } });
  if (!res.ok()) throw new Error(`No se pudo cambiar la disponibilidad de «${nombre}»: ${res.status()}`);
};
const abrirCuentaDeMesa = async (p, numero) => {
  await p.goto(`${FRONT}/staff`);
  await p.getByRole("button", { name: new RegExp(`^Mesa ${numero},`) }).click();
  await p.getByRole("button", { name: /^Ver cuenta/ }).click();
  await p.getByRole("heading", { name: new RegExp(`^Mesa ${numero}`), level: 2 }).waitFor();
};
// En vertical (< 1000 px) la cuenta va en su propia vista
const verCuentaEnVertical = async (p) => {
  const boton = p.getByRole("group", { name: "Ver" }).getByRole("button", { name: /^Cuenta/ });
  if (await boton.isVisible()) await boton.click();
};
// Ronda en curso en la mesa 1 (una sola vez por ejecución): un latte grande con nota y un agua del menú
const agregarRondaDeEjemplo = async (p) => {
  await abrirCuentaDeMesa(p, 1);
  if (await p.getByRole("button", { name: /^Enviar ronda/, includeHidden: true }).count()) return;
  await p.getByRole("group", { name: "Categorías" }).getByRole("button", { name: "Bebidas" }).click();
  await p.getByRole("button", { name: /^Latte frío artesanal/ }).click();
  const latte = p.getByRole("dialog", { name: "Latte frío artesanal" });
  await latte.getByRole("checkbox", { name: /Grande/ }).check();
  await latte.getByRole("button", { name: "Sumar uno" }).click();
  await latte.getByRole("textbox", { name: /Nota/ }).fill("Uno sin azúcar");
  await latte.getByRole("button", { name: /^Agregar/ }).click();
  await latte.waitFor({ state: "detached" });
  await p.getByRole("button", { name: /^Limonada de hierbabuena/ }).click();
  const limonada = p.getByRole("dialog", { name: "Limonada de hierbabuena" });
  await limonada.getByRole("button", { name: /^Agregar/ }).click();
  await limonada.waitFor({ state: "detached" });
};

// 2.7 · Un producto de cocina y una opción agotados (una sola vez por ejecución), por la API con el admin
let agotadosPreparados = false;
const prepararAgotados = async () => {
  if (agotadosPreparados) return;
  agotadosPreparados = true;
  const ctx = await request.newContext();
  try {
    const login = await ctx.post(`${API}/auth/login`, { data: { correo: USUARIOS.admin, contraseña: CLAVE } });
    if (!login.ok()) throw new Error(`Login de prueba falló para admin: ${login.status()}`);
    const lista = await (await ctx.get(`${API}/staff/agotados`)).json();
    const plato = lista.productos.find((pr) => pr.disponible && pr.estacion?.codigo === "cocina");
    const grupo = lista.grupos.find((g) => g.opciones.length > 1);
    for (const [ruta, que] of [[`${API}/staff/agotados/productos/${plato.id}`, plato.nombre], [`${API}/staff/agotados/grupos/${grupo.id}/opciones/${grupo.opciones.at(-1).id}`, grupo.nombre]]) {
      const r = await ctx.post(ruta, { data: { disponible: false } });
      if (!r.ok()) throw new Error(`Agotados (${que}): ${r.status()} ${(await r.text()).slice(0, 200)}`);
    }
  } finally {
    await ctx.dispose();
  }
};

// 2.6b · Lo que registra el límite de errores (su mensaje y el aviso de React con el error capturado). Solo
// para las vistas que provocan el fallo a propósito
// para las vistas que provocan el fallo a propósito. El aviso de React («%o») solo se exime emparejado: uno
// por cada mensaje del límite, para no tapar otro error de React sin relación (revisor-reglas, 2.7)
const ERRORES_LIMITE = { mensaje: /^console\.error: \[Brunch Café\] Error en la sección/, acompanante: /^console\.error: %o$/ };

// 2.5 · Cola del KDS (una sola vez por ejecución; las vistas del KDS van al final porque cambian el
// salón): umbrales de Cocina en 30/60 min (así las rondas sembradas de 35 y 80 min salen en «Atención» y
// «Retrasada» y la nueva «A tiempo»), una ronda nueva en la mesa 5 con cocina y barra (con nota), un ítem
// en preparación, otro anulado y el domicilio del cliente de prueba confirmado.
let cocinaPreparada = false;
const prepararCocina = async () => {
  if (cocinaPreparada) return;
  cocinaPreparada = true;
  const sesion = async (usuario) => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API}/auth/login`, { data: { correo: USUARIOS[usuario], contraseña: CLAVE } });
    if (!res.ok()) throw new Error(`Login de prueba falló para ${usuario}: ${res.status()}`);
    return ctx;
  };
  const leer = async (promesa, que) => {
    const res = await promesa;
    if (!res.ok()) throw new Error(`KDS (${que}): ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const [admin, mesero, cocina] = await Promise.all([sesion("admin"), sesion("mesero"), sesion("cocina")]);
  const estaciones = await leer(admin.get(`${API}/admin/estaciones`), "estaciones");
  const estCocina = estaciones.find((e) => e.codigo === "cocina");
  await leer(admin.put(`${API}/admin/estaciones/${estCocina.id ?? estCocina._id}`, { data: { umbralAvisoMin: 30, umbralAlertaMin: 60 } }), "umbrales");

  const { productos } = await leer(mesero.get(`${API}/staff/salon/catalogo`), "catálogo");
  // Opciones obligatorias: la primera disponible de cada grupo con mínimo (así sale en la tarjeta)
  const elegirOpciones = (pr) => (pr.modificadores || []).filter((g) => g.obligatorio || g.min > 0).map((g) => ({
    grupoId: g.id, opcionIds: g.opciones.filter((o) => o.disponible !== false).slice(0, Math.max(1, g.min || 0)).map((o) => o.id),
  }));
  const disponibles = productos.filter((pr) => pr.disponible);
  const deCocina = disponibles.filter((pr) => pr.estacion?.codigo === "cocina" && !pr.modificadores?.length).slice(0, 2);
  const deBarra = disponibles.find((pr) => pr.estacion?.codigo === "barra");
  if (deCocina.length < 2 || !deBarra) throw new Error(`KDS: faltan productos de cocina sin modificadores (${deCocina.length}) o de barra`);
  const { mesas } = await leer(mesero.get(`${API}/staff/salon/mesas`), "plano");
  const mesa5 = mesas.find((m) => m.numero === 5);
  let cuenta = await leer(mesero.post(`${API}/staff/salon/mesas/${mesa5.id}/abrir`, { data: { comensales: 2 } }), "abrir mesa 5");
  const lineas = [
    { productoId: deCocina[0].id, cantidad: 2, nota: "Uno sin cebolla" },
    { productoId: deCocina[1].id, cantidad: 1 },
    { productoId: deBarra.id, cantidad: 2, modificadores: elegirOpciones(deBarra) },
  ];
  for (const linea of lineas) ({ cuenta } = await leer(mesero.post(`${API}/staff/salon/cuentas/${cuenta.id}/items`, { data: linea }), "agregar ítem"));
  cuenta = await leer(mesero.post(`${API}/staff/salon/cuentas/${cuenta.id}/rondas/1/enviar`, { data: { numeroRonda: 1, versionEsperada: cuenta.version } }), "enviar ronda");
  const items = cuenta.rondas.find((r) => r.numeroRonda === 1).items;
  const itemDe = (productoId) => items.find((i) => (i.productoId ?? i.producto) === productoId) ?? items[lineas.findIndex((l) => l.productoId === productoId)];
  await leer(cocina.post(`${API}/staff/items/${itemDe(deCocina[0].id).id}/estado`, { data: { a: "en_preparacion", de: "enviado" } }), "empezar ítem");
  await leer(admin.post(`${API}/staff/salon/cuentas/${cuenta.id}/items/${itemDe(deCocina[1].id).id}/anular`, { data: { motivo: "cliente_cambio" } }), "anular ítem");

  const pedidos = await leer(admin.get(`${API}/staff/pedidos?limite=20`), "pedidos");
  const pendiente = pedidos.find((pd) => pd.estadoCodigo === "pendiente");
  if (pendiente) await leer(admin.patch(`${API}/staff/pedidos/${pendiente.id}/estado`, { data: { codigo: "confirmado" } }), "confirmar pedido");
  await Promise.all([admin, mesero, cocina].map((c) => c.dispose()));
};
// 2.6 · «Listo para servir» (una sola vez, tras preparar el KDS): en la ronda de la mesa 5 (del mesero de
// prueba) la cocina termina lo que estaba en preparación y el admin hace «Todo listo» en Barra
let listosPreparados = false;
const prepararListos = async () => {
  await prepararCocina();
  if (listosPreparados) return;
  listosPreparados = true;
  const sesion = async (usuario) => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API}/auth/login`, { data: { correo: USUARIOS[usuario], contraseña: CLAVE } });
    if (!res.ok()) throw new Error(`Login de prueba falló para ${usuario}: ${res.status()}`);
    return ctx;
  };
  const leer = async (promesa, que) => {
    const res = await promesa;
    if (!res.ok()) throw new Error(`Listos (${que}): ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  const [admin, mesero, cocina] = await Promise.all([sesion("admin"), sesion("mesero"), sesion("cocina")]);
  const { mesas } = await leer(mesero.get(`${API}/staff/salon/mesas`), "plano");
  const cuentaId = mesas.find((m) => m.numero === 5)?.cuenta?.id;
  if (!cuentaId) throw new Error("Listos: la mesa 5 no tiene cuenta (¿se preparó el KDS?)");
  const cuenta = await leer(mesero.get(`${API}/staff/salon/cuentas/${cuentaId}`), "cuenta");
  const ronda = cuenta.rondas.find((r) => r.estado === "enviada");
  for (const item of ronda.items.filter((i) => i.estado === "en_preparacion" && i.estacion.codigo === "cocina")) {
    await leer(cocina.post(`${API}/staff/items/${item.id}/estado`, { data: { a: "listo", de: "en_preparacion" } }), "listo");
  }
  if (ronda.items.some((i) => i.estacion.codigo === "barra" && ["enviado", "en_preparacion"].includes(i.estado))) {
    await leer(admin.post(`${API}/staff/cocina/rondas/${ronda.id}/todo-listo`, { data: { estacion: "barra" } }), "todo listo barra");
  }
  await Promise.all([admin, mesero, cocina].map((c) => c.dispose()));
};

const abrirKds = async (p, estacion) => {
  await prepararCocina();
  await p.goto(`${FRONT}/kds`);
  // 2.5b · Con una sola estación (cocina.dev) no hay botones de cambio: entra directo
  const grupo = p.getByRole("group", { name: "Estación" });
  if (await grupo.count()) await grupo.getByRole("button", { name: estacion, exact: true }).click();
  await p.getByRole("region", { name: `Cola de ${estacion}` }).waitFor();
};

// 2.0b · Contraste de un elemento del navbar contra el fondo compuesto que tiene detrás (en el navegador)
const medirElementoNavbar = (el, estado) => {
  const rgba = (texto) => {
    const m = texto.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const sobre = (arriba, abajo) => ({
    r: arriba.r * arriba.a + abajo.r * (1 - arriba.a),
    g: arriba.g * arriba.a + abajo.g * (1 - arriba.a),
    b: arriba.b * arriba.a + abajo.b * (1 - arriba.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const r = el.getBoundingClientRect();
  const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
  // Capas en ese punto, de arriba abajo, hasta una opaca; una foto (img o background-image) no se mide
  const capas = [];
  let sobreFoto = false;
  for (const capa of document.elementsFromPoint(x, y)) {
    if (capa === el || el.contains(capa)) continue;
    const estilo = getComputedStyle(capa);
    if (["IMG", "VIDEO", "CANVAS", "PICTURE"].includes(capa.tagName) || (estilo.backgroundImage && estilo.backgroundImage !== "none")) {
      sobreFoto = true;
      break;
    }
    const fondo = rgba(estilo.backgroundColor);
    if (fondo && fondo.a > 0) capas.push(fondo);
    if (fondo?.a === 1) break;
  }
  const esBarra = el.matches(".navbar__hamburger span");
  const esIcono = el.tagName === "IMG";
  // Icono (carrito): el color de verdad es el de los píxeles opacos del PNG, con su filtro
  // (en el navbar transparente, brightness(0) invert(1) lo vuelve blanco)
  const colorIcono = () => {
    const filtro = getComputedStyle(el).filter || "";
    if (/brightness\(0\)/.test(filtro) && /invert\(1\)/.test(filtro)) return { r: 255, g: 255, b: 255, a: 1 };
    const c = document.createElement("canvas");
    c.width = el.naturalWidth || 32;
    c.height = el.naturalHeight || 32;
    const g = c.getContext("2d");
    g.drawImage(el, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let [r, gg, b, n] = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n += 1; }
    return n ? { r: r / n, g: gg / n, b: b / n, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
  };
  const textoFg = esIcono ? colorIcono() : rgba(getComputedStyle(el)[esBarra ? "backgroundColor" : "color"]);
  const fondo = capas.reverse().reduce((abajo, arriba) => sobre(arriba, abajo), { r: 255, g: 255, b: 255, a: 1 });
  const fg = sobre(textoFg, fondo);
  const [claro, oscuro] = [lum(fg), lum(fondo)].sort((a, b) => b - a);
  const hex = ({ r: rr, g, b }) => `#${[rr, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  return {
    texto: esBarra ? "(barra de la hamburguesa)" : esIcono ? `(icono) ${el.alt || ""}` : (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30),
    estado, color: hex(fg), fondo: hex(fondo), sobreFoto,
    minimo: esBarra || esIcono ? 3 : 4.5, // gráficos (no texto): 3:1
    ratio: Math.round(((claro + 0.05) / (oscuro + 0.05)) * 100) / 100,
  };
};
// Enlaces con texto, el icono del carrito (su <img>) y las barras de la hamburguesa
const SELECTOR_NAVBAR = ".top-bar .menu a, .top-bar .menu button, .top-bar .menu img, .navbar__hamburger span";
const medirContrasteNavbar = async (page) => {
  if (!(await page.locator(".top-bar").first().isVisible().catch(() => false))) return null;
  const medidas = await page.evaluate(({ selector, medir }) => {
    const fn = new Function(`return (${medir})`)();
    // Solo lo que se ve: un navbar transparente (absoluto) queda fuera de la pantalla al bajar
    // 2.6b · y que no esté tapado (p. ej. por el fondo de un diálogo abierto): eso no lo ve nadie
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== "hidden")) return false;
      const encima = document.elementFromPoint(r.left + r.width / 2, Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1));
      return Boolean(encima) && (encima === el || el.contains(encima) || encima.contains(el));
    };
    // Un enlace sin texto que solo envuelve un icono (el carrito) se mide por su <img>
    const soloIcono = (el) => el.tagName === "A" && !el.textContent.trim() && el.querySelector("img");
    return [...document.querySelectorAll(selector)].filter(visible).filter((el) => !soloIcono(el))
      .map((el) => fn(el, (el.closest("a") || el).classList.contains("active") ? "activo" : "normal"));
  }, { selector: SELECTOR_NAVBAR, medir: medirElementoNavbar.toString() });
  // Hover: se pasa el puntero por cada enlace o botón visible del menú
  const enlaces = page.locator(".top-bar .menu a, .top-bar .menu button");
  for (let i = 0; i < await enlaces.count(); i += 1) {
    const enlace = enlaces.nth(i);
    if (!(await enlace.isVisible())) continue;
    if (!(await enlace.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }))) continue;
    // 2.6b · Tapado (p. ej. por el fondo de un diálogo abierto): el usuario tampoco puede pasar el puntero,
    // no se mide (antes esperaba 30 s y la vista fallaba sin foto)
    if (!(await enlace.hover({ timeout: 2000 }).then(() => true, () => false))) continue;
    await page.waitForTimeout(300); // transición de color
    medidas.push(await enlace.evaluate((el, medir) => {
      const objetivo = !el.textContent.trim() && el.querySelector("img") ? el.querySelector("img") : el;
      return new Function(`return (${medir})`)()(objetivo, "hover");
    }, medirElementoNavbar.toString()));
  }
  await page.mouse.move(1, 899);
  return medidas;
};

// 2.0b · Colores azules fuera de la paleta de Brunch Café en /staff y el admin (texto, fondo, borde e
// iconos SVG), en reposo y con el puntero o el foco en cada enlace y botón visible. Los colores de
// estado vienen de los datos (estilo en línea) y se cuentan aparte.
const buscarAzules = (raiz, estadoInteraccion) => {
  const rgba = (texto) => {
    const m = String(texto).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const esAzul = (c) => {
    if (!c || c.a < 0.2) return false;
    const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d < 0.08) return false; // gris
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return h >= 185 && h <= 260 && s >= 0.3 && l > 0.12 && l < 0.88;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const hallazgos = [];
  for (const el of [raiz, ...raiz.querySelectorAll("*")]) {
    if (!visible(el)) continue;
    const estilo = getComputedStyle(el);
    const propiedades = ["color", "backgroundColor", "borderTopColor", "borderBottomColor", "outlineColor", ...(el instanceof SVGElement ? ["stroke", "fill"] : [])];
    for (const propiedad of propiedades) {
      if (propiedad.startsWith("border") && parseFloat(estilo[propiedad.replace("Color", "Width")]) === 0) continue;
      if (propiedad === "outlineColor" && (estilo.outlineStyle === "none" || parseFloat(estilo.outlineWidth) === 0)) continue;
      if (propiedad === "color" && !el.textContent.trim() && !el.querySelector("svg")) continue;
      const valor = estilo[propiedad];
      if (!esAzul(rgba(valor))) continue;
      // Color de estado acordado: viene de los datos en un estilo en línea (el propio elemento o un ancestro cercano)
      // o es uno de los estados acordados con color propio en el CSS (por limpiar, ítem enviado,
      // insignias de estado del admin y de /staff), los mismos que admite src/test/paletaStaffAdmin.test.js
      // Solo el color en línea del propio elemento o de su padre (p. ej. un punto de color dentro de la insignia)
      const colorEnLinea = (nodo) => Boolean(nodo?.matches?.("[style*='color']"));
      const deEstado = colorEnLinea(el) || colorEnLinea(el.parentElement)
        || Boolean(el.closest("[class*='por_limpiar'], .comanda-item__estado, .admin-badge--info, .staff-dashboard__status--info"));
      hallazgos.push({
        estado: estadoInteraccion, deEstado, propiedad, valor,
        elemento: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}`,
        texto: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  return hallazgos;
};
const medirPaleta = async (page) => {
  const hallazgos = await page.evaluate((fn) => new Function(`return (${fn})`)()(document.body, "reposo"), buscarAzules.toString());
  const interactivos = page.locator("a:visible, button:visible");
  const cuantos = await interactivos.count();
  const total = Math.min(cuantos, 60);
  if (cuantos > 60) console.log(`  · paleta: ${cuantos} enlaces y botones; se midieron con el puntero y el foco los primeros 60`);
  for (let i = 0; i < total; i += 1) {
    const el = interactivos.nth(i);
    for (const accion of ["hover", "foco"]) {
      try {
        if (accion === "hover") await el.hover({ timeout: 1000 });
        else await el.focus({ timeout: 1000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(80);
      hallazgos.push(...await el.evaluate((nodo, [fn, estado]) => new Function(`return (${fn})`)()(nodo, estado), [buscarAzules.toString(), accion]));
    }
  }
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.activeElement?.blur());
  const unicos = new Map(hallazgos.map((h) => [`${h.estado}|${h.elemento}|${h.propiedad}|${h.valor}|${h.texto}`, h]));
  return [...unicos.values()];
};
const azules = [];

// nombre → { usuario, preparar(page), completa }
const VISTAS = {
  inicio: { preparar: (p) => p.goto(`${FRONT}/`) },
  menu: { preparar: (p) => p.goto(`${FRONT}/menu`) },
  // 1.5b · Login y registro (botón «Continuar con Google»), sin sesión
  login: { preparar: (p) => p.goto(`${FRONT}/login`) },
  // 1.6b · Navbar público con el menú de la hamburguesa abierto (a ≤ 768 px)
  "navbar-menu": { completa: false, preparar: async (p) => {
    await p.goto(`${FRONT}/menu`);
    const hamburguesa = p.locator(".navbar__hamburger");
    if (await hamburguesa.isVisible()) await hamburguesa.click();
  } },
  registro: { preparar: (p) => p.goto(`${FRONT}/registro`) },
  // 2.0b · Páginas sin foto de portada (navbar sobre fondo claro)
  "recuperar-contrasena": { preparar: (p) => p.goto(`${FRONT}/recuperar-contrasena`) },
  // Sin sesión, /reservas avisa y a los 1,8 s lleva al login: el reloj se congela para la foto
  "reservas-sin-sesion": { preparar: async (p) => {
    // Reloj instalado y en pausa: el temporizador de 1,8 s no avanza mientras se mide y se captura
    const ahora = ahoraCapturas();
    await p.clock.install({ time: ahora });
    await p.clock.pauseAt(ahora + 1000);
    await p.goto(`${FRONT}/reservas`);
    await p.getByRole("heading", { name: "Inicia sesión para reservar" }).waitFor();
  } },
  "pagina-inexistente": { preparar: (p) => p.goto(`${FRONT}/esta-pagina-no-existe`) },
  perfil: { usuario: "cliente", preparar: (p) => p.goto(`${FRONT}/perfil`) },
  nosotros: { preparar: (p) => p.goto(`${FRONT}/nosotros`) },
  // Tarjeta de ubicación de Nosotros y pie de página (horarios)
  "nosotros-ubicacion": {
    completa: false,
    preparar: async (p) => {
      await p.goto(`${FRONT}/nosotros`);
      await p.waitForLoadState("networkidle");
      await p.locator(".ubicacion-card").scrollIntoViewIfNeeded();
      await p.waitForTimeout(800);
    },
  },
  pie: {
    completa: false,
    preparar: async (p) => {
      await p.goto(`${FRONT}/`);
      await p.waitForLoadState("networkidle");
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    },
  },
  "cuenta-cliente": { usuario: "cliente", preparar: (p) => p.goto(`${FRONT}/cuenta`) },
  "cuenta-mesero": { usuario: "mesero", preparar: (p) => p.goto(`${FRONT}/cuenta`) },
  "cuenta-cliente-pedidos": { usuario: "cliente", preparar: async (p) => {
    await p.goto(`${FRONT}/cuenta`);
    await p.getByRole("button", { name: /mis pedidos/i }).click();
  } },
  "cuenta-cliente-reservas": { usuario: "cliente", preparar: async (p) => {
    await p.goto(`${FRONT}/cuenta`);
    await p.getByRole("button", { name: /mis reservas/i }).click();
  } },
  "admin-pedido-detalle": {
    usuario: "admin",
    completa: false,
    preparar: async (p) => {
      await abrirPestanaAdmin("Pedidos")(p);
      await p.getByRole("button", { name: /ver detalle/i }).first().click();
      await p.waitForTimeout(400);
    },
  },
  "admin-pedido-detalle-final": {
    usuario: "admin",
    completa: false,
    preparar: async (p) => {
      await abrirPestanaAdmin("Pedidos")(p);
      await p.getByRole("button", { name: /ver detalle/i }).first().click();
      await p.waitForTimeout(400);
      await p.locator(".admin-modal-container").evaluate((el) => el.scrollTo(0, el.scrollHeight));
    },
  },
  // Carrito con dos productos (uno con cantidad 2). El carrito vive en memoria:
  // se llega a /domicilios con el enlace del navbar, sin recargar la página.
  carrito: {
    usuario: "cliente",
    preparar: async (p) => {
      await p.goto(`${FRONT}/menu`);
      await p.waitForLoadState("networkidle");
      // 1.14 · Platos sin opciones (desde 1.12 los que tienen abren el diálogo y taparían los clics)
      const catalogo = await (await p.context().request.get(`${API}/catalogo?incluir=modificadores`)).json();
      const [uno, dos] = catalogo.productos.filter((pr) => pr.disponible !== false && !pr.modificadores?.length);
      const agregar = (pr) => p.locator(`#producto-${pr.codigo}`).getByRole("button", { name: "Agregar al carrito" }).click({ force: true });
      await agregar(uno);
      await agregar(uno);
      await agregar(dos);
      const enlace = p.locator(".menu__item-carrito a");
      if (!(await enlace.isVisible())) await p.locator(".navbar__hamburger").click(); // navbar colapsado
      await enlace.click();
      await p.waitForLoadState("networkidle");
    },
  },
  // 1.12 · Opciones del plato en el pedido a domicilio: diálogo desde el menú, carrito con el mismo plato
  // en dos líneas (opciones distintas) y el pedido con opciones en Mis pedidos, el admin y /staff
  "menu-opciones": {
    usuario: "cliente",
    completa: false,
    preparar: async (p) => {
      await p.goto(`${FRONT}/menu`);
      await p.waitForLoadState("networkidle");
      await agregarPlatoConOpciones(p, { nota: "Sin sal" });
    },
  },
  "carrito-opciones": {
    usuario: "cliente",
    preparar: async (p) => {
      await p.goto(`${FRONT}/menu`);
      await p.waitForLoadState("networkidle");
      for (const [n, nota] of [[0, "Sin sal"], [1, ""]]) {
        if (await agregarPlatoConOpciones(p, { n, nota })) {
          await p.getByRole("dialog").getByRole("button", { name: /^Agregar/ }).click();
        }
      }
      const enlace = p.locator(".menu__item-carrito a");
      if (!(await enlace.isVisible())) await p.locator(".navbar__hamburger").click();
      await enlace.click();
      await p.waitForLoadState("networkidle");
    },
  },
  "cuenta-cliente-pedidos-opciones": { usuario: "cliente", preparar: async (p) => {
    await pedidoConOpciones();
    await p.goto(`${FRONT}/cuenta`);
    await p.getByRole("button", { name: /mis pedidos/i }).click();
    await p.waitForLoadState("networkidle");
  } },
  "admin-pedido-opciones": {
    usuario: "admin",
    completa: false,
    preparar: async (p) => {
      await pedidoConOpciones();
      await abrirPestanaAdmin("Pedidos")(p);
      await p.getByRole("button", { name: /ver detalle/i }).first().click();
      await p.waitForTimeout(400);
    },
  },
  "staff-pedidos-opciones": { usuario: "mesero", preparar: async (p) => {
    await pedidoConOpciones();
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("navigation", { name: /secciones del panel/i }).getByRole("button", { name: "Pedidos" }).click();
    await p.waitForLoadState("networkidle");
  } },
  // 1.11 · Dirección: «Cra 36b Oriente #30-06» se acepta y una sin número muestra el ejemplo
  "carrito-direccion": {
    usuario: "cliente",
    completa: false,
    preparar: async (p) => {
      await VISTAS.carrito.preparar(p);
      const direccion = p.getByPlaceholder("Ej: Calle 8 # 12-34");
      await direccion.fill("Barrio Centro");
      await p.getByRole("button", { name: "FINALIZAR COMPRA" }).click();
      await direccion.scrollIntoViewIfNeeded();
    },
  },
  // 1.14 · Rechazo real del servidor: con el carrito lleno, el admin agota el primer plato (BD de
  // capturas) y el pedido vuelve con 409 PRODUCT_UNAVAILABLE y sus líneas, que el carrito marca
  "carrito-problema": {
    usuario: "cliente",
    completa: false,
    preparar: async (p) => {
      await VISTAS.carrito.preparar(p);
      const nombre = (await p.locator(".carrito-producto__nombre").first().textContent()).trim();
      await disponibilidad(nombre, false);
      try {
        await p.getByPlaceholder("Ej: Calle 8 # 12-34").fill("Mz 5 Cs 3, Villa del Sol");
        await p.getByPlaceholder("Barrio o conjunto...").fill("Centro");
        const hora = p.locator("#carrito-hora");
        await hora.locator("option[value]:not([value=''])").first().waitFor({ state: "attached" });
        await hora.selectOption(await hora.locator("option[value]:not([value=''])").first().getAttribute("value"));
        await p.getByRole("button", { name: "FINALIZAR COMPRA" }).click();
        await p.getByRole("button", { name: "Confirmar Pedido" }).click();
        await p.locator(".carrito-producto__item.is-problema").first().waitFor();
        await p.getByRole("button", { name: "Editar Pedido" }).click(); // cierra el resumen; el aviso queda en el formulario
        await p.locator(".carrito-producto__item.is-problema").first().scrollIntoViewIfNeeded();
      } finally {
        await disponibilidad(nombre, true);
      }
    },
  },
  // Reservas: fecha de la próxima semana para ver todas las horas del día (0.8)
  reservas: {
    usuario: "cliente",
    preparar: async (p) => {
      await p.goto(`${FRONT}/reservas`);
      await p.waitForLoadState("networkidle");
      const fecha = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      await p.locator("#fecha").fill(fecha);
      // Un jueves o viernes de la próxima semana acepta hasta las 7:00 p. m.; si cae en fin de semana, 5:00 p. m.
      const ultima = await p.locator("#hora option").last().getAttribute("value");
      await p.locator("#hora").selectOption(ultima);
    },
  },
  // Checkout a las 07:30 de Bogotá (reloj del navegador): horas de 9:00 a 16:00
  "carrito-manana": {
    usuario: "cliente",
    completa: false,
    preparar: async (p) => {
      const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
      await p.clock.setFixedTime(new Date(`${hoy}T07:30:00-05:00`));
      await VISTAS.carrito.preparar(p);
      await p.locator("#carrito-hora").selectOption("10:00");
      await p.locator("#carrito-hora").scrollIntoViewIfNeeded();
      const opciones = await p.locator("#carrito-hora option").allTextContents();
      console.log(`  opciones: ${opciones.join(" | ")}`);
    },
  },
  "admin-horarios": { usuario: "admin", preparar: abrirPestanaAdmin("Horarios") },
  // 1.15 · Otro admin guarda (por la API, BD de capturas) mientras la pantalla está abierta: 409 real
  "admin-horarios-conflicto": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Horarios")(p);
    const otro = await request.newContext();
    try {
      await otro.post(`${API}/auth/login`, { data: { correo: USUARIOS.admin, contraseña: CLAVE } });
      const { horarios, version } = await (await otro.get(`${API}/admin/horarios`)).json();
      const res = await otro.put(`${API}/admin/horarios`, {
        data: { ...horarios, domicilio: { ...horarios.domicilio, anticipacionMinutos: horarios.domicilio.anticipacionMinutos + 30 }, versionEsperada: version },
      });
      if (!res.ok()) throw new Error(`El otro admin no pudo guardar: ${res.status()}`);
    } finally {
      await otro.dispose();
    }
    await p.getByLabel("Última hora de domicilio").selectOption("15:00");
    await p.getByRole("button", { name: /guardar horarios/i }).click();
    await p.getByRole("button", { name: "Recargar" }).scrollIntoViewIfNeeded();
  } },
  "admin-salon": { usuario: "admin", preparar: abrirPestanaAdmin("Salón") }, // 1.2
  "admin-salon-mesa-form": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Salón")(p);
    await p.getByRole("button", { name: "Nueva mesa" }).click();
  } },
  // Respaldo de las tablas: un texto largo no debe ensanchar la página, solo el contenedor
  "admin-reservas-texto-largo": {
    usuario: "admin",
    completa: false,
    preparar: async (p) => {
      await abrirPestanaAdmin("Reservas")(p);
      const medidas = await p.evaluate(() => {
        const celda = document.querySelector(".admin-reservas__tabla tbody td");
        if (celda) celda.insertAdjacentHTML("beforeend", `<span style="white-space:nowrap">${"TextoMuyLargoSinEspacios".repeat(8)}</span>`);
        const c = document.querySelector(".admin-table-container");
        return { contenedor: c.clientWidth, tabla: c.scrollWidth, pagina: document.documentElement.scrollWidth, ventana: window.innerWidth };
      });
      console.log(`  medidas: ${JSON.stringify(medidas)}`);
      await p.locator(".admin-table-container").first().scrollIntoViewIfNeeded();
    },
  },
  "admin-productos": { usuario: "admin", preparar: abrirPestanaAdmin("Productos") },
  // 1.3 · estación por defecto, estación propia del producto y grupos de modificadores
  "admin-categorias": { usuario: "admin", preparar: abrirPestanaAdmin("Categorías") },
  "admin-categoria-form": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Categorías")(p);
    await p.getByRole("button", { name: "Editar" }).first().click();
  } },
  // 1.3b · borrar una categoría con productos: aviso y botón deshabilitado (el backend da 409)
  "admin-categoria-eliminar": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Categorías")(p);
    await p.getByRole("button", { name: /^Eliminar categoría/ }).first().click();
  } },
  "admin-producto-form": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Productos")(p);
    await p.getByRole("button", { name: /^editar/i }).first().click();
    await p.waitForTimeout(400);
  } },
  "admin-producto-form-final": { usuario: "admin", completa: false, preparar: async (p) => {
    await VISTAS["admin-producto-form"].preparar(p);
    await p.locator(".admin-modal-container").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  } },
  "admin-modificadores": { usuario: "admin", preparar: abrirPestanaAdmin("Modificadores") },
  "admin-modificadores-form": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Modificadores")(p);
    await p.getByRole("button", { name: "Editar" }).first().click();
    await p.waitForTimeout(400);
  } },
  "admin-pedidos": { usuario: "admin", preparar: abrirPestanaAdmin("Pedidos") },
  "admin-reservas": { usuario: "admin", preparar: abrirPestanaAdmin("Reservas") },
  "admin-resumen": { usuario: "admin", preparar: abrirPestanaAdmin("Resumen") },
  // 2.0c · El admin recién abierto, arriba del todo: el navbar con el logo a la vista
  "admin-inicio": { usuario: "admin", completa: false, preparar: async (p) => {
    await p.goto(`${FRONT}/admin`);
    await p.getByRole("heading", { name: /Hola,/ }).waitFor();
    await p.evaluate(() => window.scrollTo(0, 0));
  } },
  // Imagen de 3 MB en "Nuevo producto": debe salir el aviso del límite de 2 MB
  "admin-producto-imagen-grande": {
    usuario: "admin",
    completa: false,
    preparar: async (p) => {
      await abrirPestanaAdmin("Productos")(p);
      await p.getByRole("button", { name: /nuevo producto/i }).click();
      await p.getByLabel("Imagen del producto").setInputFiles({
        name: "foto-grande.png", mimeType: "image/png", buffer: Buffer.alloc(3 * 1024 * 1024, 1),
      });
    },
  },
  "admin-roles": { usuario: "admin", preparar: abrirPestanaAdmin("Roles") },
  // Tras 1.12 · Aviso en el formulario de un rol con «abrir cuenta» sin «tomar comandas» ni «transferir»
  "admin-rol-aviso": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Roles")(p);
    await p.getByRole("button", { name: /Nuevo Rol/ }).click();
    const abrir = p.getByRole("checkbox", { name: "Abrir la cuenta de una mesa" });
    await abrir.check();
    await abrir.scrollIntoViewIfNeeded();
  } },
  "admin-rol-aviso-pie": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Roles")(p);
    await p.getByRole("button", { name: /Nuevo Rol/ }).click();
    await p.getByRole("checkbox", { name: "Abrir la cuenta de una mesa" }).check();
    await p.getByRole("button", { name: "Crear Rol" }).scrollIntoViewIfNeeded();
  } },
  // La fila de la lista con el aviso: un rol de ejemplo creado por la API (solo en la BD de capturas)
  "admin-roles-aviso": { usuario: "admin", preparar: async (p) => {
    await p.context().request.post(`${API}/admin/roles`, { data: { nombre: "Recepción (ejemplo)", permisos: ["mesa:ver", "cuenta:abrir"] } });
    await abrirPestanaAdmin("Roles")(p);
    await p.getByText("Recepción (ejemplo)").scrollIntoViewIfNeeded();
  } },
  "admin-metodos-pago": { usuario: "admin", preparar: abrirPestanaAdmin("Métodos de Pago") },
  "admin-usuarios": { usuario: "admin", preparar: abrirPestanaAdmin("Usuarios") },
  // Ajuste tras 1.5b · Una cuenta creada por el admin que aún no definió su contraseña: «Reenviar enlace»
  "admin-usuarios-pendiente": { usuario: "admin", preparar: async (p) => {
    const roles = await (await p.context().request.get(`${API}/admin/roles`)).json();
    const mesero = roles.find((r) => r.nombre === "mesero" || r.codigo === "mesero");
    await p.context().request.post(`${API}/admin/usuarios`, {
      data: { nombre: "Nueva", apellido: "Prueba", correo: "nueva.dev@brunchcafe.test", rolId: mesero.id },
    });
    await abrirPestanaAdmin("Usuarios")(p);
  } },
  // 1.5b · Formulario «Crear usuario» (sin contraseña: la persona la crea con el enlace)
  "admin-usuarios-crear": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Usuarios")(p);
    await p.getByRole("button", { name: "Crear usuario" }).click();
  } },
  "admin-estados": { usuario: "admin", preparar: abrirPestanaAdmin("Estados") },
  "admin-comentarios": { usuario: "admin", preparar: abrirPestanaAdmin("Comentarios") },
  comentarios: { preparar: (p) => p.goto(`${FRONT}/comentarios`) },
  "cuenta-cliente-comentarios": { usuario: "cliente", preparar: async (p) => {
    await p.goto(`${FRONT}/cuenta`);
    await p.getByRole("button", { name: /mis comentarios/i }).click();
  } },
  "cuenta-cliente-seguridad": { usuario: "cliente", preparar: async (p) => {
    await p.goto(`${FRONT}/cuenta`);
    await p.getByRole("button", { name: /seguridad/i }).click();
  } },
  // Panel del personal (1.1: botón «Cambiar de usuario» en la cabecera)
  // 1.6: con mesa:ver el panel abre en el plano; el resumen está en su pestaña
  "staff-resumen": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("navigation", { name: /secciones del panel/i }).getByRole("button", { name: "Resumen" }).click();
  } },
  // 1.6 · Plano de mesas (tablet): /staff abre en el plano para quien tiene mesa:ver
  "staff-plano": { usuario: "mesero", preparar: (p) => p.goto(`${FRONT}/staff`) },
  // 2.4 · Estados del tiempo real sin canal: rechazado por el servidor («Sin tiempo real») o cortado
  // por la red («Reconectando…», EventSource reintenta); con el plano además sin poder actualizarse
  "staff-plano-sin-vivo": { usuario: "mesero", preparar: async (p) => {
    await p.route("**/v1/staff/eventos**", (r) => r.fulfill({ status: 503, body: "" }));
    await p.goto(`${FRONT}/staff`);
    await p.getByText("Sin tiempo real").waitFor();
  } },
  "staff-plano-reconectando": { usuario: "mesero", preparar: async (p) => {
    await p.route("**/v1/staff/eventos**", (r) => r.abort("connectionreset"));
    await p.goto(`${FRONT}/staff`);
    await p.getByText("Actualizado hace").waitFor();
    await p.route("**/v1/staff/salon/mesas", (r) => r.abort("connectionreset"));
    await p.getByRole("button", { name: "Actualizar" }).click();
    await p.getByText("Reconectando…").waitFor();
    await p.getByRole("alert").filter({ hasText: "No se pudo actualizar" }).waitFor();
  } },
  // Panel de una mesa ocupada (acciones) y de una libre (abrir cuenta con comensales)
  "staff-plano-ocupada": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 1,/ }).click();
  } },
  "staff-plano-libre": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 2,/ }).click();
  } },
  // Revisión de 1.6 · «Unir mesas» desde la mesa 1 (todas las de la zona; las no elegibles con su motivo)
  "staff-plano-unir": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 1,/ }).click();
    await p.getByRole("button", { name: "Unir mesas" }).click();
    await p.locator(".panel-mesa").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  } },
  // 1.7b · Lista «Mesero responsable» (abrir) y «Nuevo mesero» (transferir). Un <select> nativo no se ve
  // abierto en una captura: se le da size para que muestre todas sus opciones
  "staff-plano-meseros": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 2,/ }).click();
    await desplegarSelect(p);
  } },
  "staff-plano-transferir": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 1,/ }).click();
    await p.getByRole("button", { name: "Transferir" }).click();
    // Con un solo mesero en la BD de capturas no hay lista: sale el aviso «No hay otros meseros…»
    await p.locator(".panel-mesa select, .panel-mesa .panel-mesa__nota--recuadro").last().waitFor();
    if (await p.locator(".panel-mesa select").count()) await desplegarSelect(p);
  } },
  // Tarjeta seleccionada con un estado largo (la etiqueta no debe cambiar de posición al seleccionarla)
  "staff-plano-bloqueada": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 4,/ }).click();
  } },
  // Mesa ocupada no combinable: en vez de «Unir mesas», el aviso «Esta mesa no es combinable» (1.7b: dónde
  // cambiarlo solo lo ve quien tiene salon:configurar). Desbloquea y abre la
  // mesa 4 (la única no combinable del seed) por la API; va al final porque cambia el plano de las demás vistas
  "staff-plano-no-combinable": { usuario: "mesero", preparar: async (p) => {
    const plano = await (await p.context().request.get(`${API}/staff/salon/mesas`)).json();
    const cuatro = plano.mesas.find((m) => m.numero === 4);
    if (cuatro.estado === "bloqueada") {
      await p.context().request.post(`${API}/staff/salon/mesas/${cuatro.id}/estado`, { data: { a: "libre", motivo: "Capturas" } });
    }
    if (!cuatro.cuenta) {
      await p.context().request.post(`${API}/staff/salon/mesas/${cuatro.id}/abrir`, {
        data: { comensales: 2 }, headers: { "Idempotency-Key": `capturas-mesa-4-${Date.now()}` },
      });
    }
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 4,/ }).click();
  } },
  // Revisión de 1.6 · Pantalla del enlace «Crea tu contraseña» con la primera contraseña a la vista
  "crear-contrasena": { preparar: async (p) => {
    await p.goto(`${FRONT}/restablecer-contrasena?token=capturas&tipo=crear`);
    await p.getByLabel("Nueva contraseña", { exact: true }).fill("Ejemplo-de-clave-1");
    await p.getByLabel(/confirma la nueva contraseña/i).fill("Ejemplo-de-clave-1");
    const mostrar = p.getByRole("button", { name: "Mostrar contraseña" });
    if (await mostrar.count()) await mostrar.first().click();
  } },
  "admin-perfil": { usuario: "admin", preparar: abrirPestanaAdmin("Mi Perfil") },
  // Revisión de 1.6 · Aviso tras crear un usuario sin servidor de correo (la API de capturas no tiene SMTP)
  "admin-usuarios-aviso": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Usuarios")(p);
    await p.getByRole("button", { name: "Crear usuario" }).click();
    const formulario = p.getByRole("dialog", { name: "Crear usuario" });
    await formulario.getByLabel(/^Nombre/).fill("Aviso");
    await formulario.getByLabel(/^Apellido/).fill("Prueba");
    await formulario.getByLabel(/^Correo/).fill(`aviso.${Date.now()}.dev@brunchcafe.test`); // la BD de capturas se recrea en cada ejecución
    await formulario.getByLabel(/^Rol/).selectOption({ label: "Mesero" });
    await formulario.getByRole("button", { name: "Crear usuario" }).click();
    await p.getByRole("dialog", { name: "Crear la cuenta" }).getByRole("button", { name: "Crear cuenta" }).click();
    await p.getByRole("dialog", { name: "Cuenta creada" }).waitFor();
  } },
  // 1.7 · Toma de comanda (mesero): cuenta de la mesa 1 con el menú (un producto agotado), diálogo de
  // modificadores, ronda en curso, confirmación de envío, cuenta pedida e ítem rechazado al enviar.
  "staff-comanda": { usuario: "mesero", preparar: async (p) => {
    await disponibilidad("Té helado de jazmín", false);
    await abrirCuentaDeMesa(p, 1);
    await p.getByRole("group", { name: "Categorías" }).getByRole("button", { name: "Bebidas" }).click();
  } },
  "staff-comanda-producto": { usuario: "mesero", preparar: async (p) => {
    await abrirCuentaDeMesa(p, 1);
    await p.getByRole("group", { name: "Categorías" }).getByRole("button", { name: "Desayunos" }).click();
    await p.getByRole("button", { name: /^Desayuno clásico gourmet/ }).click();
    const dialogo = p.getByRole("dialog", { name: "Desayuno clásico gourmet" });
    await dialogo.getByRole("radio", { name: /Yema media/ }).check();
    await dialogo.getByRole("checkbox").first().check();
    await dialogo.getByRole("textbox", { name: /Nota/ }).fill("Tostadas sin mantequilla");
  } },
  "staff-comanda-ronda": { usuario: "mesero", preparar: async (p) => {
    await agregarRondaDeEjemplo(p);
    await verCuentaEnVertical(p);
  } },
  "staff-comanda-enviar": { usuario: "mesero", preparar: async (p) => {
    await agregarRondaDeEjemplo(p);
    await verCuentaEnVertical(p);
    await p.getByRole("button", { name: /^Enviar ronda/ }).click();
    await p.getByRole("dialog", { name: /^Enviar la ronda/ }).waitFor();
  } },
  "staff-comanda-pedida": { usuario: "mesero", preparar: async (p) => {
    await abrirCuentaDeMesa(p, 3);
    await verCuentaEnVertical(p);
  } },
  // El latte se agota con la ronda sin enviar: el envío se rechaza entero y el ítem queda marcado (D3)
  "staff-comanda-no-disponible": { usuario: "mesero", preparar: async (p) => {
    await agregarRondaDeEjemplo(p);
    await disponibilidad("Latte frío artesanal", false);
    await verCuentaEnVertical(p);
    await p.getByRole("button", { name: /^Enviar ronda/ }).click();
    await p.getByRole("dialog", { name: /^Enviar la ronda/ }).getByRole("button", { name: "Enviar" }).click();
    await p.getByRole("alertdialog", { name: /No se envió la ronda/ }).getByRole("button", { name: "Entendido" }).click();
    await disponibilidad("Latte frío artesanal", true);
  } },
  // Cancelar una cuenta sin rondas enviadas (mesa 6): motivo obligatorio (D4)
  "staff-comanda-cancelar": { usuario: "mesero", preparar: async (p) => {
    await abrirCuentaDeMesa(p, 6);
    await verCuentaEnVertical(p);
    await p.getByRole("button", { name: "Cancelar cuenta" }).click();
    await p.getByRole("dialog", { name: "Cancelar la cuenta" }).waitFor();
  } },
  // 1.9 · «Cuentas abiertas»: salón + domicilio (solo lectura), todas y filtradas por domicilio
  "staff-cuentas": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("navigation", { name: /secciones del panel/i }).getByRole("button", { name: "Cuentas" }).click();
    await p.getByRole("list", { name: "Cuentas abiertas" }).waitFor();
  } },
  "staff-cuentas-domicilio": { usuario: "mesero", preparar: async (p) => {
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("navigation", { name: /secciones del panel/i }).getByRole("button", { name: "Cuentas" }).click();
    await p.getByRole("group", { name: "Canal" }).getByRole("button", { name: /^Domicilio/ }).click();
  } },
  // F1-19 · El administrador entra al panel de sala desde el admin y anula con motivo desde la comanda
  "admin-panel-sala": { usuario: "admin", completa: false, preparar: (p) => p.goto(`${FRONT}/admin`) },
  "staff-admin-plano": { usuario: "admin", preparar: async (p) => {
    await p.goto(`${FRONT}/admin`);
    await p.getByRole("link", { name: "Panel de sala" }).click();
    await p.getByRole("button", { name: /^Mesa 1,/ }).waitFor();
  } },
  // 2.0b · «Panel de administración» con el foco y el puntero (Foundation lo pintaba azul)
  "staff-admin-panel-foco": { usuario: "admin", completa: false, preparar: async (p) => {
    await VISTAS["staff-admin-plano"].preparar(p);
  }, antesDeCaptura: async (p) => {
    const enlace = p.getByRole("link", { name: "Panel de administración" });
    await enlace.focus();
    await enlace.hover();
    await p.waitForTimeout(300);
  } },
  "staff-admin-anular": { usuario: "admin", preparar: async (p) => {
    await abrirCuentaDeMesa(p, 1);
    await verCuentaEnVertical(p);
    await p.getByRole("button", { name: /^Anular / }).first().click();
    await p.getByRole("dialog", { name: /^Anular / }).waitFor();
  } },
  // Login tras «Cambiar de usuario». Cierra la sesión del contexto: se vuelve a iniciar en cada ancho
  "staff-cambio-usuario": { usuario: "mesero", cierraSesion: true, preparar: async (p) => {
    await p.context().request.post(`${API}/auth/login`, { data: { correo: USUARIOS.mesero, contraseña: CLAVE } });
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: "Cambiar de usuario" }).click();
    await p.waitForURL("**/login");
  } },
  // 2.5 · KDS (cocina.dev). Al final: preparan datos que cambian el salón de las vistas anteriores
  "kds-cocina": { usuario: "cocina", completa: false, preparar: (p) => abrirKds(p, "Cocina") },
  // 2.5b · cocina.dev solo tiene Cocina: la barra la mira el admin (ve todas, con los botones de cambio)
  "kds-barra": { usuario: "admin", completa: false, preparar: (p) => abrirKds(p, "Barra") },
  // 2.5b · Admin › Roles: estaciones del KDS del rol Cocina
  "admin-roles-estaciones": { usuario: "admin", completa: false, preparar: async (p) => {
    await abrirPestanaAdmin("Roles")(p);
    const fila = p.getByRole("row").filter({ has: p.getByText("Cocina", { exact: true }) }).first();
    await fila.getByRole("button", { name: /editar/i }).click();
    await p.getByRole("group", { name: "Estaciones del KDS" }).waitFor();
  }, alFinal: (p) => p.getByRole("group", { name: "Cocina y barra" }).evaluate((g) => g.scrollIntoView({ block: "start" })) },
  // «Listo» recién marcado: la tarjeta ofrece «Deshacer» con la cuenta atrás (F2-7)
  "kds-deshacer": { usuario: "cocina", completa: false, preparar: async (p) => {
    await abrirKds(p, "Cocina");
    // Un ítem (no el domicilio); en el segundo tamaño ya no queda ninguno en preparación: se empieza uno
    const listo = p.getByRole("button", { name: /^Listo: \d+ × / });
    if (!(await listo.count())) {
      await p.getByRole("button", { name: /^Empezar: \d+ × / }).first().click();
      await listo.first().waitFor();
    }
    await listo.first().click();
    await p.getByRole("button", { name: /^Deshacer: / }).first().waitFor();
  } },
  // 2.6 · Aviso al mesero y «Servir»: plano con el aviso y la insignia, la cuenta con «Servir» y el
  // «Deshacer» del admin con motivo obligatorio (después de las del KDS: usan su ronda de la mesa 5)
  "staff-listos-plano": { usuario: "mesero", completa: false, preparar: async (p) => {
    await prepararListos();
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("status", { name: "Listo para servir" }).waitFor();
  } },
  "staff-listos-cuenta": { usuario: "mesero", completa: false, preparar: async (p) => {
    await prepararListos();
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("status", { name: "Listo para servir" }).getByRole("button", { name: /^Mesa 5/ }).click();
    await p.getByRole("heading", { name: /^Mesa 5/, level: 2 }).waitFor();
    await verCuentaEnVertical(p);
  }, alFinal: async (p) => {
    // En vertical se baja a las rondas; en horizontal se ven la cabecera y el aviso
    if (p.viewportSize().width < 1000) await p.getByRole("region", { name: "Rondas enviadas" }).evaluate((r) => r.scrollIntoView({ block: "start" }));
  } },
  // 2.6b · El caso 2 de Brayan con dos pantallas reales: el mesero tiene abierta la cuenta de la mesa 5 y
  // cocina.dev marca «Empezar» y «Listo» en /kds; sin recargar, en la cuenta aparece un «Servir» más (canal
  // en vivo). Falla si la cuenta no se actualiza o si cualquiera de las dos pantallas registra errores
  "staff-listo-en-vivo": { usuario: "mesero", completa: false, preparar: async (p) => {
    await prepararListos();
    const api = p.context().request;
    const leer = async (promesa, que) => {
      const res = await promesa;
      if (!res.ok()) throw new Error(`En vivo (${que}): ${res.status()} ${(await res.text()).slice(0, 200)}`);
      return res.json();
    };
    const { mesas } = await leer(api.get(`${API}/staff/salon/mesas`), "plano");
    const cuentaId = mesas.find((m) => m.numero === 5)?.cuenta?.id;
    const { productos } = await leer(api.get(`${API}/staff/salon/catalogo`), "catálogo");
    const plato = productos.find((pr) => pr.disponible && pr.estacion?.codigo === "cocina" && !pr.modificadores?.length);
    const { cuenta } = await leer(api.post(`${API}/staff/salon/cuentas/${cuentaId}/items`, { data: { productoId: plato.id, cantidad: 1 } }), "agregar");
    const n = cuenta.rondas.find((r) => r.estado === "borrador").numeroRonda;
    await leer(api.post(`${API}/staff/salon/cuentas/${cuentaId}/rondas/${n}/enviar`, { data: { numeroRonda: n, versionEsperada: cuenta.version } }), "enviar");
    await abrirCuentaDeMesa(p, 5);
    await verCuentaEnVertical(p);
    const nombreServir = `Servir 1 × ${plato.nombre}`;
    const antes = await p.getByRole("button", { name: nombreServir }).count();

    const kds = await (await contextoDe("cocina")).newPage();
    const erroresKds = [];
    escucharErrores(kds, erroresKds);
    try {
      await kds.setViewportSize({ width: 1280, height: 800 });
      await kds.goto(`${FRONT}/kds`);
      await kds.getByRole("region", { name: "Cola de Cocina" }).waitFor();
      // La tarjeta de esta ronda (en la ejecución completa la cola tiene otras con el mismo plato)
      const tarjeta = kds.locator("article")
        .filter({ has: kds.getByRole("heading", { name: /^Mesa 5$/ }) })
        .filter({ has: kds.getByText(new RegExp(`^Ronda ${n}( ·|$)`)) });
      await tarjeta.getByRole("button", { name: `Empezar: 1 × ${plato.nombre}` }).first().click();
      await tarjeta.getByRole("button", { name: `Listo: 1 × ${plato.nombre}` }).first().click();
      await tarjeta.getByRole("button", { name: /^Deshacer: / }).first().waitFor();
      if (erroresKds.length) throw new Error(`errores en /kds: ${erroresKds.join(" | ")}`);
    } finally {
      await kds.close();
    }
    // Sin recargar: llega por el canal en vivo de la cuenta
    await p.waitForFunction(([nombre, previos]) => [...document.querySelectorAll("button")]
      .filter((b) => b.getAttribute("aria-label") === nombre).length > previos, [nombreServir, antes], { timeout: 10_000 });
  }, alFinal: async (p) => {
    if (p.viewportSize().width < 1000) await p.getByRole("region", { name: "Rondas enviadas" }).evaluate((r) => r.scrollIntoView({ block: "end" }));
  } },
  // 2.7 · «Agotados» (F2-5): el mesero agota desde /staff (confirmación: no puede reactivar) y la cocina ve
  // el panel desde /kds en su estación, con un producto y una opción ya agotados (los agota el admin por la API)
  "staff-agotados": { usuario: "mesero", completa: false, preparar: async (p) => {
    await prepararAgotados();
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("navigation", { name: /secciones del panel/i }).getByRole("button", { name: "Agotados" }).click();
    await p.getByRole("list", { name: "Productos" }).waitFor();
  } },
  "staff-agotados-confirmar": { usuario: "mesero", completa: false, preparar: async (p) => {
    await prepararAgotados();
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("navigation", { name: /secciones del panel/i }).getByRole("button", { name: "Agotados" }).click();
    await p.getByRole("button", { name: /^Agotar / }).first().click();
    await p.getByRole("dialog", { name: /^Agotar / }).waitFor();
  } },
  "kds-agotados": { usuario: "cocina", completa: false, preparar: async (p) => {
    await prepararAgotados();
    await p.goto(`${FRONT}/kds`);
    await p.getByRole("button", { name: "Agotados" }).click();
    await p.getByRole("list", { name: "Productos" }).waitFor();
  } },
  // 2.6b · Aviso del límite de errores: una sección que no puede dibujarse (la API responde, en el navegador,
  // una ronda sin ítems) muestra «Algo salió mal en esta sección» y el resto de la pantalla sigue
  "staff-limite-errores": { usuario: "mesero", completa: false, erroresEsperados: ERRORES_LIMITE, preparar: async (p) => {
    await p.route(/\/staff\/salon\/cuentas\/[0-9a-f]{24}$/, async (ruta) => {
      const r = await ruta.fetch();
      const cuenta = await r.json();
      await ruta.fulfill({ response: r, json: { ...cuenta, rondas: [{ id: "x", numeroRonda: 1, estado: "enviada", subtotal: 0, items: null }] } });
    });
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: /^Mesa 1,/ }).click();
    await p.getByRole("button", { name: /^Ver cuenta/ }).click();
    await p.getByRole("alert").filter({ hasText: "Algo salió mal en esta sección" }).waitFor();
  } },
  "kds-limite-errores": { usuario: "cocina", completa: false, erroresEsperados: ERRORES_LIMITE, preparar: async (p) => {
    await p.route(/\/staff\/cocina\/cola\?/, async (ruta) => {
      const r = await ruta.fetch();
      const cola = await r.json();
      await ruta.fulfill({ response: r, json: { ...cola, salon: [{ tipo: "salon", comandaId: "x", cuentaId: "c", numeroRonda: 1, mesas: [1], mesero: "Mesero P.", enviadaEn: new Date(ahoraCapturas()).toISOString(), items: null }] } });
    });
    await p.goto(`${FRONT}/kds`);
    await p.getByRole("alert").filter({ hasText: "Algo salió mal en esta sección" }).waitFor();
  } },
  "staff-listos-deshacer": { usuario: "admin", completa: false, preparar: async (p) => {
    await prepararListos();
    await abrirCuentaDeMesa(p, 5);
    await verCuentaEnVertical(p);
    await p.getByRole("button", { name: /^Deshacer «listo» de / }).first().click();
    await p.getByRole("dialog", { name: "Deshacer «listo»" }).waitFor();
  } },
};

// Sin --hide-scrollbars (Playwright lo pone por defecto): así se ven las barras de desplazamiento
// 2.6b · Errores del navegador que hacen fallar una vista: los de la página (excepciones sin capturar, como
// el ReferenceError que dejó /staff en blanco) y los console.error (también los del límite de errores y los
// avisos de React). Los «Failed to load resource» son respuestas HTTP de error que algunas vistas provocan a
// propósito (409, 401…): esas no cuentan.
const erroresConsola = [];
const escucharErrores = (pagina, lista) => {
  pagina.on("pageerror", (e) => lista.push(`pageerror: ${e.message}`));
  pagina.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) lista.push(`console.error: ${m.text().split("\n")[0]}`);
  });
};

const navegador = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
await mkdir(SALIDA, { recursive: true });
const contextos = {};

const contextoDe = async (usuario) => {
  const clave = usuario || "invitado";
  if (contextos[clave]) return contextos[clave];
  const contexto = await navegador.newContext({ locale: "es-CO", timezoneId: process.env.ZONA_NAVEGADOR || "America/Bogota" });
  await contexto.clock.install({ time: ahoraCapturas() });
  if (usuario) {
    const res = await contexto.request.post(`${API}/auth/login`, { data: { correo: USUARIOS[usuario], contraseña: CLAVE } });
    if (!res.ok()) throw new Error(`Login de prueba falló para ${usuario}: ${res.status()} (¿ejecutaste npm run seed:dev?)`);
  }
  contextos[clave] = contexto;
  return contexto;
};

let fallidas = 0;
for (const [nombre, vista] of Object.entries(VISTAS)) {
  if (SOLO && !SOLO.includes(nombre)) continue;
  for (const { ancho, alto, etiqueta, pantalla } of TAMANOS) {
    const page = await (await contextoDe(vista.usuario)).newPage();
    const consola = [];
    escucharErrores(page, consola);
    try {
      await page.setViewportSize({ width: ancho, height: alto });
      // El reloj es del contexto: cada vista empieza a la hora de capturas y en marcha (una vista anterior
      // pudo pausarlo o fijarlo)
      await page.clock.setSystemTime(ahoraCapturas());
      await page.clock.resume();
      await vista.preparar(page);
      await page.waitForLoadState("networkidle");
      // 2.6b · Una pantalla que se queda en blanco (React desmontó todo) es un fallo, no una foto
      if (await page.evaluate(() => (document.getElementById("root")?.innerHTML.trim().length ?? 0) === 0)) {
        throw new Error(`la pantalla quedó en blanco${consola.length ? `: ${consola[0]}` : ""}`);
      }
      const completa = vista.completa !== false && !pantalla;
      if (completa) {
        // Recorre la página como un usuario: las secciones con animación de entrada
        // (IntersectionObserver) solo aparecen al pasar por el viewport
        const alto = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < alto; y += 400) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(120);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      // El último clic deja el puntero sobre el menú y su :hover sale en la foto: se aparta
      await page.mouse.move(ancho - 2, alto - 2);
      await page.waitForTimeout(900); // fin de las transiciones
      // 2.0b · Contraste del navbar público (siempre que lo haya). Arriba de la página y, en las
      // páginas largas, tras bajar y volver a subir un poco (el navbar reaparece sobre el contenido)
      const medirNavbar = async (momento) => {
        const medidas = await medirContrasteNavbar(page);
        if (!medidas) return;
        const bajos = medidas.filter((m) => !m.sobreFoto && m.ratio < m.minimo);
        const sobreFoto = medidas.filter((m) => m.sobreFoto).length;
        for (const m of medidas) contrastesNavbar.push({ vista: nombre, tamano: etiqueta, momento, ...m });
        console.log(`  ${bajos.length ? `⚠ navbar: ${bajos.length} elemento(s) bajo el contraste mínimo (${bajos.map((m) => `«${m.texto}» ${m.estado} ${m.ratio}:1`).slice(0, 4).join(", ")})` : "✓ navbar con contraste suficiente"}${sobreFoto ? ` · ${sobreFoto} sobre foto (no medible)` : ""} (${nombre} ${etiqueta}, ${momento})`);
      };
      await medirNavbar("arriba");
      // 2.0b · Paleta en /staff y el admin (vistas del personal y del admin)
      if (["mesero", "admin", "cocina"].includes(vista.usuario) && /\/(staff|admin|kds)/.test(page.url())) {
        // 2.0c · Medir pasa el puntero y el foco por los botones y desplaza la página: se vuelve a donde
        // estaba (si no, la foto sale desplazada y sin el navbar)
        const posicion = await page.evaluate(() => [window.scrollX, window.scrollY]);
        const hallados = await medirPaleta(page);
        await page.evaluate(([x, y]) => { document.activeElement?.blur?.(); window.scrollTo(x, y); }, posicion);
        await page.mouse.move(ancho - 2, alto - 2);
        await page.waitForTimeout(700); // el navbar reaparece al subir
        const fuera = hallados.filter((h) => !h.deEstado);
        for (const h of hallados) azules.push({ vista: nombre, tamano: etiqueta, ...h });
        console.log(`  ${fuera.length ? `⚠ ${fuera.length} color(es) azul(es) fuera de la paleta (${fuera.slice(0, 3).map((h) => `${h.elemento} «${h.texto}» ${h.estado}`).join(", ")})` : "✓ sin azules fuera de la paleta"}${hallados.length - fuera.length ? ` · ${hallados.length - fuera.length} de estado` : ""} (${nombre} ${etiqueta})`);
      }
      if (completa && await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 600)) {
        await page.evaluate(() => window.scrollTo(0, 900));
        await page.waitForTimeout(200);
        await page.evaluate(() => window.scrollTo(0, 700)); // al subir, el navbar vuelve a mostrarse
        await page.waitForTimeout(700);
        await medirNavbar("tras desplazar");
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(700);
      }
      if (MEDIR_TACTIL) {
        // 1.6b · También los campos de formulario (no las casillas, radios ni el selector de archivo)
        const medidas = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), select, textarea')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; })
          .map((el) => { const r = el.getBoundingClientRect(); return { alto: Math.round(r.height * 10) / 10, ancho: Math.round(r.width * 10) / 10, clase: el.className?.baseVal ?? el.className, texto: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30) }; })
          .filter((m) => m.alto < 44));
        for (const m of medidas) pequenos.push({ vista: nombre, tamano: etiqueta, ...m });
        console.log(`  ${medidas.length ? `⚠ ${medidas.length} control(es) < 44 px` : "✓ todos los botones y campos ≥ 44 px"} (${nombre} ${etiqueta})`);
      }
      if (MEDIR_SOLAPES) {
        // 1.6b · Columnas que la columna fija de acciones tapa sin desplazar la tabla (por fila, en px)
        const tapadas = await page.evaluate(() => [...document.querySelectorAll(".admin-table--acciones-fijas")].flatMap((tabla) => {
          const cabeceras = [...tabla.querySelectorAll("thead th")].map((th) => th.textContent.trim());
          return [...tabla.querySelectorAll("tbody tr")].slice(0, 6).flatMap((fila) => {
            const celdas = [...fila.children];
            const fija = celdas.at(-1);
            if (!fija || fija.hasAttribute("colspan")) return [];
            // Las columnas fijas (Acciones y, desde 1.6b, la de estado) forman un bloque a la derecha:
            // se mide qué columnas no fijas quedan debajo del bloque y si alguna fija queda bajo otra
            const fijas = celdas.filter((c) => getComputedStyle(c).position === "sticky");
            const solape = (a, b) => {
              const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
              return Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            };
            const bajoBloque = celdas
              .map((celda, i) => ({ celda, columna: cabeceras[i] || `#${i + 1}` }))
              .filter(({ celda }) => !fijas.includes(celda))
              .map(({ celda, columna }) => ({ columna, tapado: Math.round(Math.max(...fijas.map((f) => solape(celda, f)))) }));
            const entreFijas = fijas.slice(0, -1).map((celda) => ({
              columna: `${cabeceras[celdas.indexOf(celda)]} (bajo Acciones)`,
              tapado: Math.round(celda.getBoundingClientRect().right - fija.getBoundingClientRect().left),
            }));
            return [...bajoBloque, ...entreFijas].filter((c) => c.tapado > 1);
          });
        }));
        const anchos = await page.evaluate(() => [...document.querySelectorAll(".admin-table--acciones-fijas thead th:last-child")]
          .map((th) => Math.round(th.getBoundingClientRect().width)));
        console.log(`  ancho de «Acciones»: ${anchos.join(", ")} px (${nombre} ${etiqueta})`);
        const unicas = [...new Map(tapadas.map((t) => [t.columna, t])).values()];
        for (const t of unicas) solapes.push({ vista: nombre, tamano: etiqueta, ...t });
        console.log(`  ${unicas.length ? `⚠ tapa: ${unicas.map((t) => `${t.columna} (${t.tapado} px)`).join(", ")}` : "✓ la columna fija no tapa ninguna"} (${nombre} ${etiqueta})`);
      }
      // 2.0b · Estado que la foto debe mostrar (p. ej. foco o puntero) tras las mediciones
      if (vista.antesDeCaptura) await vista.antesDeCaptura(page);
      const archivo = join(SALIDA, `${nombre}-${etiqueta}.png`);
      // 2.5b · Lo que la vista quiere a la vista en la foto, después de las mediciones (que mueven el foco)
      if (vista.alFinal) {
        await vista.alFinal(page);
        await page.waitForTimeout(300);
      }
      await page.screenshot({ path: archivo, fullPage: completa });
      // 2.6b · Errores de la página o de la consola: la vista falla (antes solo se anotaban junto a la foto).
      // Solo las vistas que provocan un fallo a propósito declaran los suyos (`erroresEsperados`, una lista
      // cerrada); un pageerror nunca se exime
      if (vista.erroresEsperados) {
        const { mensaje, acompanante } = vista.erroresEsperados;
        const propios = consola.filter((e) => mensaje.test(e)).length;
        if (!propios) throw new Error("se esperaba el fallo provocado y no apareció en la consola");
        let acompanantes = propios;
        consola.splice(0, consola.length, ...consola.filter((e) => {
          if (mensaje.test(e)) return false;
          if (acompanante.test(e) && acompanantes > 0) { acompanantes -= 1; return false; }
          return true;
        }));
      }
      if (consola.length) {
        erroresConsola.push({ vista: nombre, tamano: etiqueta, errores: [...consola] });
        console.error(`✗ ${archivo}\n    errores en la consola: ${consola.join(" | ").slice(0, 400)}`);
      } else {
        console.log(`✓ ${archivo}`);
      }
    } catch (error) {
      fallidas += 1;
      console.error(`✗ ${nombre} ${etiqueta}px: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  // 2.6b · Una vista que cierra la sesión (staff-cambio-usuario) deja su contexto sin cookie: las vistas
  // siguientes del mismo usuario abren uno nuevo con su login (en la ejecución completa fallaban con 401)
  if (vista.cierraSesion) {
    const clave = vista.usuario || "invitado";
    await contextos[clave]?.close();
    delete contextos[clave];
  }
}
await sesionAdmin?.dispose();
await navegador.close();
detenerTodo();
if (MEDIR_TACTIL) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SALIDA, "medicion-tactil.json"), JSON.stringify(pequenos, null, 2));
  console.log(`
Medición táctil: ${pequenos.length} control(es) < 44 px → ${join(SALIDA, "medicion-tactil.json")}`);
}
if (azules.length || SOLO?.some((v) => /^(staff|admin|kds)/.test(v))) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SALIDA, "medicion-paleta.json"), JSON.stringify(azules, null, 2));
  const fuera = azules.filter((h) => !h.deEstado);
  console.log(`
Paleta (/staff y admin): ${fuera.length} azul(es) fuera de la paleta, ${azules.length - fuera.length} de estado → ${join(SALIDA, "medicion-paleta.json")}`);
  if (fuera.length) process.exitCode = 1;
}
if (contrastesNavbar.length) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SALIDA, "medicion-contraste-navbar.json"), JSON.stringify(contrastesNavbar, null, 2));
  const bajos = contrastesNavbar.filter((m) => !m.sobreFoto && m.ratio < m.minimo);
  console.log(`
Contraste del navbar: ${bajos.length} medida(s) bajo el mínimo de ${contrastesNavbar.length} → ${join(SALIDA, "medicion-contraste-navbar.json")}`);
  if (bajos.length) process.exitCode = 1;
}
if (MEDIR_SOLAPES) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SALIDA, "medicion-solapes.json"), JSON.stringify(solapes, null, 2));
  console.log(`
Medición de solapes: ${solapes.length} columna(s) tapada(s) → ${join(SALIDA, "medicion-solapes.json")}`);
}
if (erroresConsola.length) {
  console.error(`
Errores en la consola del navegador en ${erroresConsola.length} captura(s):`);
  for (const { vista, tamano, errores } of erroresConsola) console.error(`  ${vista} ${tamano}: ${errores.join(" | ").slice(0, 300)}`);
  process.exitCode = 1;
}
// No se pisa el 1 de las mediciones (contraste del navbar, paleta)
if (fallidas) process.exitCode = 1;
