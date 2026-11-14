import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import DibujoMesa from "./DibujoMesa";
import { geometriaMesa, nivelTiempo, progresoAnillo } from "./geometriaMesa";

// 2.6c (propuesta B, elegida por Brayan) · Dibujo de la mesa: forma según la capacidad, una silla por
// puesto (rellenas según los comensales), anillo del tiempo ocupada y mesas unidas conectadas.
describe("Geometría de la mesa", () => {
  it("redonda hasta 2 puestos, cuadrada hasta 4 y rectangular desde 5; una silla por puesto", () => {
    expect(geometriaMesa(2)).toMatchObject({ forma: "redonda" });
    expect(geometriaMesa(4)).toMatchObject({ forma: "cuadrada" });
    expect(geometriaMesa(6)).toMatchObject({ forma: "rectangular" });
    for (const capacidad of [1, 2, 3, 4, 5, 6, 8, 11]) expect(geometriaMesa(capacidad).sillas).toHaveLength(capacidad);
  });

  it("las mesas unidas son una pieza rectangular con un tablero por mesa y sus sillas sumadas", () => {
    const g = geometriaMesa(8, 2);
    expect(g.forma).toBe("unida");
    expect(g.tableros).toHaveLength(2);
    expect(g.sillas).toHaveLength(8);
    expect(g.uniones).toHaveLength(1);
  });

  it("ninguna silla se sale del dibujo", () => {
    for (const [capacidad, mesas] of [[2, 1], [4, 1], [6, 1], [10, 1], [8, 2], [12, 3]]) {
      const g = geometriaMesa(capacidad, mesas);
      for (const [x, y] of g.sillas) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(g.ancho);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(g.alto);
      }
    }
  });
});

describe("Anillo del tiempo ocupada", () => {
  it("cambia de nivel a los 60 y a los 90 min", () => {
    expect(nivelTiempo(59)).toBe("normal");
    expect(nivelTiempo(60)).toBe("aviso");
    expect(nivelTiempo(89)).toBe("aviso");
    expect(nivelTiempo(90)).toBe("alerta");
  });

  it("se llena en 2 h y no pasa del 100 %", () => {
    expect(progresoAnillo(0)).toBe(0);
    expect(progresoAnillo(60)).toBe(50);
    expect(progresoAnillo(300)).toBe(100);
  });
});

describe("Dibujo", () => {
  const sillas = (contenedor) => [...contenedor.querySelectorAll("[data-silla]")].map((s) => s.dataset.silla);

  it("rellena tantas sillas como comensales y dibuja el anillo con su nivel", () => {
    const { container } = render(<DibujoMesa numero="3" capacidad={4} comensales={3} minutos={95} />);
    expect(sillas(container)).toEqual(["ocupada", "ocupada", "ocupada", "libre"]);
    expect(container.querySelector("[data-anillo]").dataset.anillo).toBe("alerta");
    expect(container.querySelector("text").textContent).toBe("3");
  });

  it("sin cuenta: sillas vacías y sin anillo", () => {
    const { container } = render(<DibujoMesa numero="8" capacidad={2} comensales={0} />);
    expect(sillas(container)).toEqual(["libre", "libre"]);
    expect(container.querySelector("[data-anillo]")).toBeNull();
  });

  it("mesas unidas: dos tableros conectados y el número de las dos", () => {
    const { container } = render(<DibujoMesa numero="5+6" capacidad={8} mesas={2} comensales={7} minutos={70} />);
    expect(container.querySelectorAll(".dibujo-mesa__tablero")).toHaveLength(2);
    expect(container.querySelectorAll(".dibujo-mesa__union")).toHaveLength(1);
    expect(sillas(container).filter((s) => s === "ocupada")).toHaveLength(7);
    expect(container.querySelector("[data-anillo]").dataset.anillo).toBe("aviso");
  });

  it("es decorativo: lo describe el botón de la mesa", () => {
    const { container } = render(<DibujoMesa numero="1" capacidad={2} comensales={1} minutos={5} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
