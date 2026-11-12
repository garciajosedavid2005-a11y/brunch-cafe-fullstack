import { describe, it, expect } from "vitest";
import { itemsDelPedido } from "./pedido";

describe("itemsDelPedido", () => {
  it("envía cada producto por su ObjectId (productoRef) con su cantidad", () => {
    expect(itemsDelPedido([
      { id: "a".repeat(24), codigo: 1, nombre: "Latte", precio: 9000, cantidad: 2 },
    ])).toEqual([{ productoRef: "a".repeat(24), cantidad: 2 }]);
  });

  // 1.12 · Las opciones elegidas (por id) y la nota de la línea; el precio nunca se envía
  it("con opciones y nota, envía los ids de grupo y opción y la nota, sin precios", () => {
    expect(itemsDelPedido([{
      id: "a".repeat(24), cantidad: 1, precio: 15000, precioUnitario: 18000, nota: "Sin sal",
      modificadores: [{ grupoId: "g1", grupo: "Término", opciones: [{ id: "o1", nombre: "Fritos", precioExtra: 0 }] },
        { grupoId: "g2", grupo: "Extras", opciones: [{ id: "o2", nombre: "Tocineta", precioExtra: 3000 }] }],
    }])).toEqual([{
      productoRef: "a".repeat(24), cantidad: 1, nota: "Sin sal",
      modificadores: [{ grupoId: "g1", opcionIds: ["o1"] }, { grupoId: "g2", opcionIds: ["o2"] }],
    }]);
  });
});
