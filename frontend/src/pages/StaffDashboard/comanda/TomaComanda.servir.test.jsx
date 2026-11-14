import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));

import TomaComanda from "./TomaComanda";

// 2.6 · «Listo para servir» en la cuenta, «Servir» (item:servir, F2-2) y el «Deshacer» del admin pasados
// los 10 s, con motivo obligatorio (F2-7).
const BASE = "/v1/staff/salon";
const item = (id, nombre, extra = {}) => ({
  id, productoId: `p-${id}`, nombre, precioBase: 9000, modificadores: [], cantidad: 1, nota: "",
  precioUnitario: 9000, subtotal: 9000, estado: "enviado", anulacion: null,
  iniciadoEn: null, listoEn: null, servidoEn: null, ...extra,
});
const LISTO = { estado: "listo", iniciadoEn: "2026-11-11T17:02:00Z", listoEn: "2026-11-11T17:05:00Z" };
const CUENTA = (extra = {}) => ({
  id: "c1", codigo: "C-000001", estado: "abierta", version: 4, comensales: 2, ultimaRonda: 1,
  mesero: { id: "u1", nombre: "Ana P." }, mesas: [{ id: "m1", numero: 1, nombre: "", zona: { id: "z1", nombre: "Interior" } }],
  subtotal: 27000, pendiente: 0, total: 27000, impuestos: null, propina: null, descuento: null,
  rondas: [{
    id: "r1", numeroRonda: 1, estado: "enviada", enviadaEn: "2026-11-11T17:00:00Z", subtotal: 27000,
    items: [
      item("i1", "Latte", LISTO),
      item("i2", "Agua", { ...LISTO, cantidad: 2, subtotal: 18000 }),
      item("i3", "Tostada", { estado: "servido", ...{ iniciadoEn: LISTO.iniciadoEn, listoEn: LISTO.listoEn, servidoEn: "2026-11-11T17:06:00Z" } }),
      item("i4", "Arepa"),
    ],
  }],
  historial: [],
  ...extra,
});

const MESERO = ["mesa:ver", "cuenta:ver", "cuenta:solicitar", "item:servir"];
const SIN_SERVIR = ["mesa:ver", "cuenta:ver"];
const ADMIN = ["*"];

let respuestas;
beforeEach(() => {
  respuestas = { cuenta: CUENTA(), post: () => Promise.resolve({}) };
  estado.apiRequest.mockReset();
  estado.apiRequest.mockImplementation((ruta, opciones = {}) => {
    if (ruta === `${BASE}/catalogo`) return Promise.resolve({ categorias: [], productos: [] });
    if (ruta === `${BASE}/cuentas/c1` && !opciones.method) return Promise.resolve(respuestas.cuenta);
    return respuestas.post(ruta, opciones);
  });
});

const pintar = async (permisos = MESERO) => {
  render(<DialogoProvider><TomaComanda cuentaId="c1" permisos={permisos} onVolver={vi.fn()} /></DialogoProvider>);
  await screen.findByRole("heading", { name: /Mesa 1/ });
};
const llamadasEstado = (itemId) => estado.apiRequest.mock.calls.filter(([r, o = {}]) => r === `/v1/staff/items/${itemId}/estado` && o.method === "POST");
const lecturasCuenta = () => estado.apiRequest.mock.calls.filter(([r, o = {}]) => r === `${BASE}/cuentas/c1` && !o.method).length;
const error = (status, code, message) => Object.assign(new Error(message), { status, code });

describe("«Listo para servir» en la cuenta (2.6)", () => {
  it("la cabecera dice cuántos ítems esperan y cada uno lo dice con texto (no solo color)", async () => {
    await pintar();
    expect(screen.getByText("Listo para servir (2)")).toBeInTheDocument();
    const enviadas = screen.getByRole("region", { name: "Rondas enviadas" });
    expect(within(enviadas).getByText("Latte").closest("li")).toHaveTextContent("Listo para servir");
    expect(within(enviadas).getByText("Tostada").closest("li")).toHaveTextContent("Servido");
    expect(within(enviadas).getByText("Arepa").closest("li")).toHaveTextContent("Enviado");
  });

  it("sin ítems listos no hay aviso en la cabecera", async () => {
    respuestas.cuenta = CUENTA({ rondas: [{ ...CUENTA().rondas[0], items: [item("i4", "Arepa")] }] });
    await pintar();
    expect(screen.queryByText(/Listo para servir \(/)).not.toBeInTheDocument();
  });
});

describe("«Servir» (item:servir)", () => {
  it("marca el ítem como servido con el estado que vio, una clave de idempotencia y recarga la cuenta", async () => {
    await pintar();
    const antes = lecturasCuenta();
    expect(screen.getAllByRole("button", { name: /^Servir/ })).toHaveLength(2); // solo los listos
    fireEvent.click(screen.getByRole("button", { name: "Servir 2 × Agua" }));
    await waitFor(() => expect(llamadasEstado("i2")).toHaveLength(1));
    const [, opciones] = llamadasEstado("i2")[0];
    expect(JSON.parse(opciones.body)).toEqual({ a: "servido", de: "listo" });
    expect(opciones.headers["Idempotency-Key"]).toBeTruthy();
    await waitFor(() => expect(lecturasCuenta()).toBeGreaterThan(antes));
  });

  it("si otro ya lo cambió (409) lo avisa y muestra lo vigente", async () => {
    respuestas.post = () => Promise.reject(error(409, "ITEM_MODIFICADO", "Otra persona ya cambió este ítem: recarga la pantalla."));
    await pintar();
    fireEvent.click(screen.getByRole("button", { name: "Servir 1 × Latte" }));
    const aviso = await screen.findByRole("alertdialog", { name: "No se pudo servir" });
    expect(aviso).toHaveTextContent("Otra persona ya cambió este ítem");
  });

  it("sin item:servir, o con la cuenta cerrada, no se ofrece", async () => {
    await pintar(SIN_SERVIR);
    expect(screen.queryByRole("button", { name: /^Servir/ })).not.toBeInTheDocument();
  });

  it("con la cuenta cerrada no se ofrece aunque tenga el permiso", async () => {
    respuestas.cuenta = CUENTA({ estado: "cerrada" });
    await pintar();
    expect(screen.queryByRole("button", { name: /^Servir/ })).not.toBeInTheDocument();
  });
});

describe("«Deshacer listo» del admin (F2-7)", () => {
  it("«Anular» (acción destructiva) va al final del mismo grupo, tras «Servir» y «Deshacer» (revisor-visual)", async () => {
    await pintar(ADMIN);
    const servir = screen.getByRole("button", { name: "Servir 1 × Latte" });
    const grupo = servir.closest(".comanda-item__acciones-listo");
    const botones = within(grupo).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(botones).toEqual(["Servir 1 × Latte", "Deshacer «listo» de 1 × Latte", "Anular Latte"]);
  });

  it("el mesero no lo ve; el admin lo hace con motivo obligatorio", async () => {
    await pintar();
    expect(screen.queryByRole("button", { name: /^Deshacer/ })).not.toBeInTheDocument();
  });

  it("el admin pide el motivo y lo envía con el estado que vio", async () => {
    await pintar(ADMIN);
    fireEvent.click(screen.getByRole("button", { name: "Deshacer «listo» de 1 × Latte" }));
    const dialogo = await screen.findByRole("dialog", { name: "Deshacer «listo»" });
    const confirmar = within(dialogo).getByRole("button", { name: "Volver a preparación" });
    fireEvent.click(confirmar);
    expect(llamadasEstado("i1")).toHaveLength(0); // sin motivo no se envía
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "Faltaba la salsa" } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(llamadasEstado("i1")).toHaveLength(1));
    expect(JSON.parse(llamadasEstado("i1")[0][1].body)).toEqual({ a: "en_preparacion", de: "listo", motivo: "Faltaba la salsa" });
  });
});

// 2.6b · Los dos casos de Brayan, como pasan en la tablet: el mesero (permisos reales, sin anular) abre una
// cuenta con ítems enviados y, con ella abierta, la cocina marca uno «Listo» (llega por «cuenta:<id>» y la
// cuenta se relee). Con la versión que servía su Vite (`conAccionesListo` usada sin declarar) los dos
// lanzaban ReferenceError y /staff quedaba en blanco.
describe("Casos de Brayan (2.6b)", () => {
  const MESERO_REAL = [
    "mesa:ver", "mesa:operar", "mesa:bloquear", "mesa:unir", "cuenta:abrir", "cuenta:ver", "cuenta:transferir",
    "comanda:tomar", "comanda:enviar", "cuenta:solicitar", "item:servir", "producto:agotar",
  ];
  class FakeEventSource {
    static instancias = [];
    static CLOSED = 2;
    constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
    addEventListener() {}
    close() {}
  }
  beforeEach(() => { FakeEventSource.instancias = []; globalThis.EventSource = FakeEventSource; });
  afterEach(() => { delete globalThis.EventSource; });

  it("1 · abrir la cuenta para agregar un producto, con rondas enviadas, la dibuja entera", async () => {
    respuestas.cuenta = CUENTA({ rondas: [{ ...CUENTA().rondas[0], items: [item("i4", "Arepa"), item("i5", "Jugo", { estado: "en_preparacion", iniciadoEn: LISTO.iniciadoEn })] }] });
    await pintar(MESERO_REAL);
    expect(screen.getByRole("region", { name: "Rondas enviadas" })).toHaveTextContent("Arepa");
    expect(screen.getByRole("region", { name: "Menú" })).toBeInTheDocument();
  });

  it("2 · con la cuenta abierta, la cocina marca «Listo»: aparece «Servir» sin romper la pantalla", async () => {
    respuestas.cuenta = CUENTA({ rondas: [{ ...CUENTA().rondas[0], items: [item("i4", "Arepa")] }] });
    await pintar(MESERO_REAL);
    const fuente = FakeEventSource.instancias.find((f) => f.url.includes("cuenta%3Ac1") || f.url.includes("cuenta:c1"));
    expect(fuente).toBeTruthy();
    respuestas.cuenta = CUENTA({ rondas: [{ ...CUENTA().rondas[0], items: [item("i4", "Arepa", LISTO)] }] });
    await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "cuenta:c1", tipo: "item_estado", ids: { cuentaId: "c1", itemId: "i4" } }) }); });
    expect(await screen.findByRole("button", { name: "Servir 1 × Arepa" })).toBeInTheDocument();
    expect(screen.getByText("Listo para servir (1)")).toBeInTheDocument();
  });
});
