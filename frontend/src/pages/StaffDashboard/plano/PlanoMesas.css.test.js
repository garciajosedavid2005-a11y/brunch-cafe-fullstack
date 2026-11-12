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

describe("Tarjeta de mesa: etiqueta de estado", () => {
  it("la cabecera apila número y estado (la píldora no salta de línea según quepa o no)", () => {
    const cabecera = regla(".plano__mesa-cabecera");
    expect(cabecera, "falta .plano__mesa-cabecera").not.toBeNull();
    expect(cabecera).not.toMatch(/flex-wrap\s*:\s*wrap/);
    expect(valor(cabecera, "display")).toBe("grid");
  });

  // A 1024 px con el panel abierto, «Cuenta pedida» no cabía y el icono se encogía hasta desaparecer
  it("el icono de la píldora no se encoge y las tarjetas tienen ancho para «Cuenta pedida»", () => {
    expect(css).toMatch(/\.plano__estado svg\s*\{[^}]*flex:\s*none/);
    const minimo = Number(valor(regla(".plano__mesas"), "grid-template-columns").match(/minmax\((\d+)px/)?.[1]);
    expect(minimo).toBeGreaterThanOrEqual(160);
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
