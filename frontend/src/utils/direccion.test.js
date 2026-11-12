// 1.11 · La validación de direcciones es la MISMA que la del backend: el archivo es una copia exacta.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { esDireccionValida, MENSAJE_DIRECCION } from "./direccion";

const leer = (ruta) => readFileSync(ruta, "utf8").replace(/\r\n/g, "\n");

describe("Validación de direcciones (1.11)", () => {
  it("es una copia exacta de backend/src/modulos/compartido/direccion.js", () => {
    const frontend = leer(join(import.meta.dirname, "direccion.js"));
    const backend = leer(join(import.meta.dirname, "..", "..", "..", "backend", "src", "modulos", "compartido", "direccion.js"));
    expect(frontend).toBe(backend);
  });

  it.each([
    "Cra 36b Oriente #30-06", "Calle 10 Sur # 43A-12", "Cl 72 No. 10-34", "Cll 45 N° 13-21", "Kr 15 # 88-64 apto 301",
    "Av. 68 # 22-31", "Av. Calle 80 # 69-70", "Calle 6AB # 12-30", "Cra 7 # 45–10", "Ak 7 No. 32-16", "Ac 26 # 69D-91", "Dg 25 Bis A # 30-15", "Tv 93 # 51-98 Sur", "Transversal 5 Este # 12 - 40",
    // 1.14 · avenidas con nombre y manzana-casa
    "Av. El Dorado # 68-51", "Av. Boyacá # 12-30", "Mz 5 Cs 3", "Manzana 5 Casa 3", "Barrio Las Palmas Mz 5 Cs 3", "Mz 5 Cs 3, Villa del Sol",
  ])("acepta «%s»", (direccion) => {
    expect(esDireccionValida(direccion)).toBe(true);
  });

  it.each(["", "Mi casa", "Barrio Centro", "Cra", "Calle 10", "Cra 7 #", "Cl1#1-1", `Cra 7 # 45-10 ${"x".repeat(47)}`, "Av. El Dorado", "Mz 5", "Casa 3", "Avanzan 5 10", "Avísame en 5 10"])("rechaza «%s»", (direccion) => {
    expect(esDireccionValida(direccion)).toBe(false);
  });

  it("el mensaje lleva un ejemplo", () => {
    expect(MENSAJE_DIRECCION).toBe("Ingresa una dirección válida. Ejemplo: Cra 36B Oriente #30-06.");
  });
});
