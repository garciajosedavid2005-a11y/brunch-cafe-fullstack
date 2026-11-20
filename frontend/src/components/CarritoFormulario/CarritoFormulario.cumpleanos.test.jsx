import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";

// 6.7 (F6-6, F6-d) · Carrito: si el cumpleaños está disponible, la casilla resta el 10 % del total (también en el resumen)
// y el pedido lleva usarCumpleanos; si no está disponible, no aparece.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), cumpleanos: null }));
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

beforeEach(() => {
  reiniciarHorarios();
  estado.cumpleanos = { estado: "disponible", porcentaje: 10 };
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/horarios") return Promise.resolve({ horarios: HORARIOS });
    if (ruta === "/v1/cliente/direcciones") return Promise.resolve({ direcciones: [] });
    if (ruta === "/v1/cliente/puntos") return Promise.resolve({ saldo: 0, cumpleanos: estado.cumpleanos, movimientos: [] });
    if (ruta === "/v1/cliente/pedidos") return Promise.resolve({ order: { orderNumber: "ABC123" } });
    return Promise.resolve([{ id: "m1", nombre: "Contra entrega", descripcion: "" }]);
  });
});
afterEach(() => vi.useRealTimers());

const montar = () => render(<MemoryRouter><DialogoProvider><CarritoFormulario /></DialogoProvider></MemoryRouter>);

describe("6.7 · Cumpleaños en el carrito", () => {
  it("la casilla resta el 10 % (también en el resumen) y el pedido lleva usarCumpleanos", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T07:30:00-05:00") });
    montar();
    const casilla = await screen.findByRole("checkbox", { name: /descuento de cumpleaños \(10 %/i });
    expect(screen.getByText(/TOTAL ESTIMADO/)).toHaveTextContent(/9\.000/);
    fireEvent.click(casilla);
    expect(screen.getByText(/Descuento de cumpleaños: −/)).toHaveTextContent(/900/);
    expect(screen.getByText(/TOTAL ESTIMADO/)).toHaveTextContent(/8\.100/);

    fireEvent.change(screen.getByPlaceholderText("Ej: Calle 8 # 12-34"), { target: { name: "direccion", value: "Carrera 36B #30-06" } });
    fireEvent.change(screen.getByPlaceholderText("Barrio o conjunto..."), { target: { name: "barrio", value: "Centro" } });
    await within(screen.getByLabelText(/hora de entrega/i)).findByRole("option", { name: /10:00/ });
    fireEvent.change(screen.getByLabelText(/hora de entrega/i), { target: { name: "hora", value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "FINALIZAR COMPRA" }));
    const dialogo = await screen.findByRole("button", { name: "Confirmar pedido" });
    expect(screen.getAllByText(/8\.100/).length).toBeGreaterThan(1); // el resumen también muestra el total con descuento
    fireEvent.click(dialogo);
    await waitFor(() => expect(estado.apiRequest.mock.calls.some(([r]) => r === "/v1/cliente/pedidos")).toBe(true));
    const [, opciones] = estado.apiRequest.mock.calls.find(([r]) => r === "/v1/cliente/pedidos");
    expect(JSON.parse(opciones.body)).toMatchObject({ usarCumpleanos: true });
  });

  it("si no está disponible (ya usado o fuera del mes), no aparece", async () => {
    estado.cumpleanos = { estado: "usado", porcentaje: 10 };
    montar();
    await screen.findByLabelText(/hora de entrega/i);
    await waitFor(() => expect(estado.apiRequest.mock.calls.some(([r]) => r === "/v1/cliente/puntos")).toBe(true));
    expect(screen.queryByRole("checkbox", { name: /cumpleaños/i })).not.toBeInTheDocument();
  });
});
