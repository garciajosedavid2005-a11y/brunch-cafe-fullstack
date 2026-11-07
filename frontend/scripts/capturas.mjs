// Capturas de pantalla para revisión visual (npm run capturas -- <etiqueta>).
// Requiere backend y frontend levantados y los usuarios de `npm run seed:dev` (backend).
// La contraseña de prueba se lee de DEV_USUARIOS_PASSWORD (no está en el código).
// Alternativa sin contraseña: COOKIES_SESION=<archivo.json> con { admin, cliente, mesero }
// = valor de la cookie `token` de cada usuario de prueba (el archivo no se versiona).
//   FRONT_URL (por defecto http://localhost:5173) · API_URL (por defecto http://localhost:4000/api/v1)
//   ZONA_NAVEGADOR (por defecto America/Bogota): zona del navegador simulado
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const FRONT = process.env.FRONT_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:4000/api/v1";
const CLAVE = process.env.DEV_USUARIOS_PASSWORD;
const COOKIES = process.env.COOKIES_SESION ? JSON.parse(await readFile(process.env.COOKIES_SESION, "utf8")) : null;
const ETIQUETA = process.argv[2] || "actual";
const ANCHOS = (process.env.ANCHOS || "1280,1024,768").split(",").map(Number);
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
const SALIDA = join(process.cwd(), "capturas", ETIQUETA);

const SOLO_PUBLICAS = SOLO && SOLO.every((v) => ["inicio", "menu", "nosotros", "nosotros-ubicacion", "pie", "comentarios"].includes(v));
if (!CLAVE && !COOKIES && !SOLO_PUBLICAS) {
  console.error("Define DEV_USUARIOS_PASSWORD (la misma que usaste en `npm run seed:dev`) o COOKIES_SESION.");
  process.exit(1);
}

const USUARIOS = {
  admin: "admin.dev@brunchcafe.test",
  cliente: "cliente.dev@brunchcafe.test",
  mesero: "mesero.dev@brunchcafe.test",
};

const abrirPestanaAdmin = (nombre) => async (page) => {
  await page.goto(`${FRONT}/admin`);
  await page.getByRole("button", { name: nombre, exact: true }).first().click();
  await page.waitForLoadState("networkidle");
};

// nombre → { usuario, preparar(page), completa }
const VISTAS = {
  inicio: { preparar: (p) => p.goto(`${FRONT}/`) },
  menu: { preparar: (p) => p.goto(`${FRONT}/menu`) },
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
      const agregar = p.getByRole("button", { name: "Agregar al carrito" });
      await agregar.nth(0).click({ force: true });
      await agregar.nth(0).click({ force: true });
      await agregar.nth(1).click({ force: true });
      const enlace = p.locator(".menu__item-carrito a");
      if (!(await enlace.isVisible())) await p.locator(".navbar__hamburger").click(); // navbar colapsado
      await enlace.click();
      await p.waitForLoadState("networkidle");
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
  "admin-usuarios": { usuario: "admin", preparar: abrirPestanaAdmin("Usuarios") },
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
  "staff-resumen": { usuario: "mesero", preparar: (p) => p.goto(`${FRONT}/staff`) },
  // Login tras «Cambiar de usuario». Cierra la sesión del contexto: con contraseña se vuelve
  // a iniciar en cada ancho; con COOKIES_SESION se repone la cookie
  "staff-cambio-usuario": { usuario: "mesero", preparar: async (p) => {
    if (COOKIES) {
      await p.context().addCookies([{ name: "token", value: COOKIES.mesero, url: new URL(API).origin, httpOnly: true }]);
    } else {
      await p.context().request.post(`${API}/auth/login`, { data: { correo: USUARIOS.mesero, contraseña: CLAVE } });
    }
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
  if (usuario && COOKIES) {
    if (!COOKIES[usuario]) throw new Error(`COOKIES_SESION no trae la sesión de ${usuario}`);
    await contexto.addCookies([{ name: "token", value: COOKIES[usuario], url: new URL(API).origin, httpOnly: true }]);
  } else if (usuario) {
    const res = await contexto.request.post(`${API}/auth/login`, { data: { correo: USUARIOS[usuario], contraseña: CLAVE } });
    if (!res.ok()) throw new Error(`Login de prueba falló para ${usuario}: ${res.status()} (¿ejecutaste npm run seed:dev?)`);
  }
  contextos[clave] = contexto;
  return contexto;
};

let errores = 0;
for (const [nombre, vista] of Object.entries(VISTAS)) {
  if (SOLO && !SOLO.includes(nombre)) continue;
  for (const ancho of ANCHOS) {
    const page = await (await contextoDe(vista.usuario)).newPage();
    const consola = [];
    page.on("console", (m) => m.type() === "error" && consola.push(m.text()));
    try {
      await page.setViewportSize({ width: ancho, height: 900 });
      await vista.preparar(page);
      await page.waitForLoadState("networkidle");
      if (vista.completa !== false) {
        // Recorre la página como un usuario: las secciones con animación de entrada
        // (IntersectionObserver) solo aparecen al pasar por el viewport
        const alto = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < alto; y += 400) {
          await page.evaluate((top) => window.scrollTo(0, top), y);
          await page.waitForTimeout(120);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.waitForTimeout(900); // fin de las transiciones
      const archivo = join(SALIDA, `${nombre}-${ancho}.png`);
      await page.screenshot({ path: archivo, fullPage: vista.completa !== false });
      console.log(`✓ ${archivo}${consola.length ? `  (errores de consola: ${consola.join(" | ").slice(0, 200)})` : ""}`);
    } catch (error) {
      errores += 1;
      console.error(`✗ ${nombre} ${ancho}px: ${error.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
}
await navegador.close();
process.exitCode = errores ? 1 : 0;
