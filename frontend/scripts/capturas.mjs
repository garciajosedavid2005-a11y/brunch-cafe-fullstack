// Capturas de pantalla para revisión visual (npm run capturas -- <etiqueta>).
// 1.3b · Entorno aislado: el script arranca su propia API (backend/scripts/entorno-capturas.js) sobre
// la BD «brunch-cafe-capturas», que se vacía y se siembra en cada ejecución (seed:base sin el admin
// real, menú, modificadores, salón y usuarios *.dev, sin datos personales), y su propio Vite. La BD de
// trabajo y los servidores de desarrollo (4000 y 5173) no se tocan; al terminar se detiene todo.
// La contraseña de los usuarios *.dev es DEV_USUARIOS_PASSWORD (entorno o backend/.env; no se muestra).
//   CAPTURAS_API_PORT (4100) · CAPTURAS_FRONT_PORT (5174) · ANCHOS (1280,1024,768) · SOLO (vistas)
//   ZONA_NAVEGADOR (por defecto America/Bogota): zona del navegador simulado
import { chromium } from "playwright";
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

// nombre → { usuario, preparar(page), completa }
const VISTAS = {
  inicio: { preparar: (p) => p.goto(`${FRONT}/`) },
  menu: { preparar: (p) => p.goto(`${FRONT}/menu`) },
  // 1.5b · Login y registro (botón «Continuar con Google»), sin sesión
  login: { preparar: (p) => p.goto(`${FRONT}/login`) },
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
        const medidas = await page.evaluate(() => [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; })
          .map((el) => { const r = el.getBoundingClientRect(); return { alto: Math.round(r.height * 10) / 10, ancho: Math.round(r.width * 10) / 10, clase: el.className?.baseVal ?? el.className, texto: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30) }; })
          .filter((m) => m.alto < 44));
        for (const m of medidas) pequenos.push({ vista: nombre, tamano: etiqueta, ...m });
        console.log(`  ${medidas.length ? `⚠ ${medidas.length} botón(es) < 44 px` : "✓ todos los botones ≥ 44 px"} (${nombre} ${etiqueta})`);
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
await navegador.close();
detenerTodo();
if (MEDIR_TACTIL) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SALIDA, "medicion-tactil.json"), JSON.stringify(pequenos, null, 2));
  console.log(`
Medición táctil: ${pequenos.length} botón(es) < 44 px → ${join(SALIDA, "medicion-tactil.json")}`);
}
process.exitCode = fallidas ? 1 : 0;
