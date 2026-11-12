// 1.7 · Los botones del diálogo común (confirmar, avisar) miden al menos 44 px de alto: en la toma de
// comanda de la tablet medían 42 (MEDIR_TACTIL=1 npm run capturas). jsdom no calcula el diseño: se revisa el CSS.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "Dialogo.css"), "utf8");

describe("Botones del diálogo común", () => {
  it("min-height de al menos 44 px", () => {
    const regla = css.match(/\.dialogo__boton\s*\{([^}]*)\}/)?.[1] ?? "";
    const minimo = Number(regla.match(/min-height:\s*(\d+)px/)?.[1]);
    expect(minimo).toBeGreaterThanOrEqual(44);
  });
});

// 1.7 · La fuente de títulos dibuja el 1 como «ı» con sus números antiguos («Enviar la ronda ı»)
describe("Título del diálogo común", () => {
  it("usa números de altura completa (lining-nums)", () => {
    const regla = css.match(/\.dialogo__titulo\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(regla).toMatch(/font-variant-numeric:\s*lining-nums/);
  });
});
