// 3.5 · Reglas de la barra de cobro que jsdom no calcula (las capturas lo confirman): fija abajo al
// desplazarse, opaca (no deja ver lo de detrás) y con su texto legible (≥ 4,5:1).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contraste } from "../../../test/contraste";

const css = readFileSync(join(import.meta.dirname, "Caja.css"), "utf8");
const regla = (selector) => {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escapado}\\s*\\{([^}]*)\\}`))?.[1] ?? null;
};
const valor = (bloque, propiedad) => bloque?.match(new RegExp(`(?:^|;|\\s)${propiedad}\\s*:\\s*([^;]+);`))?.[1].trim();

describe("Barra de cobro (3.5)", () => {
  it("queda fija abajo al desplazarse, por encima del contenido y opaca, sin tapar el final del cobro", () => {
    // fixed (no sticky): el overflow-x: hidden de html, body y .main-content anula los sticky
    const barra = regla(".caja-cobro__barra");
    expect(valor(barra, "position")).toBe("fixed");
    expect(valor(barra, "bottom")).toBe("0");
    expect(Number(valor(barra, "z-index"))).toBeGreaterThan(0);
    expect(valor(barra, "background")).toMatch(/^#[0-9a-f]{6}$/i);
    // Reserva abajo el alto real de la barra (crece con un error o al partirse en dos filas)
    expect(valor(regla(".caja-cobro"), "padding-bottom")).toMatch(/var\(--alto-barra/);
  });

  it("3.6 · una opción elegida con el puntero encima sigue legible (el hover de las no elegidas no la pisa)", () => {
    // El hover rosado solo aplica a las no elegidas
    const hoverNormal = css.match(/\.caja__boton--opcion:hover[^{]*\{/)?.[0] ?? "";
    expect(hoverNormal).toMatch(/:not\(\[aria-pressed="true"\]\)/);
    expect(hoverNormal).toMatch(/:not\(\[aria-checked="true"\]\)/);
    // La elegida con hover: texto blanco sobre un bordó oscuro
    const elegidaHover = regla('.caja__boton--opcion[aria-checked="true"]:hover:not(:disabled)');
    expect(contraste(valor(elegidaHover, "color"), valor(elegidaHover, "background"))).toBeGreaterThanOrEqual(4.5);
  });

  it("3.6 · «Pago» con la misma tipografía que los demás títulos de la tarjeta (la del cuerpo, en negrita)", () => {
    const titulo = regla(".caja-cobro__bloque .caja__subtitulo");
    expect(valor(titulo, "font-family")).toMatch(/--fuente-cuerpo/);
    expect(valor(titulo, "font-weight")).toBe("700");
  });

  it("su estado se lee sobre el fondo de la barra (≥ 4,5:1)", () => {
    const fondo = valor(regla(".caja-cobro__barra"), "background");
    for (const selector of [".caja-cobro__estado", ".caja-cobro__estado.is-pendiente"]) {
      expect(contraste(valor(regla(selector), "color"), fondo), selector).toBeGreaterThanOrEqual(4.5);
    }
  });
});
