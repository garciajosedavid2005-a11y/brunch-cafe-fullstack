import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CarritoProvider, useCarrito } from "./CarritoContext";

const FRITOS = [{ grupoId: "g1", grupo: "Término", opciones: [{ id: "o1", nombre: "Fritos", precioExtra: 0 }] }];
const REVUELTOS_CON_TOCINETA = [
  { grupoId: "g1", grupo: "Término", opciones: [{ id: "o2", nombre: "Revueltos", precioExtra: 0 }] },
  { grupoId: "g2", grupo: "Extras", opciones: [{ id: "o3", nombre: "Tocineta", precioExtra: 3000 }] },
];
const HUEVOS = { id: "h", nombre: "Huevos al gusto", precio: 15000 };

describe("CarritoContext", () => {
  it("suma precios enteros (COP) por cantidad", () => {
    const { result } = renderHook(() => useCarrito(), { wrapper: CarritoProvider });
    act(() => result.current.agregarProducto({ id: 1, nombre: "Latte", precio: 12000 }));
    act(() => result.current.agregarProducto({ id: 1, nombre: "Latte", precio: 12000 }));
    act(() => result.current.agregarProducto({ id: 2, nombre: "Waffle", precio: 15000 }));
    expect(result.current.calcularTotal()).toBe(39000);
  });

  // 1.12 · Una línea por combinación de producto, opciones y nota; el recargo entra en el total
  it("el mismo producto con opciones distintas va en líneas separadas; con las mismas, suma cantidad", () => {
    const { result } = renderHook(() => useCarrito(), { wrapper: CarritoProvider });
    act(() => result.current.agregarProducto(HUEVOS, { modificadores: FRITOS }));
    act(() => result.current.agregarProducto(HUEVOS, { modificadores: REVUELTOS_CON_TOCINETA, cantidad: 2 }));
    act(() => result.current.agregarProducto(HUEVOS, { modificadores: FRITOS }));
    act(() => result.current.agregarProducto(HUEVOS, { modificadores: FRITOS, nota: "Sin sal" }));
    const lineas = result.current.productos;
    expect(lineas.map((l) => [l.modificadores.map((g) => g.opciones[0].nombre).join("+"), l.nota, l.cantidad, l.precioUnitario]))
      .toEqual([["Fritos", "", 2, 15000], ["Revueltos+Tocineta", "", 2, 18000], ["Fritos", "Sin sal", 1, 15000]]);
    expect(result.current.calcularTotal()).toBe(15000 * 2 + 18000 * 2 + 15000);
  });

  it("sumar, restar y quitar actúan sobre una línea, no sobre todas las del producto", () => {
    const { result } = renderHook(() => useCarrito(), { wrapper: CarritoProvider });
    act(() => result.current.agregarProducto(HUEVOS, { modificadores: FRITOS }));
    act(() => result.current.agregarProducto(HUEVOS, { modificadores: REVUELTOS_CON_TOCINETA }));
    const [fritos, revueltos] = result.current.productos;
    act(() => result.current.aumentarCantidad(revueltos.linea));
    expect(result.current.productos.map((l) => l.cantidad)).toEqual([1, 2]);
    act(() => result.current.eliminarProducto(fritos.linea));
    expect(result.current.productos.map((l) => l.linea)).toEqual([revueltos.linea]);
  });
});
