import { describe, it, expect } from "vitest";
import { formatearCOP } from "./moneda";

// Intl usa un espacio duro entre "$" y la cifra
const normal = (texto) => texto.replace(/\s/g, " ");

describe("formatearCOP", () => {
  it("formatea enteros en pesos colombianos sin decimales", () => {
    expect(normal(formatearCOP(12000))).toBe("$ 12.000");
    expect(normal(formatearCOP(1500000))).toBe("$ 1.500.000");
    expect(normal(formatearCOP(0))).toBe("$ 0");
  });

  it("no parsea texto: un valor no numérico se muestra como $ 0", () => {
    expect(normal(formatearCOP(undefined))).toBe("$ 0");
    expect(normal(formatearCOP("$12.000"))).toBe("$ 0");
  });
});
