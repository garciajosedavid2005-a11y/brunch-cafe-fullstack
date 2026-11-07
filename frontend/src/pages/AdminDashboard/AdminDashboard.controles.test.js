// 1.3 · Pendientes visuales de 1.2 (globales en el admin):
//   - los selectores muestran una flecha visible con el color de la marca (antes .admin-form-select
//     la borraba con `background: #fff !important` y el filtro de Salón usaba la gris de Foundation);
//   - los botones de solo icono miden al menos 44×44 px (borrar medía 36 px; quitar imagen, 28 px).
// jsdom no calcula el diseño: se revisan las reglas del CSS. Las capturas 1.3-antes/-despues y
// la medición con Playwright lo confirman.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "AdminDashboard.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// Reglas cuyo selector (uno de la lista separada por comas) es exactamente `clase` (sin :hover, etc.)
const reglasDe = (clase) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectores]) => selectores.split(",").map((s) => s.trim()).some((s) => s === clase || s.endsWith(` ${clase}`)))
  .map(([, , cuerpo]) => cuerpo);

const enPx = (valor) => {
  const m = valor.trim().match(/^(\d+(?:\.\d+)?)(px|rem)/);
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
};
const declaraciones = (cuerpo, propiedad) =>
  [...cuerpo.matchAll(new RegExp(`(?:^|[;\\s])${propiedad}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1]);

const BOTONES_ICONO = [".admin-button--icon-danger", ".admin-button--icon-success", ".admin-file-remove-btn", ".admin-modal-close", ".admin-roles__candado"];
const SELECTORES = [".admin-form-select", ".admin-salon__filtro", ".estado-selector__select", ".admin-select-status"];
const FLECHA_MARCA = /background-image\s*:\s*var\(--admin-flecha-select\)/;

describe("Botones de solo icono del admin (≥ 44×44 px)", () => {
  it.each(BOTONES_ICONO)("%s: ninguna regla lo deja por debajo de 44 px y alguna fija el mínimo", (clase) => {
    const reglas = reglasDe(clase);
    expect(reglas.length, `no hay reglas para ${clase}`).toBeGreaterThan(0);
    for (const cuerpo of reglas) {
      for (const prop of ["width", "height", "min-width", "min-height"]) {
        for (const valor of declaraciones(cuerpo, prop)) {
          const px = enPx(valor);
          if (px !== null) expect(px, `${clase} { ${prop}: ${valor} }`).toBeGreaterThanOrEqual(44);
        }
      }
    }
    const conMinimo = reglas.some((c) =>
      declaraciones(c, "min-width").some((v) => enPx(v) >= 44) && declaraciones(c, "min-height").some((v) => enPx(v) >= 44));
    expect(conMinimo, `${clase} sin min-width/min-height de 44 px`).toBe(true);
  });
});

describe("Selectores del admin con flecha de la marca", () => {
  it("la flecha es un chevron con --color-primario (#890620)", () => {
    const definicion = css.match(/--admin-flecha-select\s*:\s*([^;]+);/);
    expect(definicion, "falta la variable --admin-flecha-select").not.toBeNull();
    expect(definicion[1]).toMatch(/svg/);
    expect(definicion[1]).toMatch(/%23890620/);
  });

  it.each(SELECTORES)("%s usa la flecha y deja sitio para ella", (clase) => {
    const reglas = reglasDe(clase);
    expect(reglas.some((c) => FLECHA_MARCA.test(c)), `${clase} sin background-image de la flecha`).toBe(true);
    expect(reglas.some((c) => /appearance\s*:\s*none/.test(c)), `${clase} sin appearance: none`).toBe(true);
    // Foundation da a select background-origin: content-box: la flecha se medía desde dentro del
    // padding y quedaba encima del texto («Todas las zo⌄s»); se mide desde el borde del control
    expect(reglas.some((c) => /background-origin\s*:\s*border-box/.test(c)), `${clase} sin background-origin: border-box`).toBe(true);
    // El atajo `background:` borra la imagen de la flecha (lo que pasaba con .admin-form-select)
    for (const cuerpo of reglas) expect(cuerpo, `${clase} con el atajo background:`).not.toMatch(/(^|[;\s])background\s*:/);
  });
});

// 1.3b · Columna de acciones fija a la derecha al desplazar la tabla (decisión de Brayan): a 1024 px
// las acciones de Productos y Usuarios quedaban detrás del scroll horizontal.
describe("Columna de acciones fija (sticky) en las tablas del admin", () => {
  const SECCIONES = join(import.meta.dirname, "sections");
  const archivos = readdirSync(SECCIONES).filter((f) => f.endsWith("Section.jsx"));

  it("toda tabla con columna «Acciones» lleva admin-table--acciones-fijas", () => {
    const conAcciones = archivos.filter((f) => readFileSync(join(SECCIONES, f), "utf8").includes("<th>Acciones</th>"));
    expect(conAcciones.length).toBeGreaterThanOrEqual(11);
    for (const archivo of conAcciones) {
      const fuente = readFileSync(join(SECCIONES, archivo), "utf8");
      const tablas = (fuente.match(/<th>Acciones<\/th>/g) || []).length;
      const marcadas = (fuente.match(/admin-table--acciones-fijas/g) || []).length;
      expect(marcadas, archivo).toBe(tablas);
    }
  });

  it("el CSS fija la última columna a la derecha con fondo opaco, sin tocar la fila de «vacío» (colspan)", () => {
    const fija = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, sel, cuerpo]) =>
      sel.includes(".admin-table--acciones-fijas") && /position\s*:\s*sticky/.test(cuerpo));
    expect(fija, "falta la regla sticky").toBeTruthy();
    expect(fija[2]).toMatch(/right\s*:\s*(0|-1px)/);
    expect(fija[1]).toMatch(/td:last-child:not\(\[colspan\]\)/);
    expect(css).toMatch(/\.admin-table--acciones-fijas tbody tr:nth-child\(even\) td:last-child[^{]*\{[^}]*background-color/);
  });
});
