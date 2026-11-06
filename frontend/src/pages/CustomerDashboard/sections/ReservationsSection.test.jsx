import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../../context/DialogoContext";

vi.mock("../../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: { nombre: "Ana", apellido: "Pérez", email: "ana@example.com" } }) }));

import { apiRequest } from "../../../services/api";
import ReservationsSection from "./ReservationsSection";

const RESERVA = {
  _id: "r1", nombre: "Ana Pérez", correo: "ana@example.com", motivo: "Desayuno", personas: 2,
  fecha: "2030-01-10T12:00:00.000Z", hora: "09:00", observaciones: "", status: "pending",
};

describe("Mis reservas: cancelar", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation((ruta, opciones) =>
      opciones?.method === "PATCH"
        ? Promise.resolve({ reservation: { ...RESERVA, status: "cancelled" } })
        : Promise.resolve({ reservations: [RESERVA] })
    );
  });

  const montar = async () => {
    render(<MemoryRouter><DialogoProvider><ReservationsSection /></DialogoProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
  };

  it("pide confirmación con los textos acordados; 'Volver' no cancela", async () => {
    await montar();
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("¿Estás seguro de que deseas cancelar esta reserva?");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Solo lecturas (reservas y horarios): ninguna cancelación
    expect(apiRequest.mock.calls.filter(([, opciones]) => opciones?.method === "PATCH")).toEqual([]);
  });

  it("'Sí, cancelar reserva' cancela", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar reserva" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/v1/cliente/reservas/r1/cancelar", { method: "PATCH" }));
    expect(await screen.findByText("La reserva fue cancelada.")).toBeInTheDocument();
  });
});
