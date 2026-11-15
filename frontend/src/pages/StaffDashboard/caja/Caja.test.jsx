import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { estadoPagos, pesos, propinaSugerida, cuerpoCobro } from "./cobro";

// Fase 3 · Caja (F3-1 a F3-6): cuentas por cobrar, cobro con propina, efectivo y cambio, pago mixto y
// comprobante con sus leyendas; en vivo por el canal «caja».
const estado = vi.hoisted(() => ({ apiRequest: vi.fn(), usuario: { permisos: ["*"] } }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("../../../context/useAuth", () => ({ useAuth: () => ({ user: estado.usuario }) }));

import Caja from "./Caja";
import { DialogoProvider } from "../../../context/DialogoContext";

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

// 3b.1 · Turno abierto (sin turno, «Cobrar» queda deshabilitado)
const TURNO = { id: "t1", codigo: "T-000001", estado: "abierto", base: 100000, abiertoPor: "Carla C.", abiertoEn: "2026-11-14T12:00:00Z", cobros: 0,
  esperado: [{ metodo: "efectivo", esperado: 100000 }, { metodo: "tarjeta", esperado: 0 }, { metodo: "transferencia", esperado: 0 }], arqueo: [] };
let respuestas;
beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  estado.usuario = { permisos: ["*"] };
  respuestas = { turno: TURNO, cuentas: [CUENTA], hoy: [], cobro: () => Promise.resolve({ cuenta: { id: "c1", estado: "cerrada" }, comprobante: COMPROBANTE }) };
  estado.apiRequest.mockReset().mockImplementation((ruta, opciones = {}) => {
    if (ruta === "/v1/staff/caja/turno") return Promise.resolve({ turno: respuestas.turno });
    if (ruta === "/v1/staff/caja/domicilios") return Promise.resolve({ domicilios: respuestas.domicilios ?? [] });
    if (ruta === "/v1/staff/caja/domicilios/p1/cobrar" && opciones.method === "POST") return respuestas.cobro(opciones);
    if (ruta === "/v1/staff/caja/turno/abrir" && opciones.method === "POST") return Promise.resolve({ turno: TURNO });
    if (ruta === "/v1/staff/caja/turno/cerrar" && opciones.method === "POST") return respuestas.cierre(opciones);
    if (ruta === "/v1/staff/caja/cuentas") return Promise.resolve({ cuentas: respuestas.cuentas });
    if (ruta === "/v1/staff/caja/comprobantes") return Promise.resolve({ comprobantes: respuestas.hoy });
    if (ruta === "/v1/staff/caja/comprobantes/k1") return Promise.resolve({ ...COMPROBANTE, anulado: respuestas.anulado ?? null });
    if (ruta === "/v1/staff/caja/comprobantes/k1/anular" && opciones.method === "POST") return Promise.resolve({ nota: { codigo: "NC-000001", motivo: JSON.parse(opciones.body).motivo, emitidaEn: "2026-11-14T16:00:00Z", autor: "Admin P.", total: 33000, pagos: [] } });
    if (ruta === "/v1/staff/caja/cuentas/c1/cobrar" && opciones.method === "POST") return respuestas.cobro(opciones);
    if (ruta === "/v1/staff/caja/cuentas/c1/cobrar-parte" && opciones.method === "POST") return respuestas.cobro(opciones);
    if (ruta === "/v1/staff/caja/cuentas/c1") return Promise.resolve({ items: [
      { id: "i1", nombre: "Huevos pericos", cantidad: 1, opciones: [], subtotal: 15000, cobrado: false },
      { id: "i2", nombre: "Jugo de mora", cantidad: 1, opciones: ["Sin azúcar"], subtotal: 15000, cobrado: false },
    ] });
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});

// Nombre accesible exacto con cualquier espacio (el formato de moneda usa un espacio no separable)
const re = (texto) => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s")}$`);
const cuerpoEnviado = () => JSON.parse(estado.apiRequest.mock.calls.find(([r, o]) => r.endsWith("/cobrar") && o?.method === "POST")[1].body);
const abrirCobro = async () => {
  render(<DialogoProvider><Caja /></DialogoProvider>);
  const boton = await screen.findByRole("button", { name: re("Cobrar Mesa 3, $ 30.000") });
  await waitFor(() => expect(boton).toBeEnabled()); // con el turno ya cargado
  fireEvent.click(boton);
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
    render(<DialogoProvider><Caja /></DialogoProvider>);
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
    fireEvent.change(screen.getByLabelText("Monto a pagar"), { target: { value: "20000" } });
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
    render(<DialogoProvider><Caja /></DialogoProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Ver comprobante CI-000001" }));
    expect(await screen.findByRole("article", { name: "Comprobante CI-000001" })).toHaveTextContent("Huevos pericos");
  });
});

describe("Turno de caja (3b.1)", () => {
  it("sin turno: «La caja está cerrada», «Cobrar» deshabilitado y se abre con la base", async () => {
    respuestas.turno = null;
    render(<DialogoProvider><Caja /></DialogoProvider>);
    expect(await screen.findByText("La caja está cerrada")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: re("Cobrar Mesa 3, $ 30.000") })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Base en efectivo"), { target: { value: "150.000" } });
    respuestas.turno = TURNO;
    fireEvent.click(screen.getByRole("button", { name: "Abrir turno" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/caja/turno/abrir", expect.objectContaining({ method: "POST", body: JSON.stringify({ base: 150000 }) })));
    expect(await screen.findByText("Turno T-000001 abierto")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: re("Cobrar Mesa 3, $ 30.000") })).toBeEnabled());
  });

  it("sin caja:abrir no se ofrece abrir el turno", async () => {
    respuestas.turno = null;
    estado.usuario = { permisos: ["cuenta:cobrar"] };
    render(<DialogoProvider><Caja /></DialogoProvider>);
    expect(await screen.findByText(/alguien con permiso debe abrir el turno/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir turno" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerrar turno" })).not.toBeInTheDocument();
  });

  it("cerrar: muestra esperado, contado y diferencia en vivo y envía lo contado", async () => {
    respuestas.cierre = () => Promise.resolve({ turno: { ...TURNO, estado: "cerrado", arqueo: [
      { metodo: "efectivo", esperado: 100000, contado: 98000, diferencia: -2000 },
      { metodo: "tarjeta", esperado: 0, contado: 0, diferencia: 0 },
      { metodo: "transferencia", esperado: 0, contado: 0, diferencia: 0 },
    ] } });
    render(<DialogoProvider><Caja /></DialogoProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar turno" }));
    fireEvent.change(screen.getByLabelText("Contado en efectivo"), { target: { value: "98000" } });
    expect(screen.getByText(/^Faltan\s\$\s2\.000$/)).toBeInTheDocument(); // la fila de efectivo, en vivo
    fireEvent.click(screen.getByRole("button", { name: "Cerrar turno" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/caja/turno/cerrar",
      expect.objectContaining({ body: JSON.stringify({ contado: { efectivo: 98000, tarjeta: 0, transferencia: 0 } }) })));
    expect(await screen.findByRole("heading", { name: "Turno T-000001 cerrado" })).toBeInTheDocument();
  });
});

describe("División de la cuenta (3b.2)", () => {
  const enviado = (sufijo) => JSON.parse(estado.apiRequest.mock.calls.find(([r, o]) => r.endsWith(sufijo) && o?.method === "POST")[1].body);

  it("partes iguales: N parte de los comensales, «+» la cambia y cobra la parte 1 con su monto", async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole("radio", { name: "Partes iguales" }));
    expect(screen.getByText(/^Parte 1 de 2:/)).toHaveTextContent(/15\.000/);
    fireEvent.click(screen.getByRole("button", { name: "Una parte más" }));
    expect(screen.getByText(/^Parte 1 de 3:/)).toHaveTextContent(/10\.000/);
    fireEvent.click(screen.getByRole("button", { name: re("Cobrar $ 10.000") }));
    await waitFor(() => expect(enviado("/cobrar-parte")).toMatchObject({ division: { modo: "iguales", partes: 3 }, pagos: [{ metodo: "efectivo", monto: 10000 }] }));
  });

  it("por ítems: carga los ítems y cobra solo los elegidos", async () => {
    await abrirCobro();
    fireEvent.click(screen.getByRole("radio", { name: "Por ítems" }));
    expect(screen.getByRole("button", { name: re("Cobrar $ 0") })).toBeDisabled();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Jugo de mora/ }));
    fireEvent.click(screen.getByRole("button", { name: re("Cobrar $ 15.000") }));
    await waitFor(() => expect(enviado("/cobrar-parte")).toMatchObject({ division: { modo: "items", items: ["i2"] } }));
  });

  it("con una parte cobrada, el modo queda fijo y sigue la parte siguiente; la lista muestra lo que falta", async () => {
    respuestas.cuentas = [{ ...CUENTA, comensales: 3, division: { modo: "iguales", partes: 3, cobradas: 1, cobrado: 10000 }, porCobrar: 20000 }];
    render(<DialogoProvider><Caja /></DialogoProvider>);
    expect(await screen.findByText(/Parte 1 de 3 cobrada · faltan/)).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /^Cobrar Mesa 3/ });
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    expect(screen.getByRole("radio", { name: "Toda la cuenta" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Partes iguales" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/^Parte 2 de 3:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Una parte más" })).toBeDisabled();
  });
});

describe("Anular un comprobante (3b.3)", () => {
  const abrirComprobante = async () => {
    respuestas.hoy = [{ id: "k1", codigo: "CI-000001", mesas: [3], total: 33000, emitidoEn: COMPROBANTE.emitidoEn, cajero: "Carla C.", metodos: ["efectivo"], anulado: respuestas.anulado ?? null }];
    render(<DialogoProvider><Caja /></DialogoProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Ver comprobante CI-000001" }));
    await screen.findByRole("article", { name: "Comprobante CI-000001" });
  };

  it("con factura:anular pide el motivo y muestra el comprobante como ANULADO con su nota", async () => {
    await abrirComprobante();
    fireEvent.click(screen.getByRole("button", { name: "Anular comprobante" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Se cobró a la mesa equivocada" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Anular comprobante" }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/caja/comprobantes/k1/anular",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ motivo: "Se cobró a la mesa equivocada" }) })));
    expect(await screen.findByText(/con la nota crédito NC-000001/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular comprobante" })).not.toBeInTheDocument();
  });

  it("sin factura:anular no se ofrece anular; uno anulado se ve en la lista", async () => {
    estado.usuario = { permisos: ["cuenta:cobrar"] };
    respuestas.anulado = { codigo: "NC-000001", motivo: "Error", emitidaEn: "2026-11-14T16:00:00Z", autor: "Admin P." };
    await abrirComprobante();
    expect(screen.queryByRole("button", { name: "Anular comprobante" })).not.toBeInTheDocument();
    expect(screen.getByText(/con la nota crédito NC-000001/)).toBeInTheDocument();
  });
});

describe("Domicilios contra entrega (3b.4)", () => {
  const DOMICILIO = { id: "p1", codigo: "PED-ABC123", estado: "entregado", cliente: "Ana Pérez", direccion: "Cra 36B #30-06 · Centro", metodoPago: "Contra Entrega", total: 9000 };

  it("el cajero ve los domicilios por cobrar y cobra uno por su endpoint (sin versión ni división)", async () => {
    respuestas.domicilios = [DOMICILIO];
    render(<DialogoProvider><Caja /></DialogoProvider>);
    const boton = await screen.findByRole("button", { name: re("Cobrar domicilio PED-ABC123, $ 9.000") });
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    expect(screen.getByRole("heading", { name: "Cobrar · Domicilio PED-ABC123" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Cómo se cobra" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: re("Cobrar $ 9.000") }));
    await waitFor(() => expect(estado.apiRequest).toHaveBeenCalledWith("/v1/staff/caja/domicilios/p1/cobrar", expect.objectContaining({ method: "POST" })));
    const cuerpo = JSON.parse(estado.apiRequest.mock.calls.find(([r]) => r === "/v1/staff/caja/domicilios/p1/cobrar")[1].body);
    expect(cuerpo).toEqual({ propina: 0, pagos: [{ metodo: "efectivo", monto: 9000, recibido: 9000 }] });
  });

  it("el repartidor (solo pedido:cobrar) ve únicamente los domicilios, sin turno ni cuentas", async () => {
    estado.usuario = { permisos: ["pedido:ver", "pedido:cobrar"] };
    respuestas.domicilios = [DOMICILIO];
    render(<DialogoProvider><Caja /></DialogoProvider>);
    expect(await screen.findByRole("button", { name: re("Cobrar domicilio PED-ABC123, $ 9.000") })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Turno de caja" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Por cobrar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Cobradas hoy/ })).not.toBeInTheDocument();
    expect(estado.apiRequest.mock.calls.map(([r]) => r)).not.toContain("/v1/staff/caja/turno");
  });
});
