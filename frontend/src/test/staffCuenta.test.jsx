// Un usuario de staff: no entra a /admin y en /cuenta ve su rol y el aviso del panel de personal
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
  return Promise.resolve({});
});

describe("Staff en /cuenta", () => {
  beforeEach(() => apiRequest.mockReset());

  it("un mesero que abre /admin termina en /cuenta con su rol y el aviso", async () => {
    responder(usuario("mesero", "Mesero"));
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(await screen.findByText("Mesero", { selector: ".customer-dashboard__rol" })).toBeInTheDocument();
    expect(screen.getByText("Tu panel de personal estará disponible próximamente. Por ahora puedes usar tu cuenta como cliente.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/cuenta");
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
