import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { DialogoProvider } from "../../../context/DialogoContext";

// 2.7 · Cuando cocina, barra o el salón agotan un producto o una opción (canal «catalogo»), la ronda en curso
// que lo tenga lo marca al momento, antes de enviarla (el backend la rechazaría igual al enviar, D3).
const estado = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));

import TomaComanda from "./TomaComanda";

const BASE = "/v1/staff/salon";
const TAMANO = (normalDisponible = true) => ({
  id: "g-tam", nombre: "Tamaño", obligatorio: true, min: 1, max: 1,
  opciones: [{ id: "o-normal", nombre: "Normal", precioExtra: 0, disponible: normalDisponible }, { id: "o-grande", nombre: "Grande", precioExtra: 3000, disponible: true }],
});
const CATALOGO = ({ latte = true, normal = true } = {}) => ({
  categorias: [{ id: "cat-beb", nombre: "Bebidas" }],
  productos: [
    { id: "p-latte", nombre: "Latte", precio: 9000, categoriaId: "cat-beb", disponible: latte, modificadores: [TAMANO(normal)] },
    { id: "p-agua", nombre: "Agua", precio: 4000, categoriaId: "cat-beb", disponible: true, modificadores: [] },
  ],
});
const item = (id, nombre, productoId, extra = {}) => ({
  id, productoId, nombre, precioBase: 9000, modificadores: [], cantidad: 1, nota: "", precioUnitario: 9000, subtotal: 9000,
  estado: "borrador", anulacion: null, iniciadoEn: null, listoEn: null, servidoEn: null, ...extra,
});
const CUENTA = {
  id: "c1", codigo: "C-000001", estado: "abierta", version: 2, comensales: 2, ultimaRonda: 0,
  mesero: { id: "u1", nombre: "Ana P." }, mesas: [{ id: "m1", numero: 1, nombre: "", zona: { id: "z1", nombre: "Interior" } }],
  subtotal: 0, pendiente: 13000, total: 0, impuestos: null, propina: null, descuento: null, historial: [],
  rondas: [{ id: "r1", numeroRonda: 1, estado: "borrador", enviadaEn: null, subtotal: 13000, items: [
    item("i1", "Latte", "p-latte", { modificadores: [{ grupoId: "g-tam", grupo: "Tamaño", opcionId: "o-normal", opcion: "Normal", precioExtra: 0 }] }),
    item("i2", "Agua", "p-agua", { precioBase: 4000, precioUnitario: 4000, subtotal: 4000 }),
  ] }],
};
const MESERO = ["mesa:ver", "cuenta:ver", "comanda:tomar", "comanda:enviar", "item:servir", "producto:agotar"];

class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

let catalogo;
beforeEach(() => {
  FakeEventSource.instancias = [];
  globalThis.EventSource = FakeEventSource;
  catalogo = CATALOGO();
  estado.apiRequest.mockReset().mockImplementation((ruta) => {
    if (ruta === `${BASE}/catalogo`) return Promise.resolve(catalogo);
    if (ruta === `${BASE}/cuentas/c1`) return Promise.resolve(CUENTA);
    return Promise.resolve({});
  });
});
afterEach(() => { delete globalThis.EventSource; });

const pintar = async () => {
  render(<DialogoProvider><TomaComanda cuentaId="c1" permisos={MESERO} onVolver={vi.fn()} /></DialogoProvider>);
  await screen.findByRole("heading", { name: /Mesa 1/ });
  await screen.findByRole("button", { name: /^Latte/ });
};
const ronda = () => screen.getByRole("region", { name: "Ronda en curso" });
const lineaDe = (nombre) => within(ronda()).getByText(nombre, { selector: "strong" }).closest("li");
const avisoCatalogo = async () => {
  const fuente = FakeEventSource.instancias.find((f) => new URL(f.url).searchParams.get("canales") === "catalogo");
  expect(fuente).toBeTruthy();
  await act(async () => { fuente.onmessage({ data: JSON.stringify({ canal: "catalogo", tipo: "disponibilidad", ids: {} }) }); });
};

describe("Ronda en curso con productos agotados (2.7)", () => {
  it("al agotarse un producto de la ronda (aviso en vivo) la línea lo dice antes de enviar", async () => {
    await pintar();
    expect(lineaDe("Latte")).not.toHaveTextContent("No disponible");
    catalogo = CATALOGO({ latte: false });
    await avisoCatalogo();
    expect(lineaDe("Latte")).toHaveTextContent("No disponible: agotado");
    expect(lineaDe("Agua")).not.toHaveTextContent("No disponible");
    expect(screen.getByRole("button", { name: /^Cuenta \(.*con problema/ })).toBeInTheDocument();
  });

  it("al agotarse una opción elegida, también", async () => {
    await pintar();
    catalogo = CATALOGO({ normal: false });
    await avisoCatalogo();
    expect(lineaDe("Latte")).toHaveTextContent("No disponible: una opción elegida se agotó");
  });

  it("al reactivarse, el aviso desaparece", async () => {
    catalogo = CATALOGO({ latte: false });
    await pintar();
    expect(lineaDe("Latte")).toHaveTextContent("No disponible: agotado");
    catalogo = CATALOGO();
    await avisoCatalogo();
    expect(lineaDe("Latte")).not.toHaveTextContent("No disponible");
  });
});
