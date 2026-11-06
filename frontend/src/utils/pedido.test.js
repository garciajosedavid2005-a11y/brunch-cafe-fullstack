import { describe, it, expect } from "vitest";
import { itemsDelPedido } from "./pedido";

describe("itemsDelPedido", () => {
  it("envía cada producto por su ObjectId (productoRef) con su cantidad", () => {
    expect(itemsDelPedido([
      { id: "a".repeat(24), codigo: 1, nombre: "Latte", precio: 9000, cantidad: 2 },
    ])).toEqual([{ productoRef: "a".repeat(24), cantidad: 2 }]);
  });
});
