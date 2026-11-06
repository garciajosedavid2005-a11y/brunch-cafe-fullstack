// Rutas de staff (0.15d): se deciden por permisos y por esPersonal, no por el nombre del rol.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../services/api", () => {
  const apiRequest = vi.fn();
  return { apiRequest, apiAssetUrl: (p) => p, api: { get: (ruta) => apiRequest(ruta) } };
});
// El panel de administración real necesita sus propios datos; aquí solo importa a dónde se llega
vi.mock("../pages/AdminDashboard/AdminDashboard", () => ({ default: () => <h1>Panel de administración (simulado)</h1> }));
import { apiRequest } from "../services/api";
import App from "../App";

const usuario = (role, roleLabel, extra = {}) => ({
  id: "u1", nombre: "Luis", apellido: "Gómez", email: "luis@example.com", telefono: "300",
  role, roleLabel, permisos: [], esPersonal: role !== "cliente", ...extra,
});

const responder = (user) => apiRequest.mockImplementation((ruta = "") => {
  if (ruta === "/v1/auth/me") return Promise.resolve({ user });
  if (ruta === "/v1/cliente/perfil") return Promise.resolve({ perfil: { nombre: user.nombre, apellido: user.apellido, correo: user.email, telefono: user.telefono } });
  if (ruta === "/v1/staff/reservas" || ruta.startsWith("/v1/staff/pedidos")) return Promise.resolve([]);
  return Promise.resolve({});
});

const abrir = (ruta) => {
  window.history.pushState({}, "", ruta);
  render(<App />);
};

describe("Rutas de staff", () => {
  beforeEach(() => apiRequest.mockReset());

  it("un mesero que abre /admin termina en /staff, empezando por el resumen", async () => {
    responder(usuario("mesero", "Mesero", { permisos: ["pedido:ver", "pedido:cambiar_estado", "reserva:ver", "reserva:crear"] }));
    abrir("/admin");
    expect(await screen.findByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(screen.getByText("Mesero", { selector: "strong" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/staff");
    expect(screen.queryByText(/panel de administración/i)).not.toBeInTheDocument();
  });

  it("la ruta vieja /mesero redirige a /staff", async () => {
    responder(usuario("mesero", "Mesero", { permisos: ["pedido:ver"] }));
    abrir("/mesero");
    expect(await screen.findByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/staff");
  });

  it("cualquier rol de personal (no solo «mesero») entra a /staff desde /cuenta", async () => {
    responder(usuario("anfitrion", "Anfitrión", { permisos: ["reserva:ver"] }));
    abrir("/cuenta");
    expect(await screen.findByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/staff");
  });

  it("un cliente que abre /staff vuelve a /cuenta", async () => {
    responder(usuario("cliente", "Cliente"));
    abrir("/staff");
    await waitFor(() => expect(window.location.pathname).toBe("/cuenta"));
  });

  it("el panel de administración se abre por el permiso *, no por el nombre del rol", async () => {
    responder(usuario("gerencia", "Gerencia", { permisos: ["*"] }));
    abrir("/staff");
    await waitFor(() => expect(window.location.pathname).toBe("/admin"));
  });

  it("un cliente no ve insignia de staff ni el aviso", async () => {
    responder(usuario("cliente", "Cliente"));
    abrir("/cuenta");
    expect(await screen.findByText(/hola, luis/i)).toBeInTheDocument();
    expect(screen.queryByText(/panel de personal/i)).not.toBeInTheDocument();
    expect(document.querySelector(".customer-dashboard__rol")).toBeNull();
  });
});
