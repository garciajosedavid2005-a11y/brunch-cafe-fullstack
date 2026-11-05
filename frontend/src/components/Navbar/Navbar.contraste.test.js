// El enlace activo/hover del navbar claro ("Panel Admin" en /admin) debe leerse
// sobre el fondo rosado: contraste WCAG AA ≥ 4.5:1. Antes era --color-suave (~2:1).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contraste, variablesCss, resolverColor } from "../../test/contraste";

const SRC = join(import.meta.dirname, "..", "..");
const variables = variablesCss(readFileSync(join(SRC, "styles/variables.css"), "utf8"));
const navbar = readFileSync(join(SRC, "components/Navbar/navbar.css"), "utf8");
// Reglas de escritorio: lo anterior al primer @media
const escritorio = navbar.slice(0, navbar.indexOf("@media"));

const colorDe = (css, selector) => {
  const bloque = css.match(new RegExp(`(^|\\}|\\*/)\\s*${selector}\\s*\\{([^}]*)\\}`));
  const color = bloque?.[2].match(/(?:^|;|\s)color\s*:\s*([^;]+)/);
  return color && resolverColor(color[1], variables);
};

describe("Contraste del navbar claro", () => {
  it("calcula el contraste WCAG", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("el enlace activo y el hover se leen sobre el fondo (≥ 4.5:1)", () => {
    const color = colorDe(escritorio, "\\.access:hover,\\s*\\.menu \\.active");
    expect(color).toMatch(/^#/);
    expect(contraste(color, variables["--color-fondo"])).toBeGreaterThanOrEqual(4.5);
  });
});
