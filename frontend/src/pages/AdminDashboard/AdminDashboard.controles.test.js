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

  // 1.6b · La columna fija tapaba la de estado a 1024 y 768 px (medido: MEDIR_SOLAPES=1 npm run capturas).
  // La columna de estado (Estado; en Productos, Disponible) también queda fija, justo a la izquierda de Acciones.
  it("toda columna de estado de una tabla con acciones fijas se marca con admin-col-estado (cabecera y celdas)", () => {
    let tablasConEstado = 0;
    for (const archivo of archivos) {
      const fuente = readFileSync(join(SECCIONES, archivo), "utf8");
      if (!fuente.includes("admin-table--acciones-fijas")) continue;
      expect(fuente, `${archivo}: cabecera de estado sin marcar`).not.toMatch(/<th>(Estado|Disponible)<\/th>/);
      const cabeceras = (fuente.match(/<th className="admin-col-estado">(Estado|Disponible)<\/th>/g) || []).length;
      tablasConEstado += cabeceras;
      if (cabeceras) {
        const celdas = (fuente.match(/<td className="admin-col-estado"/g) || []).length;
        expect(celdas, `${archivo}: celdas de estado sin marcar`).toBeGreaterThanOrEqual(cabeceras);
      }
    }
    expect(tablasConEstado).toBeGreaterThanOrEqual(9);
  });

  it("el CSS fija la columna de estado a la izquierda de Acciones (--ancho-acciones), con fondo opaco", () => {
    const regla = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([sel, , cuerpo]) =>
      sel.includes(".admin-col-estado") && /position\s*:\s*sticky/.test(cuerpo));
    expect(regla, "falta la regla sticky de .admin-col-estado").toBeTruthy();
    expect(regla[2]).toMatch(/right\s*:\s*calc\(var\(--ancho-acciones/);
    expect(css).toMatch(/\.admin-table--acciones-fijas tbody tr:nth-child\(even\) td\.admin-col-estado[^{]*\{[^}]*background-color/);
  });
});

// 1.5c · Botones con texto del admin: ≥ 44 px de alto (medían 27–43,6 px; medido con Playwright,
// `MEDIR_TACTIL=1 npm run capturas`). min-height gana a cualquier height menor de otras reglas.
const BOTONES_TEXTO = [
  ".admin-sidebar__button", ".admin-button--primary", ".admin-button--secondary-sm", ".admin-button--logout",
  ".admin-button--link", ".admin-filter-tab", ".admin-states-tab", ".admin-badge-star-btn", ".admin-roles__mas", ".admin-switch",
  ".admin-button--modal-cancel", ".admin-button--danger", ".admin-badge--boton",
];

// 1.6b · Campos de formulario del admin: ≥ 44 px de alto (medían 37,7–42,9 px; MEDIR_TACTIL=1 npm run
// capturas, que desde 1.6b mide también input, select y textarea). La búsqueda ya mide 46 px (su contenedor).
const CAMPOS = [
  ".admin-form-input", ".admin-form-select", ".admin-form-textarea", ".estado-selector__select",
  ".admin-select-status", ".admin-salon__filtro",
];

describe("Campos de formulario del admin (≥ 44 px de alto, 1.6b)", () => {
  // Global: la regla del mínimo tiene la clase sola en su selector (no solo dentro de un modal o una sección)
  const reglasGlobales = (clase) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectores]) => selectores.split(",").map((s) => s.trim()).includes(clase))
    .map(([, , cuerpo]) => cuerpo);

  it.each(CAMPOS)("%s: una regla global fija min-height ≥ 44 px y ninguna max-height lo baja", (clase) => {
    const reglas = reglasDe(clase);
    expect(reglas.length, `no hay reglas para ${clase}`).toBeGreaterThan(0);
    const minimos = reglasGlobales(clase).flatMap((c) => declaraciones(c, "min-height")).map(enPx).filter((px) => px !== null);
    expect(Math.max(0, ...minimos)).toBeGreaterThanOrEqual(44);
    const maximos = reglas.flatMap((c) => declaraciones(c, "max-height")).map(enPx).filter((px) => px !== null);
    for (const max of maximos) expect(max).toBeGreaterThanOrEqual(44);
  });
});

describe("Botones con texto del admin (≥ 44 px de alto, 1.5c)", () => {
  it.each(BOTONES_TEXTO)("%s: alguna regla fija min-height ≥ 44 px y ninguna lo baja", (clase) => {
    const reglas = reglasDe(clase);
    expect(reglas.length, `no hay reglas para ${clase}`).toBeGreaterThan(0);
    const minimos = reglas.flatMap((c) => declaraciones(c, "min-height")).map(enPx).filter((px) => px !== null);
    expect(Math.max(0, ...minimos), `${clase} sin min-height ≥ 44 px`).toBeGreaterThanOrEqual(44);
    for (const px of minimos) expect(px, `${clase} { min-height: ${px}px }`).toBeGreaterThanOrEqual(44);
  });
});
