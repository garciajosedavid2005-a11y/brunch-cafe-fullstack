// Capturas de pantalla para revisión visual (npm run capturas -- <etiqueta>).
// Requiere backend y frontend levantados y los usuarios de `npm run seed:dev` (backend).
// La contraseña de prueba se lee de DEV_USUARIOS_PASSWORD (no está en el código).
//   FRONT_URL (por defecto http://localhost:5173) · API_URL (por defecto http://localhost:4000/api)
//   ZONA_NAVEGADOR (por defecto America/Bogota): zona del navegador simulado
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const FRONT = process.env.FRONT_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:4000/api";
const CLAVE = process.env.DEV_USUARIOS_PASSWORD;
const ETIQUETA = process.argv[2] || "actual";
const ANCHOS = (process.env.ANCHOS || "1280,1024,768").split(",").map(Number);
const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;
const SALIDA = join(process.cwd(), "capturas", ETIQUETA);

if (!CLAVE) {
  console.error("Define DEV_USUARIOS_PASSWORD (la misma que usaste en `npm run seed:dev`).");
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
  "cuenta-cliente": { usuario: "cliente", preparar: (p) => p.goto(`${FRONT}/cuenta`) },
  "cuenta-mesero": { usuario: "mesero", preparar: (p) => p.goto(`${FRONT}/cuenta`) },
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
