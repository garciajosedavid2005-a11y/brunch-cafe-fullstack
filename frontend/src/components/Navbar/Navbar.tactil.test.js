// 1.6b · La hamburguesa del navbar público mide al menos 44×44 px (medía 24×18; MEDIR_TACTIL=1 npm run
// capturas). Se amplía el área táctil sin separar las barras: van juntas en el centro con un gap fijo,
// así la «X» (translateY de ±8 px) sigue cerrando bien. jsdom no calcula el diseño: se revisa el CSS.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "navbar.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const regla = (selector) => css.match(new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const px = (cuerpo, propiedad) => Number(cuerpo.match(new RegExp(`(?:^|[;\\s])${propiedad}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`))?.[1]);

describe("Hamburguesa del navbar público", () => {
  const boton = regla(".navbar__hamburger");

  it("el botón mide al menos 44×44 px", () => {
    expect(px(boton, "width")).toBeGreaterThanOrEqual(44);
    expect(px(boton, "height")).toBeGreaterThanOrEqual(44);
  });

  it("las barras siguen juntas (no se reparten por todo el alto) y separadas 8 px de centro a centro", () => {
    expect(boton).not.toMatch(/justify-content\s*:\s*space-between/);
    expect(boton).toMatch(/justify-content\s*:\s*center/);
    const barra = regla(".navbar__hamburger span");
    expect(px(barra, "width")).toBe(24);
    expect(px(barra, "height") + px(boton, "gap")).toBe(8); // = translateY de la «X»
  });
});
