import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({
  apiRequest: vi.fn(),
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { api } from "../../../services/api";
import ReservationsSection from "./ReservationsSection";

const RESERVA = {
  id: "r1", codigo: "RES-ABC123", cliente: "Ana Pérez", correo: "ana@example.com", telefono: "3001234567",
  personas: 4, fecha: "2026-12-01T12:00:00.000Z", hora: "09:00", motivo: "Cumpleaños", estado: "Pendiente",
  estadoCodigo: "pendiente", esFinal: false, observaciones: "",
  transiciones: [
    { codigo: "confirmada", nombre: "Confirmada", requiereMotivo: false },
    { codigo: "cancelada", nombre: "Cancelada", requiereMotivo: true },
  ],
};

describe("Reservas (admin): tabla compacta", () => {
  beforeEach(() => {
    api.get.mockImplementation((ruta) => Promise.resolve(ruta.startsWith("/v1/admin/estados") ? [] : [RESERVA]));
  });

  it("5 columnas: código y motivo bajo el cliente, personas junto a la fecha", async () => {
    render(<DialogoProvider><ReservationsSection /></DialogoProvider>);
    const fila = (await screen.findByText("Ana Pérez")).closest("tr");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(
      ["Reserva", "Contacto", "Fecha y hora", "Estado", "Acciones"]
    );
    const celdas = within(fila).getAllByRole("cell");
    expect(celdas).toHaveLength(5);
    expect(within(celdas[0]).getByText("RES-ABC123")).toBeInTheDocument();
    expect(within(celdas[0]).getByText("Cumpleaños")).toBeInTheDocument();
    expect(within(celdas[2]).getByText(/4 pers\./)).toBeInTheDocument();
  });

  it("los botones de solo ícono tienen nombre accesible", async () => {
    render(<DialogoProvider><ReservationsSection /></DialogoProvider>);
    const fila = (await screen.findByText("Ana Pérez")).closest("tr");
    expect(within(fila).getByRole("button", { name: "Confirmar reserva de Ana Pérez" })).toBeInTheDocument();
    expect(within(fila).getByRole("button", { name: "Cancelar reserva de Ana Pérez" })).toBeInTheDocument();
  });
});
