import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// 1.1 · F1-10: integración con el AuthProvider y los guardas de rutas reales. Al cerrar la
// sesión, StaffRoute redirige a /login por su cuenta; el aviso no debe perderse en esa carrera.
const mesero = {
  id: "u1",
  nombre: "Mesero",
  correo: "mesero@example.com",
  rol: "mesero",
  roleLabel: "Mesero",
  permisos: ["pedido:ver", "reserva:ver"],
  esPersonal: true,
};

const api = vi.hoisted(() => ({ sesionAbierta: true }));

vi.mock("./services/api", () => ({
  apiRequest: vi.fn(async (ruta) => {
    if (ruta === "/v1/auth/me") {
      if (!api.sesionAbierta) throw Object.assign(new Error("Sin sesión"), { status: 401 });
      return { user: mesero };
    }
    if (ruta === "/v1/auth/logout") {
      api.sesionAbierta = false;
      return {};
    }
    if (ruta.startsWith("/v1/staff/")) return [];
    if (ruta === "/v1/horarios") return { reservas: {}, domicilio: {} };
    return [];
  }),
}));

import App from "./App";

describe("Cambiar de usuario en una tablet compartida (1.1)", () => {
  it("cierra la sesión del mesero y el login avisa que la sesión anterior se cerró", async () => {
    window.history.replaceState(null, "", "/staff");
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Cambiar de usuario" }));

    expect(await screen.findByRole("status")).toHaveTextContent("La sesión anterior se cerró. Ingresa con tu usuario.");
    expect(window.location.pathname).toBe("/login");
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("");
  });
});
