// Regresión: el CSS de componentes y páginas no puede tener reglas de elemento sueltas
// (p. ej. `span { color: … }` en footer.css teñía de rosa claro todos los <span> de la app).
// Se lee con fs: con `css: false` Vitest entrega los .css vacíos.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const SRC = join(process.cwd(), "src");
const hojasCss = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? hojasCss(join(dir, e.name)) : e.name.endsWith(".css") ? [join(dir, e.name)] : []
);
const ELEMENTO_SUELTO = /^(span|p|a|label|div|li|ul|ol|h[1-6]|button|input|select|textarea|legend|small|strong|img)\s*(,|\{)/;

describe("CSS sin reglas globales", () => {
  it("ninguna hoja de componente o página define estilos para un elemento sin clase", () => {
    const archivos = [...hojasCss(join(SRC, "components")), ...hojasCss(join(SRC, "pages"))];
    const fugas = archivos.flatMap((archivo) =>
      readFileSync(archivo, "utf8").split("\n")
        .map((linea, i) => ({ linea: i + 1, texto: linea.trim() }))
        .filter(({ texto }) => ELEMENTO_SUELTO.test(texto))
        .map(({ linea, texto }) => `${archivo.replace(SRC, "src")}:${linea} ${texto}`)
    );
    expect(archivos.length).toBeGreaterThan(10);
    expect(fugas).toEqual([]);
  });
});
