// 2.6 · Con el aviso «Listo para servir» (o un error del panel) entre las pestañas y el contenido, la franja
// no se estira: antes la rejilla `auto auto 1fr` daba la fila elástica al tercer hijo, fuera el que fuera
// (a 768×1024 el aviso medía 140 px). Ahora es una columna y solo el contenido crece. jsdom no calcula el
// diseño: se revisan las reglas (capturas 2.6-despues).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "StaffDashboard.css"), "utf8");
// Cuerpo de la regla cuyo selector es exactamente `selector` (sin contar comentarios previos)
const regla = (selector) => {
  for (const bloque of css.split("}")) {
    const [cabeza, cuerpo] = bloque.split("{");
    if (cuerpo !== undefined && cabeza.split("*/").at(-1).trim() === selector) return cuerpo;
  }
  return "";
};

describe("Layout de /staff (2.6)", () => {
  it("solo el contenido ocupa el alto sobrante, no el hijo que caiga en la tercera fila", () => {
    expect(regla(".staff-tablet")).not.toMatch(/grid-template-rows/);
    expect(regla(".staff-tablet")).toMatch(/flex-direction:\s*column/);
    expect(regla(".staff-tablet__contenido")).toMatch(/flex:\s*1/);
  });
});
