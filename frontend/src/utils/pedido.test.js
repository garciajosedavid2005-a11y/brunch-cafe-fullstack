import { describe, it, expect } from "vitest";
import { itemsDelPedido, problemasPorLinea } from "./pedido";

// 1.14 · Qué líneas del carrito marcar cuando el servidor rechaza el pedido
describe("problemasPorLinea", () => {
  const LINEAS = [{ linea: "a|" }, { linea: "b|g1:o1|" }, { linea: "b|g1:o2|Sin sal" }];
  const error = (code, message, details) => Object.assign(new Error(message), { code, details });

  it("details.lineas → cada línea con el mensaje del error", () => {
    expect(problemasPorLinea(error("OPCION_NO_DISPONIBLE", "«Pochados» está agotada.", { linea: 1, lineas: [1] }), LINEAS))
      .toEqual({ "b|g1:o1|": "«Pochados» está agotada." });
    expect(problemasPorLinea(error("PRODUCT_UNAVAILABLE", "Agotado: Pan.", { productos: [3], lineas: [0, 2] }), LINEAS))
      .toEqual({ "a|": "Agotado: Pan.", "b|g1:o2|Sin sal": "Agotado: Pan." });
  });

  it("VALIDATION_ERROR → la línea de cada campo items.N con su propio mensaje", () => {
    expect(problemasPorLinea(error("VALIDATION_ERROR", "x", [
      { campo: "items.2.nota", mensaje: "La nota no puede superar 140 caracteres" },
      { campo: "direccion", mensaje: "Ingresa una dirección válida." },
    ]), LINEAS)).toEqual({ "b|g1:o2|Sin sal": "La nota no puede superar 140 caracteres" });
  });

  it("sin líneas (o índices fuera del carrito) → nada que marcar", () => {
    expect(problemasPorLinea(error("HORA_NO_DISPONIBLE", "x", { horasDisponibles: [] }), LINEAS)).toEqual({});
    expect(problemasPorLinea(error("X", "x", { lineas: [7] }), LINEAS)).toEqual({});
    expect(problemasPorLinea(new Error("Sin conexión"), LINEAS)).toEqual({});
  });
});

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
