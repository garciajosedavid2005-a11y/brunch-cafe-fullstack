import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  user: {
    nombre: "Ana",
    role: "mesero",
    roleLabel: "Mesero",
    permisos: ["pedido:ver", "pedido:cambiar_estado", "reserva:ver", "reserva:crear"],
  },
  apiRequest: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: state.user, logout: state.logout }),
}));

vi.mock("../../services/api", () => ({
  apiRequest: state.apiRequest,
}));

import WaiterDashboard from "./WaiterDashboard";

describe("Panel de mesero", () => {
  beforeEach(() => {
    state.user = {
      nombre: "Ana",
      role: "mesero",
      roleLabel: "Mesero",
      permisos: ["pedido:ver", "pedido:cambiar_estado", "reserva:ver", "reserva:crear"],
    };
    state.apiRequest.mockReset();
    state.apiRequest.mockImplementation((path) => {
      if (path === "/v1/staff/reservas") {
        return Promise.resolve([{
          id: "res-1",
          codigo: "RES-000001",
          cliente: "Lucía Pérez",
          correo: "lucia@example.com",
          personas: 3,
          fecha: new Date().toISOString(),
          hora: "13:00",
          estado: "Pendiente",
          estadoCodigo: "pendiente",
        }]);
      }
      if (path === "/v1/staff/pedidos?limite=20") {
        return Promise.resolve([{
          id: "ped-1",
          codigo: "PED-000001",
          cliente: "Carlos Gómez",
          fecha: new Date().toISOString(),
          estado: "Pendiente",
          estadoCodigo: "pendiente",
          total: 25000,
          transiciones: [],
        }]);
      }
      if (path === "/v1/cliente/perfil") {
        return Promise.resolve({
          perfil: {
            nombre: "Ana",
            apellido: "Pérez",
            correo: "ana@example.com",
            telefono: "3001234567",
            rol: { nombre: "mesero", etiqueta: "Mesero" },
            createdAt: new Date().toISOString(),
          },
        });
      }
      return Promise.reject(new Error(`Ruta inesperada: ${path}`));
    });
  });

  it("muestra primero el resumen con datos reales y permite entrar a las reservas y pedidos", async () => {
    render(<MemoryRouter><WaiterDashboard /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(state.apiRequest).toHaveBeenCalledWith("/v1/staff/reservas");
    expect(state.apiRequest).toHaveBeenCalledWith("/v1/staff/pedidos?limite=20");

    const navigation = screen.getByRole("navigation", { name: /secciones del panel de mesero/i });
    fireEvent.click(within(navigation).getByRole("button", { name: "Reservas" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /reservas/i })).toBeInTheDocument());
    expect(await screen.findByText("Lucía Pérez")).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Pedidos" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /pedidos/i })).toBeInTheDocument());
    expect(await screen.findByText("Carlos Gómez")).toBeInTheDocument();

    fireEvent.click(within(navigation).getByRole("button", { name: "Mi perfil" }));
    expect(await screen.findByRole("heading", { name: "Mi perfil" })).toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Seguridad" }));
    expect(await screen.findByRole("heading", { name: "Seguridad y configuración" })).toBeInTheDocument();
  });

  it("oculta los módulos de reservas y pedidos si el rol no tiene esos permisos", () => {
    state.user.permisos = [];

    render(<MemoryRouter><WaiterDashboard /></MemoryRouter>);

    expect(screen.getByRole("button", { name: /resumen/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reservas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pedidos/i })).not.toBeInTheDocument();
    expect(state.apiRequest).not.toHaveBeenCalled();
  });
});
