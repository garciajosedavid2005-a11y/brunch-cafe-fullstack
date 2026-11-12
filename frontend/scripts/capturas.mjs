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
  env: { ...process.env, DEV_USUARIOS_PASSWORD: CLAVE, CAPTURAS_API_PORT: PUERTO_API, CAPTURAS_FRONT_URL: FRONT },
});
const vite = arrancar("vite", [join(process.cwd(), "node_modules/vite/bin/vite.js"), "--port", PUERTO_FRONT, "--strictPort"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_API_URL: `http://localhost:${PUERTO_API}/api` },
});
try {
  await esperar(`http://localhost:${PUERTO_API}/api/health`, api, "La API de capturas");
  await esperar(FRONT, vite, "Vite");
  console.log(`Entorno de capturas listo (BD brunch-cafe-capturas · API ${PUERTO_API} · web ${PUERTO_FRONT}).`);
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
    const hora = `${String(Math.min(16, Math.max(9, new Date().getUTCHours() - 5 + 2))).padStart(2, "0")}:00`;
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
  "staff-admin-anular": { usuario: "admin", preparar: async (p) => {
    await abrirCuentaDeMesa(p, 1);
    await verCuentaEnVertical(p);
    await p.getByRole("button", { name: /^Anular / }).first().click();
    await p.getByRole("dialog", { name: /^Anular / }).waitFor();
  } },
  // Login tras «Cambiar de usuario». Cierra la sesión del contexto: se vuelve a iniciar en cada ancho
  "staff-cambio-usuario": { usuario: "mesero", preparar: async (p) => {
    await p.context().request.post(`${API}/auth/login`, { data: { correo: USUARIOS.mesero, contraseña: CLAVE } });
    await p.goto(`${FRONT}/staff`);
    await p.getByRole("button", { name: "Cambiar de usuario" }).click();
    await p.waitForURL("**/login");
  } },
};

// Sin --hide-scrollbars (Playwright lo pone por defecto): así se ven las barras de desplazamiento
const navegador = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
await mkdir(SALIDA, { recursive: true });
const contextos = {};

const contextoDe = async (usuario) => {
  const clave = usuario || "invitado";
  if (contextos[clave]) return contextos[clave];
  const contexto = await navegador.newContext({ locale: "es-CO", timezoneId: process.env.ZONA_NAVEGADOR || "America/Bogota" });
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
    page.on("console", (m) => m.type() === "error" && consola.push(m.text()));
    try {
      await page.setViewportSize({ width: ancho, height: alto });
      await vista.preparar(page);
      await page.waitForLoadState("networkidle");
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
      const archivo = join(SALIDA, `${nombre}-${etiqueta}.png`);
      await page.screenshot({ path: archivo, fullPage: completa });
      console.log(`✓ ${archivo}${consola.length ? `  (errores de consola: ${consola.join(" | ").slice(0, 200)})` : ""}`);
    } catch (error) {
      fallidas += 1;
      console.error(`✗ ${nombre} ${etiqueta}px: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
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
if (MEDIR_SOLAPES) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SALIDA, "medicion-solapes.json"), JSON.stringify(solapes, null, 2));
  console.log(`
Medición de solapes: ${solapes.length} columna(s) tapada(s) → ${join(SALIDA, "medicion-solapes.json")}`);
}
process.exitCode = fallidas ? 1 : 0;
