import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../../services/api";
import OrdersSection from "./OrdersSection";

const PEDIDO = {
  id: "p1", codigo: "PED-ABC123", cliente: "Ana Pérez", correo: "ana@example.com", telefono: "3001234567",
  direccion: "Carrera 36B #30-06", barrio: "Centro", hora: "10:00", fecha: "2026-11-05T20:11:16.000Z",
  total: 38000, metodoPago: "Contra Entrega", estado: "Pendiente", estadoCodigo: "pendiente", esFinal: false,
  transiciones: [], productos: [],
};

describe("Pedidos (admin): tabla compacta", () => {
  beforeEach(() => {
    api.get.mockImplementation((ruta) => Promise.resolve(ruta.startsWith("/v1/admin/estados") ? [] : [PEDIDO]));
  });

  it("5 columnas: cliente bajo el código, método de pago bajo el total", async () => {
    render(<DialogoProvider><OrdersSection /></DialogoProvider>);
    const fila = (await screen.findByText("Ana Pérez")).closest("tr");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(
      ["Pedido", "Entrega", "Total", "Estado", "Acciones"]
    );
    const celdas = within(fila).getAllByRole("cell");
    expect(celdas).toHaveLength(5);
    expect(within(celdas[0]).getByText("PED-ABC123")).toBeInTheDocument();
    expect(within(celdas[0]).getByText("Ana Pérez")).toBeInTheDocument();
    expect(within(celdas[2]).getByText("Contra Entrega")).toBeInTheDocument();
    expect(within(celdas[4]).getByRole("button", { name: /ver detalle/i })).toBeInTheDocument();
  });
});

// 1.12 · El detalle del pedido muestra las opciones de cada plato y su nota (y nada extra si no tiene)
describe("Pedidos (admin): opciones de cada plato", () => {
  it("el detalle muestra las opciones con su recargo y la nota de la línea", async () => {
    const conOpciones = { ...PEDIDO, items: [
      { nombre: "Huevos al gusto", cantidad: 2, precio: 18000, precioBase: 15000, subtotal: 36000, nota: "Sin sal",
        modificadores: [{ grupo: "Término del huevo", opcion: "Fritos", precioExtra: 0 }, { grupo: "Extras", opcion: "Tocineta", precioExtra: 3000 }] },
      { nombre: "Jugo de naranja", cantidad: 1, precio: 7000, subtotal: 7000, modificadores: [], nota: "" },
    ] };
    api.get.mockImplementation((ruta) => Promise.resolve(ruta.startsWith("/v1/admin/estados") ? [] : [conOpciones]));
    render(<DialogoProvider><OrdersSection /></DialogoProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /ver detalle/i }));
    const fila = screen.getByText("Huevos al gusto").closest("tr");
    expect(fila).toHaveTextContent("Término del huevo: Fritos · Extras: Tocineta (+ $ 3.000)");
    expect(fila).toHaveTextContent("Nota: Sin sal");
    expect(fila).toHaveTextContent("$ 18.000");
    expect(screen.getByText("Jugo de naranja").closest("tr")).not.toHaveTextContent("Nota:");
  });
});
