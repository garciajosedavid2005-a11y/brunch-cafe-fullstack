// 2.0b · Sin azules fuera de la paleta de Brunch Café en /staff y el admin, salvo los colores de estado
// acordados (mesa «por limpiar», ítem «enviado» y las insignias de estado del admin). El barrido con el
// navegador real está en `npm run capturas` (medicion-paleta.json); esto cubre el CSS propio y el azul
// que Foundation pone a los enlaces con el puntero o el foco.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..");
const cssDe = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? cssDe(p) : n.endsWith(".css") ? [p] : [];
});
const ARCHIVOS = [...cssDe(join(SRC, "pages/StaffDashboard")), ...cssDe(join(SRC, "pages/AdminDashboard")), ...cssDe(join(SRC, "pages/Kds"))];

const aRgb = (hex) => {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? [...h].map((x) => x + x).join("") : h;
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
};
// Colores de un valor CSS en #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() y azules por nombre
const AZULES_CON_NOMBRE = /\b(blue|navy|steelblue|dodgerblue|royalblue|cornflowerblue|deepskyblue|skyblue|lightblue|midnightblue|cadetblue|powderblue|lightsteelblue|mediumblue|darkblue)\b/i;
const coloresDe = (valor) => [
  ...[...valor.matchAll(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g)]
    .map(([, h]) => `#${h.length === 8 ? h.slice(0, 6) : h.length === 4 ? h.slice(0, 3) : h}`),
  ...[...valor.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)]
    .map(([, r, g, b]) => `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`),
  ...(AZULES_CON_NOMBRE.test(valor) ? ["#0000ff"] : []),
];
const esAzul = (hex) => {
  const [r, g, b] = aRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.08) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 185 && h <= 260 && s >= 0.3 && l > 0.12 && l < 0.88;
};

// Colores de estado acordados (1.6: por limpiar azul; ítem enviado; insignias de estado del admin)
const ESTADOS_ACORDADOS = [/por_limpiar/, /^\.comanda-item__estado$/, /admin-badge--info/, /staff-dashboard__status--info/];
// Variables de color de un estado acordado (p. ej. --limpiar-texto en el plano)
const VARIABLES_DE_ESTADO = /^--limpiar-/;

const reglas = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, cuerpo]) => ({ selector: selector.trim(), cuerpo }));

describe("Paleta en /staff y el admin (2.0b)", () => {
  it("el CSS no usa azules fuera de la paleta, salvo en los estados acordados", () => {
    const fuera = ARCHIVOS.flatMap((archivo) => reglas(readFileSync(archivo, "utf8")).flatMap(({ selector, cuerpo }) =>
      cuerpo.split(";").map((d) => d.split(":")).filter(([prop]) => prop && !VARIABLES_DE_ESTADO.test(prop.trim()))
        .flatMap(([, ...valor]) => coloresDe(valor.join(":")))
        .filter(esAzul)
        .filter(() => !selector.split(",").every((s) => ESTADOS_ACORDADOS.some((re) => re.test(s.trim()))))
        .map((hex) => `${archivo.slice(SRC.length + 1)} · ${selector} · ${hex}`)));
    expect(fuera).toEqual([]);
  });

  // admin-badge--info (azul) queda para los estados; las etiquetas que no son estados usan la de marca
  it.each([
    ["pages/AdminDashboard/sections/ProductsSection.jsx", /admin-badge admin-badge--marca"[^>]*title=\{prod\.estacionId/],
    ["pages/AdminDashboard/sections/ReviewsSection.jsx", /admin-badge admin-badge--marca">Producto</],
    ["pages/AdminDashboard/sections/RolesSection.jsx", /admin-badge admin-badge--marca admin-roles__permiso/],
    ["pages/AdminDashboard/sections/SalonSection.jsx", /admin-badge admin-badge--marca">Combinable</],
    ["pages/AdminDashboard/sections/StatesSection.jsx", /admin-badge admin-badge--marca">En Proceso</],
    // Estados de mesa en Admin › Salón con los colores del plano (1.6): libre verde, ocupada bordó,
    // cuenta pedida ámbar, por limpiar azul y bloqueada gris
    ["pages/AdminDashboard/sections/SalonSection.jsx", /libre: \{ texto: "Libre", clase: "admin-badge--success" \}/],
    ["pages/AdminDashboard/sections/SalonSection.jsx", /ocupada: \{ texto: "Ocupada", clase: "admin-badge--bordo" \}/],
    ["pages/AdminDashboard/sections/SalonSection.jsx", /cuenta_pedida: \{ texto: "Cuenta pedida", clase: "admin-badge--warning" \}/],
    ["pages/AdminDashboard/sections/SalonSection.jsx", /por_limpiar: \{ texto: "Por limpiar", clase: "admin-badge--info" \}/],
    ["pages/AdminDashboard/sections/SalonSection.jsx", /bloqueada: \{ texto: "Bloqueada", clase: "admin-badge--neutral" \}/],
  ])("%s: etiqueta con el color que le corresponde", (archivo, patron) => {
    expect(readFileSync(join(SRC, archivo), "utf8")).toMatch(patron);
  });

  it("los enlaces con estilo de botón no toman el azul de Foundation con el puntero, el foco o visitados", () => {
    const staff = readFileSync(join(SRC, "pages/StaffDashboard/StaffDashboard.css"), "utf8");
    const regla = reglas(staff).find(({ selector }) => /a\.staff-tablet__boton:hover/.test(selector) && /a\.staff-tablet__boton:focus/.test(selector));
    expect(regla?.selector).toMatch(/a\.staff-tablet__boton:visited/);
    expect(regla?.cuerpo).toMatch(/color:\s*var\(--color-primario\)/);
  });
});
