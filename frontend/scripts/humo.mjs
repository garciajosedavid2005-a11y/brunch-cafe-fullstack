// 2.6b · Prueba de humo contra el frontend que está EN MARCHA (por defecto el de desarrollo, 5173 + API 4000):
// comprueba lo que ve de verdad el personal, no el código del disco. Nació del fallo de 2.6: el Vite de
// desarrollo, abierto desde hacía horas, servía una versión intermedia de TomaComanda.jsx que nunca llegó al
// commit, y /staff quedaba en blanco; los tests y las capturas (que usan su propio Vite) no podían verlo.
//
//   npm run humo                      (HUMO_FRONT=http://localhost:5173 HUMO_API=http://localhost:4000/api/v1)
//
// Casos (de Brayan): 1) mesero.dev abre la cuenta de una mesa ocupada; 2) con la cuenta abierta, un ítem pasa
// a «listo» y la pantalla relee la cuenta (simulado cambiando la respuesta en el navegador: NO escribe en la
// BD). Además, cocina.dev abre /kds y admin.dev el admin. Falla (código 1) si alguna pantalla queda en blanco
// o registra errores de página o de consola. La contraseña es DEV_USUARIOS_PASSWORD (no se muestra).
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const FRONT = process.env.HUMO_FRONT || "http://localhost:5173";
const API = process.env.HUMO_API || "http://localhost:4000/api/v1";
const leerClave = async () => {
  if (process.env.DEV_USUARIOS_PASSWORD) return process.env.DEV_USUARIOS_PASSWORD;
  try {
    const env = await readFile(join(resolve(process.cwd(), "../backend"), ".env"), "utf8");
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
const fallidos = resultados.filter((r) => r.fallo).length;
console.log(`\n${fallidos ? `✗ ${fallidos} caso(s) con problemas` : "✓ Sin pantallas en blanco ni errores de consola"} en ${FRONT}`);
if (fallidos) process.exitCode = 1;
