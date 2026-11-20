import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// 6.4 (F6-f) · Un cliente con el consentimiento pendiente lo acepta (versión vigente) antes de seguir; puede salir sin
// aceptar. La política se lee también sin sesión (/politica-datos).
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), auth: null }));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../context/useAuth", () => ({ useAuth: () => estado.auth }));

import Consentimiento, { PoliticaDatos } from "./Consentimiento";
import { CONSENTIMIENTO_VERSION } from "../../utils/consentimiento";

const montar = () => render(
  <MemoryRouter initialEntries={["/consentimiento"]}>
    <Routes>
      <Route path="/consentimiento" element={<Consentimiento />} />
      <Route path="/cuenta" element={<p>Panel del cliente</p>} />
      <Route path="/login" element={<p>Ingreso</p>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  estado.apiRequest.mockReset().mockResolvedValue({ consentimientoPendiente: false });
  estado.auth = {
    user: { nombre: "Ana", role: "cliente", esPersonal: false, permisos: [], consentimientoPendiente: true },
    setUser: vi.fn(), logout: vi.fn(), loading: false,
  };
});

describe("6.4 · Aceptar la política de datos", () => {
  it("muestra la política y la versión; «Aceptar» solo con la casilla; envía la versión vigente y lleva a /cuenta", async () => {
    montar();
    expect(screen.getByRole("heading", { name: "Antes de seguir, Ana" })).toBeInTheDocument();
    expect(screen.getByText(`Versión ${CONSENTIMIENTO_VERSION} · Ley 1581 de 2012`)).toBeInTheDocument();
    const aceptar = screen.getByRole("button", { name: "Aceptar y continuar" });
    expect(aceptar).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo a Brunch Café/ }));
    fireEvent.click(aceptar);
    expect(await screen.findByText("Panel del cliente")).toBeInTheDocument();
    expect(estado.apiRequest).toHaveBeenCalledWith("/v1/auth/consentimiento", expect.objectContaining({ method: "POST", body: JSON.stringify({ version: CONSENTIMIENTO_VERSION }) }));
    expect(estado.auth.setUser).toHaveBeenCalledWith(expect.objectContaining({ consentimientoPendiente: false }));
  });

  it("si falla, lo dice y no navega; «Salir sin aceptar» cierra la sesión", async () => {
    estado.apiRequest.mockRejectedValue(new Error("La política cambió: recarga la página y léela de nuevo."));
    montar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo a Brunch Café/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar y continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La política cambió");
    fireEvent.click(screen.getByRole("button", { name: "Salir sin aceptar" }));
    await waitFor(() => expect(estado.auth.logout).toHaveBeenCalled());
  });

  it("sin el consentimiento pendiente no se queda aquí; sin sesión, al ingreso", () => {
    estado.auth.user.consentimientoPendiente = false;
    const { unmount } = montar();
    expect(screen.getByText("Panel del cliente")).toBeInTheDocument();
    unmount();
    estado.auth.user = null;
    montar();
    expect(screen.getByText("Ingreso")).toBeInTheDocument();
  });

  it("la política pública lista sus secciones", () => {
    render(<MemoryRouter><PoliticaDatos /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Política de tratamiento de datos" })).toBeInTheDocument();
    for (const titulo of ["Responsable", "Qué datos usamos", "Para qué", "Quién los ve", "Tus derechos"]) {
      expect(screen.getByRole("heading", { name: titulo })).toBeInTheDocument();
    }
  });
});
