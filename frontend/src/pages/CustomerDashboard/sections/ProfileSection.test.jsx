import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// 6.4 (F6-8) · Mi perfil: fecha de nacimiento, alergias y preferencias (cargadas del perfil) y la versión aceptada de
// la política de datos.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), setUser: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../../context/useAuth", () => ({
  useAuth: () => ({ user: { nombre: "Ana", apellido: "Ruiz", email: "ana@example.com", telefono: "3001234567" }, setUser: estado.setUser }),
}));

import ProfileSection from "./ProfileSection";

const PERFIL = {
  nombre: "Ana", apellido: "Ruiz", correo: "ana@example.com", telefono: "3001234567",
  fechaNacimiento: "1990-11-05", alergias: "Maní", preferencias: "Sin lactosa",
  consentimiento: { version: "2026-11", aceptadoEn: "2026-11-20T15:00:00.000Z" },
};
beforeEach(() => {
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => Promise.resolve({
    perfil: opciones.method === "PATCH" ? { ...PERFIL, ...JSON.parse(opciones.body), correo: "ana@example.com" } : PERFIL,
  }));
});

describe("6.4 · Mi perfil", () => {
  it("carga fecha, alergias y preferencias y dice qué versión de la política aceptó", async () => {
    render(<ProfileSection />);
    expect(await screen.findByDisplayValue("Maní")).toBeInTheDocument();
    // Cierre · Ya registrada: en solo lectura, con el aviso para corregirla
    expect(screen.queryByLabelText("Fecha de nacimiento")).not.toBeInTheDocument();
    expect(screen.getByText("5 de noviembre de 1990")).toBeInTheDocument();
    expect(screen.getByText("Para corregirla, contacta al café")).toBeInTheDocument();
    expect(screen.getByLabelText("Preferencias")).toHaveValue("Sin lactosa");
    expect(screen.getByText(/Aceptaste la política de tratamiento de datos \(versión 2026-11\)/)).toBeInTheDocument();
    expect(screen.getByText(/las ve el equipo de cocina y de sala/)).toBeInTheDocument();
  });

  it("guarda los campos nuevos junto con los de contacto", async () => {
    render(<ProfileSection />);
    await screen.findByDisplayValue("Maní");
    fireEvent.change(screen.getByLabelText("Alergias"), { target: { value: "  Mariscos " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Tu perfil se actualizó correctamente.")).toBeInTheDocument();
    const [, opciones] = estado.apiRequest.mock.calls.find(([, o]) => o?.method === "PATCH");
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo).toMatchObject({ correo: "ana@example.com", alergias: "Mariscos", preferencias: "Sin lactosa" });
    expect(cuerpo).not.toHaveProperty("fechaNacimiento"); // fija: no se envía
  });

  it("cierre · sin fecha registrada se puede poner una vez; al guardar queda en solo lectura", async () => {
    estado.apiRequest.mockImplementation((ruta, opciones = {}) => Promise.resolve({
      perfil: opciones.method === "PATCH" ? { ...PERFIL, ...JSON.parse(opciones.body) } : { ...PERFIL, fechaNacimiento: "" },
    }));
    render(<ProfileSection />);
    await screen.findByDisplayValue("Maní");
    expect(screen.getByText(/después solo el café puede corregirla/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "1991-03-07" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Tu perfil se actualizó correctamente.")).toBeInTheDocument();
    const [, opciones] = estado.apiRequest.mock.calls.find(([, o]) => o?.method === "PATCH");
    expect(JSON.parse(opciones.body)).toMatchObject({ fechaNacimiento: "1991-03-07" });
    expect(screen.queryByLabelText("Fecha de nacimiento")).not.toBeInTheDocument();
    expect(screen.getByText("7 de marzo de 1991")).toBeInTheDocument();
  });
});
