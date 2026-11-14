// 3.6 · Pestañas «Iniciar sesión / Registrarse»: la activa en el bordó de la marca también con el puntero y el
// foco (Foundation la pintaba azul con a:hover y a:focus) y la inactiva legible sobre su fondo (≥ 4,5:1).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contraste } from "../../test/contraste";

const css = readFileSync(join(import.meta.dirname, "Auth.css"), "utf8").replace(/\r\n/g, "\n");
const regla = (selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const valor = (bloque, propiedad) => bloque.match(new RegExp(`(?:^|;|\\s)${propiedad}\\s*:\\s*([^;]+);`))?.[1].trim();
const FONDO = "#F7EFE9"; // .auth-tabs

describe("Pestañas de autenticación (3.6)", () => {
  it("la activa es bordó en reposo, con el puntero y con el foco", () => {
    const activa = regla(".auth-tab--activo,\n.auth-tab--activo:hover,\n.auth-tab--activo:focus,\n.auth-tab--activo:visited");
    expect(valor(activa, "color").toLowerCase()).toBe("#890620");
    expect(contraste("#890620", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("la inactiva se lee sobre el fondo de las pestañas, también con el puntero y el foco", () => {
    expect(valor(regla(".auth-tab"), "background")).toBe("transparent");
    expect(contraste(valor(regla(".auth-tab"), "color"), FONDO)).toBeGreaterThanOrEqual(4.5);
    const encima = regla(".auth-tab:hover:not(.auth-tab--activo),\n.auth-tab:focus:not(.auth-tab--activo)");
    expect(contraste(valor(encima, "color"), FONDO)).toBeGreaterThanOrEqual(4.5);
  });

  it("objetivo táctil de 44 px", () => {
    expect(Number.parseInt(valor(regla(".auth-tab"), "min-height"), 10)).toBeGreaterThanOrEqual(44);
  });

  it("el foco del teclado se ve con un contorno de la marca (no el azul del navegador)", () => {
    expect(valor(regla(".auth-tab:focus-visible"), "outline")).toMatch(/#890620/i);
  });
});
