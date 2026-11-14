// Revisión de 1.6 · Reglas de diseño del plano que jsdom no calcula (las capturas lo confirman):
// la etiqueta de estado siempre en la misma posición y los botones deshabilitados legibles (≥ 4,5:1).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contraste } from "../../../test/contraste";

const css = readFileSync(join(import.meta.dirname, "PlanoMesas.css"), "utf8");
const regla = (selector) => {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
};
const valor = (bloque, propiedad) => bloque?.match(new RegExp(`(?:^|;|\\s)${propiedad}\\s*:\\s*([^;]+);`))?.[1].trim();

describe("Tarjeta de mesa (2.6c, propuesta B)", () => {
  it("apila dibujo, estado y detalle en columna (la píldora siempre en el mismo sitio) y el icono no se encoge", () => {
    expect(valor(regla(".plano__mesa"), "display")).toBe("grid");
    expect(css).toMatch(/\.plano__estado svg\s*\{[^}]*flex:\s*none/);
    expect(valor(regla(".plano__estado"), "white-space")).toBe("nowrap");
  });

  it("objetivo táctil ≥ 44 px y ancho para «Cuenta pedida»", () => {
    expect(Number.parseInt(valor(regla(".plano__mesa"), "min-height"), 10)).toBeGreaterThanOrEqual(44);
    expect(Number.parseInt(valor(regla(".plano__mesa"), "min-width"), 10)).toBeGreaterThanOrEqual(150);
  });

  it("el número se lee sobre el tablero de cada estado (≥ 4,5:1)", () => {
    for (const estado of ["libre", "ocupada", "cuenta_pedida", "por_limpiar", "bloqueada"]) {
      const bloque = regla(`.plano__mesa--${estado}`);
      const numero = valor(bloque, "--numero") || "#2C0703"; // por defecto, --color-oscuro
      expect(contraste(numero, valor(bloque, "--tablero")), estado).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("los tiempos (verde, ámbar y rojo) se leen sobre el piso de la sala (≥ 4,5:1)", () => {
    for (const nivel of ["normal", "aviso", "alerta"]) {
      expect(contraste(valor(regla(`.plano__tiempo--${nivel}`), "color"), "#f6ece8"), nivel).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el anillo se ve sobre el piso (≥ 3:1) y respeta prefers-reduced-motion", () => {
    for (const nivel of ["normal", "aviso", "alerta"]) {
      expect(contraste(valor(regla(`.dibujo-mesa__anillo--${nivel}`), "stroke"), "#f6ece8"), nivel).toBeGreaterThanOrEqual(3);
    }
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.dibujo-mesa__anillo[^}]*transition:\s*none/);
  });
});

describe("Botones deshabilitados del plano", () => {
  const deshabilitado = regla(".plano__boton:disabled");

  it("no se atenúan con opacidad (bajaba el texto blanco sobre bordó a ~3,5:1)", () => {
    expect(deshabilitado, "falta .plano__boton:disabled").not.toBeNull();
    expect(deshabilitado).not.toMatch(/opacity/);
  });

  it("el texto deshabilitado tiene contraste ≥ 4,5:1 con su fondo y se nota deshabilitado (borde discontinuo)", () => {
    const color = valor(deshabilitado, "color");
    const fondo = valor(deshabilitado, "background");
    expect(contraste(color, fondo)).toBeGreaterThanOrEqual(4.5);
    expect(valor(deshabilitado, "border-style")).toBe("dashed");
  });

  it("los botones de icono deshabilitados (− y + de comensales) siguen el mismo criterio", () => {
    const icono = regla(".plano__boton-icono:disabled");
    expect(icono, "falta .plano__boton-icono:disabled").not.toBeNull();
    expect(icono).not.toMatch(/opacity/);
    expect(contraste(valor(icono, "color"), valor(icono, "background"))).toBeGreaterThanOrEqual(4.5);
    expect(valor(icono, "border-style")).toBe("dashed");
  });
});
