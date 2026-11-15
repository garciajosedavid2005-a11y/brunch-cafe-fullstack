// 2.6b · Prueba de humo: comprueba lo que ve de verdad el personal en el navegador (pantallas en blanco,
// errores de página o de consola), no solo el código del disco. Nació del fallo de 2.6: el Vite de desarrollo,
// abierto desde hacía horas, servía una versión intermedia de TomaComanda.jsx que nunca llegó al commit.
//
// Dos modos:
//   npm run humo                  (por defecto, pendiente de 3b) ENTORNO AISLADO: arranca la API de capturas
//                                 (backend/scripts/entorno-capturas.js, BD «brunch-cafe-capturas», que se vacía y
//                                 se siembra) y su propio Vite, y prepara sus datos: si la siembra no deja una mesa
//                                 ocupada, el mesero de prueba abre la primera libre y envía una ronda. Así /staff siempre tiene una mesa ocupada, sin
//                                 depender de la BD de trabajo (que no se toca). No correrlo a la vez que capturas.
//   npm run humo -- --en-marcha   contra los servidores YA en marcha (por defecto 5173 + API 4000; o
//                                 HUMO_FRONT / HUMO_API): el modo de 2.6b. No escribe en esa BD, así que el caso de
//                                 /staff necesita una mesa ocupada en ella.
//
// Casos (de Brayan): 1) mesero.dev abre la cuenta de una mesa ocupada; 2) con la cuenta abierta, un ítem pasa
// a «listo» y la pantalla relee la cuenta (simulado cambiando la respuesta en el navegador). Además, cocina.dev
// abre /kds y admin.dev el admin. Falla (código 1) si alguna pantalla queda en blanco o registra errores.
// La contraseña es DEV_USUARIOS_PASSWORD (no se muestra).
import { chromium, request } from "playwright";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import process from "node:process";

const BACKEND = resolve(process.cwd(), "../backend");
const EN_MARCHA = process.argv.includes("--en-marcha") || Boolean(process.env.HUMO_FRONT);
const PUERTO_API = process.env.CAPTURAS_API_PORT || "4100";
const PUERTO_FRONT = process.env.CAPTURAS_FRONT_PORT || "5174";
const FRONT = EN_MARCHA ? process.env.HUMO_FRONT || "http://localhost:5173" : `http://localhost:${PUERTO_FRONT}`;
const API = EN_MARCHA ? process.env.HUMO_API || "http://localhost:4000/api/v1" : `http://localhost:${PUERTO_API}/api/v1`;
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
if (!CLAVE) {
  console.error("Define DEV_USUARIOS_PASSWORD en el entorno o en backend/.env (usuarios de npm run seed:dev).");
  process.exit(1);
}
const CORREOS = { mesero: "mesero.dev@brunchcafe.test", cocina: "cocina.dev@brunchcafe.test", admin: "admin.dev@brunchcafe.test" };

// ── Entorno aislado (como npm run capturas): API sobre la BD de capturas + Vite apuntando a ella ──
const procesos = [];
const erroresProcesos = [];
const arrancar = (nombre, args, opciones) => {
  const hijo = spawn(process.execPath, args, { ...opciones, stdio: ["ignore", "ignore", "pipe"] });
  hijo.stderr.on("data", (d) => erroresProcesos.push(`[${nombre}] ${d}`));
  procesos.push(hijo);
  return hijo;
};
const detenerTodo = () => {
  for (const hijo of procesos) if (hijo.exitCode === null) hijo.kill();
};
process.on("exit", detenerTodo);
const esperar = async (url, hijo, nombre, segundos = 90) => {
  for (let i = 0; i < segundos * 2; i += 1) {
    if (hijo.exitCode !== null) throw new Error(`${nombre} terminó antes de tiempo:\n${erroresProcesos.join("").slice(-1500)}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // aún no responde
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${nombre} no respondió en ${segundos} s (${url}). ¿Está ocupado el puerto (¿capturas en marcha?)?`);
};

/** Datos propios del humo: el mesero de prueba abre la mesa 1 y envía una ronda (queda «Ocupada» con un ítem enviado). */
const prepararDatos = async () => {
  const mesero = await request.newContext();
  const leer = async (promesa, que) => {
    const res = await promesa;
    if (!res.ok()) throw new Error(`Preparar datos (${que}): ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  };
  try {
    await leer(mesero.post(`${API}/auth/login`, { data: { correo: CORREOS.mesero, contraseña: CLAVE } }), "login del mesero");
    const { productos } = await leer(mesero.get(`${API}/staff/salon/catalogo`), "catálogo");
    const producto = productos.find((pr) => pr.disponible && !pr.modificadores?.some((g) => g.obligatorio || g.min > 0));
    if (!producto) throw new Error("Preparar datos: no hay un producto disponible sin opciones obligatorias");
    const { mesas } = await leer(mesero.get(`${API}/staff/salon/mesas`), "plano");
    const ocupada = mesas.find((m) => ["ocupada", "cuenta_pedida"].includes(m.estado));
    if (ocupada) {
      console.log(`Datos del humo listos: la siembra ya deja la mesa ${ocupada.numero} ocupada.`);
      return;
    }
    const mesa = mesas.find((m) => m.estado === "libre");
    if (!mesa) throw new Error("Preparar datos: no hay mesas libres ni ocupadas en el plano");
    let cuenta = await leer(mesero.post(`${API}/staff/salon/mesas/${mesa.id}/abrir`, { data: { comensales: 2 } }), "abrir la mesa");
    ({ cuenta } = await leer(mesero.post(`${API}/staff/salon/cuentas/${cuenta.id}/items`, { data: { productoId: producto.id, cantidad: 1 } }), "agregar ítem"));
    await leer(mesero.post(`${API}/staff/salon/cuentas/${cuenta.id}/rondas/1/enviar`, { data: { numeroRonda: 1, versionEsperada: cuenta.version } }), "enviar ronda");
    console.log(`Datos del humo listos: mesa ${mesa.numero} ocupada con una ronda enviada.`);
  } finally {
    await mesero.dispose();
  }
};

if (!EN_MARCHA) {
  const api = arrancar("api", ["scripts/entorno-capturas.js"], {
    cwd: BACKEND,
    env: { ...process.env, DEV_USUARIOS_PASSWORD: CLAVE, CAPTURAS_API_PORT: PUERTO_API, CAPTURAS_FRONT_URL: FRONT },
  });
  const vite = arrancar("vite", [join(process.cwd(), "node_modules/vite/bin/vite.js"), "--port", PUERTO_FRONT, "--strictPort"], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_API_URL: `http://localhost:${PUERTO_API}/api` },
  });
  try {
    await esperar(`http://localhost:${PUERTO_API}/api/health`, api, "La API aislada");
    await esperar(FRONT, vite, "Vite");
    console.log(`Entorno aislado listo (BD brunch-cafe-capturas · API ${PUERTO_API} · web ${PUERTO_FRONT}).`);
    await prepararDatos();
  } catch (error) {
    console.error(error.message);
    detenerTodo();
    process.exit(1);
  }
} else {
  console.log(`Modo en marcha: ${FRONT} (sin preparar datos; la BD de trabajo no se toca).`);
}

const navegador = await chromium.launch();
const resultados = [];
const pagina = async (usuario) => {
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 768 }, locale: "es-CO" });
  const res = await ctx.request.post(`${API}/auth/login`, { data: { correo: CORREOS[usuario], contraseña: CLAVE } });
  if (!res.ok()) throw new Error(`login de ${usuario}: ${res.status()} (¿está la API en ${API} y corriste seed:dev?)`);
  const p = await ctx.newPage();
  p.errores = [];
  p.on("pageerror", (e) => p.errores.push(`pageerror: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) p.errores.push(`console.error: ${m.text().split("\n")[0]}`);
  });
  return p;
};
const comprobar = async (p, caso) => {
  await p.waitForTimeout(1500);
  const enBlanco = await p.evaluate(() => (document.getElementById("root")?.innerHTML.trim().length ?? 0) === 0);
  const fallo = enBlanco || p.errores.length > 0;
  resultados.push({ caso, fallo });
  console.log(`${fallo ? "✗" : "✓"} ${caso}${enBlanco ? " · PANTALLA EN BLANCO" : ""}`);
  p.errores.splice(0).forEach((e) => console.log(`    ${e}`));
  return !fallo; // si ya falló, no se sigue con el caso siguiente de la misma pantalla
};
const intentar = async (caso, fn) => {
  try {
    await fn();
  } catch (error) {
    resultados.push({ caso, fallo: true });
    console.log(`✗ ${caso}: ${error.message.split("\n")[0]}`);
  }
};

await intentar("/staff · abrir la cuenta de una mesa (mesero)", async () => {
  const p = await pagina("mesero");
  await p.goto(`${FRONT}/staff`);
  const mesa = p.getByRole("button", { name: /^Mesa \d+,.*(Ocupada|Cuenta pedida)/ }).first();
  await mesa.waitFor({ timeout: 15_000 });
  await mesa.click();
  await p.getByRole("button", { name: /^Ver cuenta/ }).click();
  if (!(await comprobar(p, "/staff · abrir la cuenta de una mesa (mesero)"))) return;

  // Caso 2: un ítem enviado pasa a «listo» en la respuesta (sin tocar la BD) y la cuenta se relee
  await p.route(/\/v1\/staff\/salon\/cuentas\/[0-9a-f]{24}$/, async (ruta) => {
    const r = await ruta.fetch();
    const cuenta = await r.json();
    const item = cuenta.rondas?.flatMap((x) => x.items).find((i) => ["enviado", "en_preparacion"].includes(i.estado));
    if (item) Object.assign(item, { estado: "listo", iniciadoEn: item.iniciadoEn || new Date().toISOString(), listoEn: new Date().toISOString() });
    await ruta.fulfill({ response: r, json: cuenta });
  });
  await p.getByRole("button", { name: "Actualizar la cuenta" }).click();
  await comprobar(p, "/staff · un ítem pasa a «listo» con la cuenta abierta (mesero)");
});
await intentar("/kds · cola (cocina)", async () => {
  const p = await pagina("cocina");
  await p.goto(`${FRONT}/kds`);
  await comprobar(p, "/kds · cola (cocina)");
});
await intentar("/admin · resumen (admin)", async () => {
  const p = await pagina("admin");
  await p.goto(`${FRONT}/admin`);
  await comprobar(p, "/admin · resumen (admin)");
});

await navegador.close();
detenerTodo();
const fallidos = resultados.filter((r) => r.fallo).length;
console.log(`\n${fallidos ? `✗ ${fallidos} caso(s) con problemas` : "✓ Sin pantallas en blanco ni errores de consola"} en ${FRONT}`);
if (fallidos) process.exitCode = 1;
