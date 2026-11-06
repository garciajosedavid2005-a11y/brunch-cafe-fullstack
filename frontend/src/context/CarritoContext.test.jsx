import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CarritoProvider, useCarrito } from "./CarritoContext";

describe("CarritoContext", () => {
  it("suma precios enteros (COP) por cantidad", () => {
    const { result } = renderHook(() => useCarrito(), { wrapper: CarritoProvider });
    act(() => result.current.agregarProducto({ id: 1, nombre: "Latte", precio: 12000 }));
    act(() => result.current.agregarProducto({ id: 1, nombre: "Latte", precio: 12000 }));
    act(() => result.current.agregarProducto({ id: 2, nombre: "Waffle", precio: 15000 }));
    expect(result.current.calcularTotal()).toBe(39000);
  });
});
