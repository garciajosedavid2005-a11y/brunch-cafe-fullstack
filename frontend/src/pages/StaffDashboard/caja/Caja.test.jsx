import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { estadoPagos, pesos, propinaSugerida, cuerpoCobro } from "./cobro";

// Fase 3 · Caja (F3-1 a F3-6): cuentas por cobrar, cobro con propina, efectivo y cambio, pago mixto y
// comprobante con sus leyendas; en vivo por el canal «caja».
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));

import Caja from "./Caja";

class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

const CUENTA = { id: "c1", codigo: "C-000007", mesas: [3], mesero: "Ana P.", comensales: 2, subtotal: 30000, total: 30000, version: 5, pedidaEn: new Date(Date.now() - 12 * 60000).toISOString() };
const COMPROBANTE = {
  id: "k1", numero: 1, codigo: "CI-000001", cuentaId: "c1", mesas: [3], mesero: "Ana P.", cajero: "Carla C.", emitidoEn: "2026-11-14T15:00:00Z",
  lineas: [{ nombre: "Huevos pericos", cantidad: 2, opciones: ["Pan integral"], nota: "", precioUnitario: 15000, subtotal: 30000 }],
  subtotal: 30000, propina: 3000, total: 33000, pagos: [{ metodo: "efectivo", monto: 33000, recibido: 50000, cambio: 17000 }], cambio: 17000,
  leyendas: ["Precios con impuestos incluidos", "Documento no válido como factura electrónica"],
};

let respuestas;
beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  respuestas = { cuentas: [CUENTA], hoy: [], cobro: () => Promise.resolve({ cuenta: { id: "c1", estado: "cerrada" }, comprobante: COMPROBANTE }) };
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/caja/cuentas") return Promise.resolve({ cuentas: respuestas.cuentas });
    if (ruta === "/v1/staff/caja/comprobantes") return Promise.resolve({ comprobantes: respuestas.hoy });
    if (ruta === "/v1/staff/caja/comprobantes/k1") return Promise.resolve(COMPROBANTE);
    if (ruta === "/v1/staff/caja/cuentas/c1/cobrar" && opciones.method === "POST") return respuestas.cobro(opciones);
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

// Nombre accesible exacto con cualquier espacio (el formato de moneda usa un espacio no separable)
const re = (texto) => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")}$`);
const cuerpoEnviado = () => JSON.parse(estado.apiRequest.mock.calls.find(([r, o]) => r.endsWith("/cobrar") && o?.method === "POST")[1].body);
const abrirCobro = async () => {
  render(<Caja />);
  fireEvent.click(await screen.findByRole("button", { name: re("Cobrar Mesa 3, $ 30.000") }));
};

describe("Cálculos del cobro", () => {
  it("pesos del campo, propina del 10 % y estado de los pagos (cambio, falta y si se puede cobrar)", () => {
    expect(pesos("$ 33.000")).toBe(33000);
    expect(pesos("")).toBe(0);
    expect(propinaSugerida(30000)).toBe(3000);
    expect(estadoPagos([{ metodo: "efectivo", monto: 33000, recibido: 50000 }], 33000)).toMatchObject({ valido: true, cambio: 17000, restante: 0 });
    expect(estadoPagos([{ metodo: "efectivo", monto: 33000, recibido: 20000 }], 33000).valido).toBe(false);
    expect(estadoPagos([{ metodo: "tarjeta", monto: 20000 }], 33000)).toMatchObject({ valido: false, restante: 13000 });
    expect(cuerpoCobro({ versionEsperada: 1, propina: 0, pagos: [{ metodo: "tarjeta", monto: 5, recibido: 9 }] }).pagos).toEqual([{ metodo: "tarjeta", monto: 5 }]);
  });
});

describe("Caja", () => {
  it("lista las cuentas pedidas con mesa, mesero, espera y total, y escucha el canal «caja»", async () => {
    render(<Caja />);
    const lista = await screen.findByRole("list", { name: "Cuentas por cobrar" });
    expect(within(lista).getByText("Mesa 3")).toBeInTheDocument();
    expect(lista).toHaveTextContent("Ana P. · 2 personas");
    expect(lista).toHaveTextContent("Pidió la cuenta hace 12 min");
    expect(lista).toHaveTextContent("$ 30.000");
    expect(screen.getByText("Todavía no hay cobros hoy.")).toBeInTheDocument();
    await waitFor(() => expect(FakeEventSource.instancias.some((e) => e.url.includes("canales=caja"))).toBe(true));
  });

  it("efectivo con propina del 10 %: calcula el cambio, envía el cobro con Idempotency-Key y muestra el comprobante", async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole("button", { name: /^10 %/ }));
    expect(screen.getByText("Total a cobrar").closest("p")).toHaveTextContent("$ 33.000");
    fireEvent.change(screen.getByLabelText("Recibido"), { target: { value: "50.000" } });
    expect(screen.getByText("Cambio: $ 17.000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: re("Cobrar $ 33.000") }));

    const comprobante = await screen.findByRole("article", { name: "Comprobante CI-000001" });
    expect(cuerpoEnviado()).toEqual({ versionEsperada: 5, propina: 3000, pagos: [{ metodo: "efectivo", monto: 33000, recibido: 50000 }] });
    const opciones = estado.apiRequest.mock.calls.find(([r]) => r.endsWith("/cobrar"))[1];
    expect(opciones.headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(comprobante).toHaveTextContent("Precios con impuestos incluidos");
    expect(comprobante).toHaveTextContent("Documento no válido como factura electrónica");
    expect(comprobante).toHaveTextContent("Recibido $ 50.000 · Cambio $ 17.000");
    // 3.5 · La cuenta del comprobante se lee como una operación: Consumo + Propina = Total pagado
    const totales = within(comprobante).getByRole("group", { name: "Consumo + Propina = Total pagado" });
    expect(within(totales).getAllByRole("term").map((t) => t.textContent)).toEqual(["Consumo", "+ Propina voluntaria", "= Total pagado"]);
    expect(within(totales).getAllByRole("definition").map((d) => d.textContent.replace(/\s/g, " "))).toEqual(["$ 30.000", "$ 3.000", "$ 33.000"]);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeInTheDocument();
    // Al imprimir solo sale el comprobante (clase en <body> y tirilla de 80 mm mientras se ve)
    expect(document.body).toHaveClass("imprimiendo-comprobante");
    expect([...document.head.querySelectorAll("style")].some((s) => s.textContent.includes("80mm"))).toBe(true);
  });

  it("efectivo insuficiente o pagos que no suman: no deja cobrar y dice qué falta", async () => {
    await abrirCobro();
    fireEvent.change(screen.getByLabelText("Recibido"), { target: { value: "20.000" } });
    expect(screen.getByText("Falta $ 10.000 en efectivo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: re("Cobrar $ 30.000") })).toBeDisabled();
  });

  it("pago mixto: tarjeta y transferencia, sin propina", async () => {
    await abrirCobro();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Método del pago 1" })).getByRole("radio", { name: "Tarjeta" }));
    fireEvent.change(screen.getByLabelText("Monto (todo el total)"), { target: { value: "20000" } });
    // 3.5 · El estado del pago y «Cobrar» van juntos en la barra fija de abajo (siempre a la vista)
    const barra = screen.getByRole("region", { name: "Cobrar la cuenta" });
    expect(within(barra).getByRole("status")).toHaveTextContent("Falta asignar $ 10.000");
    expect(within(barra).getByRole("button", { name: re("Cobrar $ 30.000") })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Agregar otro método" }));
    const segundo = screen.getByRole("radiogroup", { name: "Método del pago 2" });
    fireEvent.click(within(segundo).getByRole("radio", { name: "Transferencia" }));
    fireEvent.click(screen.getByRole("button", { name: re("Cobrar $ 30.000") }));
    await screen.findByRole("article", { name: "Comprobante CI-000001" });
    expect(cuerpoEnviado()).toEqual({ versionEsperada: 5, propina: 0, pagos: [{ metodo: "tarjeta", monto: 20000 }, { metodo: "transferencia", monto: 10000 }] });
  });

  it("la pantalla de cobro reserva abajo el alto real de la barra fija", async () => {
    const anterior = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { el.getBoundingClientRect = () => ({ height: 131.2 }); this.cb([{ target: el }]); }
      disconnect() {}
    };
    try {
      await abrirCobro();
      const seccion = screen.getByRole("region", { name: "Cobrar la cuenta" }).closest("section");
      await waitFor(() => expect(seccion.style.getPropertyValue("--alto-barra")).toBe("132px"));
    } finally {
      globalThis.ResizeObserver = anterior;
    }
  });

  it("si la cuenta cambió (409) lo dice y no muestra comprobante", async () => {
    respuestas.cobro = () => Promise.reject(Object.assign(new Error("La cuenta ya está cerrada y no admite cambios."), { status: 409 }));
    await abrirCobro();
    fireEvent.click(screen.getByRole("button", { name: re("Cobrar $ 30.000") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La cuenta ya está cerrada");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("«Cobradas hoy» abre el comprobante de un cobro anterior", async () => {
    respuestas.hoy = [{ id: "k1", codigo: "CI-000001", mesas: [3], total: 33000, emitidoEn: "2026-11-14T15:00:00Z", cajero: "Carla C.", metodos: ["efectivo"] }];
    render(<Caja />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver comprobante CI-000001" }));
    expect(await screen.findByRole("article", { name: "Comprobante CI-000001" })).toHaveTextContent("Huevos pericos");
  });
});
