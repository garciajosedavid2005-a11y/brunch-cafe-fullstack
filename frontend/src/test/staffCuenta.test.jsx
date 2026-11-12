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

  it("en /staff el personal usa el layout de tablet: sin la navegación ni el pie del sitio (1.6)", async () => {
    responder(usuario("mesero", "Mesero", { permisos: ["pedido:ver"] }));
    abrir("/staff");
    expect(await screen.findByRole("navigation", { name: /secciones del panel de personal/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Menú" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar de usuario" })).toBeInTheDocument();
  });

  // F1-19 · El administrador entra a /staff (para anular) con el mismo layout de tablet
  it("el administrador entra a /staff con el layout de tablet y el plano; su inicio sigue siendo /admin", async () => {
    responder(usuario("admin", "Administrador", { permisos: ["*"], esPersonal: false }));
    abrir("/staff");
    expect(await screen.findByRole("heading", { name: "Plano de mesas" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/staff");
    expect(screen.queryByRole("button", { name: "Abrir menú de navegación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Panel Admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panel de administración" })).toHaveAttribute("href", "/admin");
  });

  it("con mesa:ver, /staff abre primero el plano de mesas (1.6)", async () => {
    responder(usuario("mesero", "Mesero", { permisos: ["mesa:ver"] }));
    abrir("/staff");
    expect(await screen.findByRole("heading", { name: "Plano de mesas" })).toBeInTheDocument();
  });

  it("la ruta vieja /mesero redirige a /staff", async () => {
    responder(usuario("mesero", "Mesero", { permisos: ["pedido:ver"] }));
    abrir("/mesero");
    expect(await screen.findByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/staff");
  });

  it("cualquier rol de personal (no solo «mesero») entra a /staff desde /cuenta", async () => {
    responder(usuario("cocina", "Cocina", { permisos: ["pedido:ver"] }));
    abrir("/cuenta");
    expect(await screen.findByRole("heading", { name: /resumen del turno/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/staff");
  });

  it("un cliente que abre /staff vuelve a /cuenta", async () => {
    responder(usuario("cliente", "Cliente"));
    abrir("/staff");
    await waitFor(() => expect(window.location.pathname).toBe("/cuenta"));
  });

  // F1-19: /staff ya no lo devuelve al admin (entra para anular); su inicio sigue siendo /admin
  it("el panel de administración se abre por el permiso *, no por el nombre del rol", async () => {
    responder(usuario("gerencia", "Gerencia", { permisos: ["*"] }));
    abrir("/login");
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
