import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";

// 6.4 (F6-g) · Carrito: con direcciones guardadas, propone la principal y elegir otra rellena dirección, barrio e
// indicaciones; «Otra dirección» los vacía para escribirla. Sin libreta, el formulario de siempre.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), direcciones: [] }));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", nombre: "Ana", apellido: "Pérez", email: "ana@example.com", telefono: "3001234567", esPersonal: false } }),
}));
vi.mock("../../context/CarritoContext", () => ({
  useCarrito: () => ({ calcularTotal: () => 9000, limpiarCarrito: vi.fn(), marcarProblemas: vi.fn(), productos: [{ id: 1, cantidad: 1 }] }),
}));

import { reiniciarHorarios } from "../../hooks/useHorarios";
import CarritoFormulario from "./CarritoFormulario";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};
const CASA = { id: "d1", etiqueta: "Casa", direccion: "Cra 36B #30-06", barrio: "Centro", indicaciones: "Torre 2", principal: true };
const OFICINA = { id: "d2", etiqueta: "", direccion: "Calle 10 #43A-30", barrio: "El Poblado", indicaciones: "", principal: false };

beforeEach(() => {
  reiniciarHorarios();
  estado.direcciones = [OFICINA, CASA];
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/horarios") return Promise.resolve({ horarios: HORARIOS });
    if (ruta === "/v1/cliente/direcciones") return Promise.resolve({ direcciones: estado.direcciones });
    return Promise.resolve([{ id: "m1", nombre: "Contra entrega", descripcion: "" }]);
  });
});

const montar = () => render(<MemoryRouter><DialogoProvider><CarritoFormulario /></DialogoProvider></MemoryRouter>);
const direccion = () => screen.getByPlaceholderText("Ej: Calle 8 # 12-34");

describe("6.4 · Carrito con direcciones guardadas", () => {
  it("propone la principal y rellena dirección, barrio e indicaciones", async () => {
    montar();
    const selector = await screen.findByLabelText("Dirección guardada");
    expect(selector).toHaveValue("d1");
    expect(direccion()).toHaveValue("Cra 36B #30-06");
    expect(screen.getByDisplayValue("Centro")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Torre 2")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Casa · Cra 36B #30-06 (principal)" })).toBeInTheDocument();
  });

  it("elegir otra la cambia; «Otra dirección» vacía los campos; escribir a mano deja «Otra»", async () => {
    montar();
    const selector = await screen.findByLabelText("Dirección guardada");
    fireEvent.change(selector, { target: { value: "d2" } });
    expect(direccion()).toHaveValue("Calle 10 #43A-30");
    expect(screen.getByDisplayValue("El Poblado")).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: "" } });
    expect(direccion()).toHaveValue("");
    fireEvent.change(selector, { target: { value: "d1" } });
    fireEvent.change(direccion(), { target: { value: "Calle 50 #10-10" } });
    expect(selector).toHaveValue("");
  });

  it("sin direcciones guardadas no hay selector", async () => {
    estado.direcciones = [];
    montar();
    expect(await screen.findByLabelText(/hora de entrega/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Dirección guardada")).not.toBeInTheDocument();
    expect(direccion()).toHaveValue("");
  });
});
