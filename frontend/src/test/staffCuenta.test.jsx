// Un usuario de staff que abre /admin termina en el panel autorizado de Mesero.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../services/api", () => ({ apiRequest: vi.fn(), apiAssetUrl: (p) => p }));
import { apiRequest } from "../services/api";
import App from "../App";

const usuario = (role, roleLabel) => ({
  id: "u1", nombre: "Luis", apellido: "Gómez", email: "luis@example.com", telefono: "300", role, roleLabel, permisos: [],
});

const responder = (user) => apiRequest.mockImplementation((ruta) => {
  if (ruta === "/v1/auth/me") return Promise.resolve({ user });
  if (ruta === "/v1/cliente/perfil") return Promise.resolve({ perfil: { nombre: user.nombre, apellido: user.apellido, correo: user.email, telefono: user.telefono } });
  if (ruta === "/v1/staff/reservas" || ruta === "/v1/staff/pedidos?limite=20") return Promise.resolve([]);
  return Promise.resolve({});
});

describe("Rutas de staff", () => {
  beforeEach(() => apiRequest.mockReset());

  it("un mesero que abre /admin termina en su panel, empezando por el resumen", async () => {
    responder({
      ...usuario("mesero", "Mesero"),
      permisos: ["pedido:ver", "pedido:cambiar_estado", "reserva:ver", "reserva:crear"],
    });
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(await screen.findByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(screen.getByText("Mesero", { selector: "strong" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/mesero");
    expect(screen.queryByText(/panel de administración/i)).not.toBeInTheDocument();
  });

  it("un cliente no ve insignia de staff ni el aviso", async () => {
    responder(usuario("cliente", "Cliente"));
    window.history.pushState({}, "", "/cuenta");
    render(<App />);
    expect(await screen.findByText(/hola, luis/i)).toBeInTheDocument();
    expect(screen.queryByText(/panel de personal/i)).not.toBeInTheDocument();
    expect(document.querySelector(".customer-dashboard__rol")).toBeNull();
  });
});
