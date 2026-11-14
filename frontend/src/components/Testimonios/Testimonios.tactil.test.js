// 3.6 · Áreas táctiles de 44 px sin agrandar el dibujo: los puntos del carrusel de testimonios (8 px) y las
// estrellas de Mis comentarios responden al toque en un área de 44 × 44; «Cerrar sesión» de la cabecera de
// Mi cuenta en una sola línea.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (ruta) => readFileSync(join(import.meta.dirname, ruta), "utf8").replace(/\r\n/g, "\n");
const regla = (css, selector) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
const valor = (bloque, propiedad) => bloque.match(new RegExp(`(?:^|;|\\s)${propiedad}\\s*:\\s*([^;]+);`))?.[1].trim();
const px = (texto) => Number.parseFloat(texto);

describe("Áreas táctiles (3.6)", () => {
  it("puntos del carrusel: el botón mide 44 × 44 y el punto se dibuja aparte (8 px)", () => {
    const css = leer("Testimonios.css");
    const boton = regla(css, ".testimonios__punto");
    expect(px(valor(boton, "width"))).toBeGreaterThanOrEqual(44);
    expect(px(valor(boton, "height"))).toBeGreaterThanOrEqual(44);
    expect(valor(boton, "background")).toBe("transparent");
    const punto = regla(css, ".testimonios__punto::before");
    expect(px(valor(punto, "width"))).toBe(8);
    expect(px(valor(punto, "height"))).toBe(8);
  });

  it("estrellas de Mis comentarios: área de 44 × 44 con el mismo tamaño de estrella", () => {
    const css = leer("../../pages/CustomerDashboard/CustomerDashboard.css");
    const estrella = regla(css, ".dashboard-rating button");
    expect(px(valor(estrella, "min-width"))).toBeGreaterThanOrEqual(44);
    expect(px(valor(estrella, "min-height"))).toBeGreaterThanOrEqual(44);
    expect(valor(estrella, "font-size")).toBe("2rem");
  });

  it("«Cerrar sesión» de la cabecera de Mi cuenta no se parte", () => {
    const css = leer("../../pages/CustomerDashboard/CustomerDashboard.css");
    expect(valor(regla(css, ".customer-dashboard__header .dashboard-button"), "white-space")).toBe("nowrap");
  });
});
