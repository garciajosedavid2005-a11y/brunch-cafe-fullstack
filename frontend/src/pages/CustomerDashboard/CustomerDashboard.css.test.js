// 3.6 · Mi cuenta: menú lateral con iconos del mismo tamaño, alineados con la primera línea del texto
// (también cuando «Seguridad y configuración» se parte en dos) y el contador «0/300» legible (≥ 4,5:1).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contraste } from "../../test/contraste";

const css = readFileSync(join(import.meta.dirname, "CustomerDashboard.css"), "utf8").replace(/\r\n/g, "\n");
const regla = (selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const valor = (bloque, propiedad) => bloque.match(new RegExp(`(?:^|;|\\s)${propiedad}\\s*:\\s*([^;]+);`))?.[1].trim();

describe("Mi cuenta (3.6)", () => {
  it("cada ítem del menú: icono del mismo tamaño que no se encoge, alineado con la primera línea", () => {
    const boton = regla(".customer-dashboard__nav button");
    expect(valor(boton, "align-items")).toBe("flex-start");
    const icono = regla(".customer-dashboard__nav button svg");
    expect(valor(icono, "flex")).toBe("none");
    expect(valor(icono, "width")).toBe(valor(icono, "height"));
    // Centrado con la primera línea: el margen superior depende del alto de línea del botón
    expect(valor(icono, "margin-top")).toMatch(/calc\(/);
    expect(valor(boton, "line-height")).toBeTruthy();
  });

  it("el contador de caracteres se lee sobre el fondo del formulario (≥ 4,5:1)", () => {
    const color = valor(regla(".dashboard-character-count"), "color");
    expect(contraste(color, "#fffdfa")).toBeGreaterThanOrEqual(4.5);
    expect(contraste(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Con margen: también sobre el rosado de la página (#f5e6e1) y a un tamaño legible
    expect(contraste(color, "#f5e6e1")).toBeGreaterThanOrEqual(4.5);
    expect(Number.parseFloat(valor(regla(".dashboard-character-count"), "font-size"))).toBeGreaterThanOrEqual(0.8);
  });
});
