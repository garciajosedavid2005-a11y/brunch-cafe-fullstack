import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DialogoProvider } from "../../context/DialogoContext";

vi.mock("../../services/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", nombre: "Ana", apellido: "Pérez", email: "ana@example.com", telefono: "300 123 4567" } }),
}));
vi.mock("../../context/CarritoContext", () => ({
  useCarrito: () => ({ calcularTotal: () => 9000, limpiarCarrito: vi.fn(), marcarProblemas: vi.fn(), productos: [{ id: 1, cantidad: 1 }] }),
}));

import { apiRequest } from "../../services/api";
import { reiniciarHorarios } from "../../hooks/useHorarios";
import CarritoFormulario from "./CarritoFormulario";

const HORARIOS = {
  domicilio: { desde: "08:00", hasta: "16:00", anticipacionMinutos: 60 },
  reservas: { entreSemana: { desde: "08:00", hasta: "19:00" }, finDeSemana: { desde: "08:00", hasta: "17:00" } },
};

const montar = () => render(<MemoryRouter><DialogoProvider><CarritoFormulario /></DialogoProvider></MemoryRouter>);

describe("Checkout: hora de entrega y teléfono", () => {
  beforeEach(() => {
    reiniciarHorarios();
    apiRequest.mockReset();
    apiRequest.mockImplementation((ruta) => Promise.resolve(
      ruta === "/v1/horarios" ? { horarios: HORARIOS } : [{ id: "m1", nombre: "Contra entrega", descripcion: "" }],
    ));
  });
  afterEach(() => vi.useRealTimers());

  it("solo ofrece horas en punto de hoy con 1 h de anticipación (sin selector de minutos)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T07:30:00-05:00") });
    const { container } = montar();
    const selector = await screen.findByLabelText(/hora de entrega/i);
    expect(container.querySelector('input[type="time"]')).toBeNull();
    const opciones = await within(selector).findAllByRole("option", { name: /m\./ });
    expect(opciones.map((o) => o.value)).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("si ya no quedan horas hoy lo dice y no deja elegir", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T15:30:00-05:00") });
    montar();
    expect(await screen.findByText(/hoy ya no hay horarios de domicilio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora de entrega/i)).toBeDisabled();
  });

  it("el teléfono viene prellenado con el del perfil y se puede editar", async () => {
    montar();
    expect(await screen.findByLabelText(/teléfono de contacto/i)).toHaveValue("300 123 4567");
  });

  // 1.11 · «Cra 36b Oriente #30-06» es una dirección válida; una sin número se rechaza con el ejemplo
  it("acepta direcciones con abreviatura, letra y punto cardinal, y rechaza las que no tienen número", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T07:30:00-05:00") });
    montar();
    const direccion = screen.getByPlaceholderText("Ej: Calle 8 # 12-34");
    fireEvent.change(direccion, { target: { name: "direccion", value: "Barrio Centro" } });
    fireEvent.click(await screen.findByRole("button", { name: "FINALIZAR COMPRA" }));
    expect(await screen.findByText("Ingresa una dirección válida. Ejemplo: Cra 36B Oriente #30-06.")).toBeInTheDocument();
    fireEvent.change(direccion, { target: { name: "direccion", value: "Cra 36b Oriente #30-06" } });
    fireEvent.change(screen.getByPlaceholderText("Barrio o conjunto..."), { target: { name: "barrio", value: "Centro" } });
    await within(screen.getByLabelText(/hora de entrega/i)).findByRole("option", { name: /10:00/ });
    fireEvent.change(screen.getByLabelText(/hora de entrega/i), { target: { name: "hora", value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "FINALIZAR COMPRA" }));
    expect(await screen.findByRole("button", { name: "Confirmar Pedido" })).toBeInTheDocument();
    expect(screen.queryByText(/Ingresa una dirección válida/)).not.toBeInTheDocument();
  });

  it("envía una Idempotency-Key, la reutiliza al reintentar y usa otra en la compra siguiente", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-05T07:30:00-05:00") });
    let intentos = 0;
    apiRequest.mockImplementation((ruta) => {
      if (ruta === "/v1/horarios") return Promise.resolve({ horarios: HORARIOS });
      if (ruta === "/v1/cliente/metodos-pago") return Promise.resolve([{ id: "m1", nombre: "Contra entrega", descripcion: "" }]);
      intentos += 1;
      return intentos === 1
        ? Promise.reject(Object.assign(new Error("No se pudo conectar con el servidor."), {}))
        : Promise.resolve({ order: { orderNumber: "ABC123" } });
    });
    montar();
    const comprar = async () => {
      fireEvent.change(screen.getByPlaceholderText("Ej: Calle 8 # 12-34"), { target: { name: "direccion", value: "Carrera 36B #30-06" } });
      fireEvent.change(screen.getByPlaceholderText("Barrio o conjunto..."), { target: { name: "barrio", value: "Centro" } });
      await within(screen.getByLabelText(/hora de entrega/i)).findByRole("option", { name: /10:00/ });
      fireEvent.change(screen.getByLabelText(/hora de entrega/i), { target: { name: "hora", value: "10:00" } });
      fireEvent.click(await screen.findByRole("button", { name: "FINALIZAR COMPRA" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar Pedido" }));
    };
    const claves = () => apiRequest.mock.calls
      .filter(([ruta]) => ruta === "/v1/cliente/pedidos")
      .map(([, opciones]) => opciones.headers["Idempotency-Key"]);

    await comprar();
    await waitFor(() => expect(claves()).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar Pedido" })); // reintento
    await waitFor(() => expect(claves()).toHaveLength(2));
    expect(claves()[0]).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(claves()[1]).toBe(claves()[0]);

    fireEvent.click(await screen.findByRole("button", { name: /aceptar|entendido|cerrar/i }));
    await comprar();
    await waitFor(() => expect(claves()).toHaveLength(3));
    expect(claves()[2]).not.toBe(claves()[0]);
  });
});
