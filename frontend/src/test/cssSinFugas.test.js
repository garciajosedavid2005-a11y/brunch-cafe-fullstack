// Regresión: solo los archivos base pueden tener selectores globales (de elemento sin clase,
// id ni atributo). Ej.: `span { color: … }` en footer.css teñía de rosa claro todos los <span>.
// Se lee con fs: con `css: false` Vitest entrega los .css vacíos.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { reglasCss, esSelectorGlobal } from "./selectoresGlobales";

// Ruta de src/ a partir de este archivo (no depende del directorio desde el que se ejecuta)
const SRC = join(import.meta.dirname, "..");
const ARCHIVOS_BASE = ["styles/index.css", "styles/variables.css"];
const rutaRelativa = (archivo) => relative(SRC, archivo).split(sep).join("/");
const hojasCss = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? hojasCss(join(dir, e.name)) : e.name.endsWith(".css") ? [join(dir, e.name)] : []
);

describe("CSS sin reglas globales", () => {
  it("el analizador detecta selectores globales y respeta los encapsulados", () => {
    const css = [
      "/* span { } */",
      ".a span { color: red }",
      "span, .b { color: red }",
      "@media (max-width: 9px) { ul li { margin: 0 } }",
      "@keyframes x { from { opacity: 0 } 50% { opacity: .5 } }",
      'input[type="x"] { }',
    ].join("\n");
    expect(reglasCss(css).filter(esSelectorGlobal).map((r) => r.selector)).toEqual(["span", "ul li"]);
  });

  it("fuera de los archivos base no hay selectores globales", () => {
    const archivos = hojasCss(SRC).filter((f) => !ARCHIVOS_BASE.includes(rutaRelativa(f)));
    const fugas = archivos.flatMap((archivo) =>
      reglasCss(readFileSync(archivo, "utf8")).filter(esSelectorGlobal)
        .map(({ selector, linea }) => `${rutaRelativa(archivo)}:${linea} ${selector}`)
    );
    expect(archivos.length).toBeGreaterThan(25);
    expect(fugas).toEqual([]);
  });
});
