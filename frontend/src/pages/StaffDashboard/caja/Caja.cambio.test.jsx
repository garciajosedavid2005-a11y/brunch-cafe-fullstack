import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// 3.7 · Caso real de la caja: cuenta de $ 20.000, efectivo y «Sin propina». «Monto a pagar» quedó en $ 0
// y con $ 90.000 recibidos mostró «Cambio: $ 90.000» (debía ser $ 70.000). El monto a pagar se prellena con
// el total pendiente (consumo + propina), sigue a la propina mientras no se edite a mano y el cambio se
// calcula sobre él.
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));

import Caja from "./Caja";

class FakeEventSource {
  static CLOSED = 2;
  addEventListener() {}
  close() {}
}

const CUENTA = { id: "c1", codigo: "C-000009", mesas: [4], mesero: "Ana P.", comensales: 2, subtotal: 20000, total: 20000, version: 2, pedidaEn: null };

beforeEach(() => {
  globalThis.EventSource = FakeEventSource;
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === "/v1/staff/caja/cuentas") return Promise.resolve({ cuentas: [CUENTA] });
    if (ruta === "/v1/staff/caja/comprobantes") return Promise.resolve({ comprobantes: [] });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

const abrirCobro = async () => {
  render(<Caja />);
  fireEvent.click(await screen.findByRole("button", { name: /^Cobrar Mesa 4/ }));
};
const monto = () => screen.getByLabelText("Monto a pagar");
const textoCambio = () => screen.getByText(/^Cambio:/).textContent.replace(/\s/g, " ");

describe("Caja · monto a pagar y cambio (3.7)", () => {
  it("caso real: $ 20.000, efectivo, «Sin propina» y $ 90.000 recibidos → cambio $ 70.000", async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole("button", { name: "Sin propina" }));
    expect(monto()).toHaveValue("20.000");
    fireEvent.change(screen.getByLabelText("Recibido"), { target: { value: "90.000" } });
    expect(textoCambio()).toBe("Cambio: $ 70.000");
  });

  it("si se borra «Monto a pagar» y se sale del campo, vuelve al total pendiente y el cambio sale bien", async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole("button", { name: "Sin propina" }));
    fireEvent.change(monto(), { target: { value: "" } });
    fireEvent.blur(monto());
    expect(monto()).toHaveValue("20.000");
    fireEvent.change(screen.getByLabelText("Recibido"), { target: { value: "90.000" } });
    expect(textoCambio()).toBe("Cambio: $ 70.000");
    // Y la propina lo vuelve a mover (sigue al total)
    fireEvent.change(screen.getByLabelText("Propina voluntaria"), { target: { value: "2.000" } });
    expect(monto()).toHaveValue("22.000");
  });

  it("la propina actualiza el monto mientras no se edite a mano; después ya no lo pisa", async () => {
    await abrirCobro();
    fireEvent.change(screen.getByLabelText("Propina voluntaria"), { target: { value: "2.000" } });
    expect(monto()).toHaveValue("22.000");
    fireEvent.change(monto(), { target: { value: "21.000" } });
    fireEvent.blur(monto());
    fireEvent.change(screen.getByLabelText("Propina voluntaria"), { target: { value: "3.000" } });
    expect(monto()).toHaveValue("21.000");
  });

  it("«Sin propina» muestra un 0 real en el campo (no un ejemplo gris que parezca vacío)", async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole("button", { name: "Sin propina" }));
    expect(screen.getByLabelText("Propina voluntaria")).toHaveValue("0");
  });
});
