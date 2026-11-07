// 1.1b: los valores de las tarjetas del resumen de /staff no se cortan con «…»
// («Próxima reserva» mostraba «Sin próxi…» a 1280 px y «Sin …» a 768 px). jsdom no calcula el
// diseño, así que se revisan las reglas del CSS; las capturas 1.1b-antes/-despues lo confirman.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dirname, "StaffDashboard.css"), "utf8");
// Todas las reglas cuyo selector afecta al valor de la tarjeta (también dentro de @media)
const reglasDelValor = [...css.matchAll(/([^{}]*\.staff-dashboard__stat strong[^{}]*)\{([^}]*)\}/g)].map((m) => m[2]);

describe("Tarjetas del resumen de /staff", () => {
  it("el valor de cada tarjeta existe en el CSS", () => {
    expect(reglasDelValor.length).toBeGreaterThan(0);
  });

  it("no corta el texto con puntos suspensivos ni lo obliga a una sola línea", () => {
    for (const regla of reglasDelValor) {
      expect(regla).not.toMatch(/text-overflow\s*:\s*ellipsis/);
      expect(regla).not.toMatch(/white-space\s*:\s*nowrap/);
    }
  });
});

describe("Tarjetas del resumen en tablet vertical (1.1b)", () => {
  it("a ≤ 900 px van de dos en dos (a 768 px cuatro columnas dejaban ~90 px por tarjeta)", () => {
    const bloque = css.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/);
    expect(bloque, "falta la media query de 900 px").not.toBeNull();
    expect(bloque[1]).toMatch(/\.staff-dashboard__stats\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  });
});
