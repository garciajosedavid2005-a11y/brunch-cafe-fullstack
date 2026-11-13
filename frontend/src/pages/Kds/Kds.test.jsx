import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 2.5 · Pantalla KDS (/kds): tarjetas por ronda y estación de la más antigua a la más nueva, filtro de
// estación, temporizador con los umbrales de la estación (F2-4) en texto e icono, botones grandes por
// ítem («Empezar», «Listo»), «Todo listo» por ronda (F2-1), «Deshacer» de listo durante 10 s para quien
// lo marcó (F2-7), anulados tachados con su motivo y aviso, domicilio por estación (F2-3) y sonido al
// llegar una ronda (F2-8).
const estado = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  sonar: vi.fn(),
  activarSonido: vi.fn(),
  alternarSonido: vi.fn(),
  sonido: { disponible: true, activado: true, bloqueado: false },
  logout: vi.fn(),
}));
vi.mock("../../services/api", () => ({ apiRequest: estado.apiRequest, API_URL: "http://api.test" }));
vi.mock("./useSonidoKds", () => ({
  useSonidoKds: () => ({ ...estado.sonido, sonar: estado.sonar, activar: estado.activarSonido, alternar: estado.alternarSonido }),
}));
const USUARIO = { id: "u-coc", nombre: "Carla", roleLabel: "Cocina", esPersonal: true, permisos: ["kds:ver", "item:preparar", "pedido:preparar"] };
vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: USUARIO, logout: estado.logout }) }));

import Kds from "./Kds";
import { CLAVE_ESTACION } from "./kdsUtils";

const ESTACIONES = [
  { codigo: "barra", nombre: "Barra", umbralAvisoMin: 5, umbralAlertaMin: 10 },
  { codigo: "cocina", nombre: "Cocina", umbralAvisoMin: 12, umbralAlertaMin: 20 },
];
const haceMin = (min) => new Date(Date.now() - min * 60_000).toISOString();
const item = (extra = {}) => ({
  id: "i1", nombre: "Huevos rancheros", cantidad: 2, nota: "", modificadores: [], estado: "enviado",
  iniciadoEn: null, listoEn: null, listoPor: null, anulacion: null, ...extra,
});
const ronda = (extra = {}) => ({
  tipo: "salon", comandaId: "r1", cuentaId: "c1", numeroRonda: 2, mesas: [3], mesero: "Ana P.", enviadaEn: haceMin(2),
  items: [item()], ...extra,
});
const pedido = (extra = {}) => ({
  tipo: "domicilio", pedidoId: "p1", codigo: "PED-ABC123", estado: "confirmado", horaEntrega: "11:30", entregaEn: null,
  desde: haceMin(3), estacionesListas: [], lineas: [{ id: "l1", nombre: "Tostada francesa", cantidad: 1, nota: "Sin azúcar", modificadores: [] }],
  ...extra,
});
const cola = (codigo, extra = {}) => ({
  estacion: ESTACIONES.find((e) => e.codigo === codigo), actualizadoEn: new Date().toISOString(), truncado: false,
  salon: [], domicilio: [], ...extra,
});

let respuestas;
const colaDe = (codigo) => respuestas[codigo]?.() ?? Promise.resolve(cola(codigo));
beforeEach(() => {
  try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  respuestas = {};
  estado.sonido = { disponible: true, activado: true, bloqueado: false };
  for (const f of [estado.apiRequest, estado.sonar, estado.activarSonido, estado.alternarSonido, estado.logout]) f.mockReset();
  estado.apiRequest.mockImplementation((ruta, opciones) => {
    if (ruta === "/v1/staff/cocina/estaciones") return Promise.resolve(ESTACIONES);
    const m = ruta.match(/^\/v1\/staff\/cocina\/cola\?estacion=(\w+)$/);
    if (m) return colaDe(m[1]);
    if (opciones?.method === "POST") return Promise.resolve({});
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });
});
afterEach(() => vi.useRealTimers());

const pintar = () => render(<MemoryRouter><Kds /></MemoryRouter>);
const tarjeta = (titulo) => screen.getByRole("heading", { name: titulo }).closest("article");
const posts = () => estado.apiRequest.mock.calls.filter(([, o]) => o?.method === "POST");
const llamadasCola = (codigo) => estado.apiRequest.mock.calls.filter(([r]) => r === `/v1/staff/cocina/cola?estacion=${codigo}`).length;

describe("KDS: estación y tarjetas", () => {
  it("muestra la primera estación (por nombre), sus rondas con mesa, ronda, mesero, ítems, opciones y nota, y el domicilio", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", {
      salon: [ronda({ items: [item({ modificadores: [{ grupo: "Tamaño", opcion: "Grande" }], nota: "Sin cebolla" })] })],
      domicilio: [pedido()],
    }));
    pintar();
    const t = await screen.findByRole("heading", { name: /Mesa 3/ });
    const r = t.closest("article");
    expect(r).toHaveTextContent("Ronda 2");
    expect(r).toHaveTextContent("Ana P.");
    expect(r).toHaveTextContent("2 × Huevos rancheros");
    expect(r).toHaveTextContent("Tamaño: Grande");
    expect(r).toHaveTextContent("Nota: Sin cebolla");
    expect(within(r).getByText("Nuevo")).toBeInTheDocument(); // el estado en texto, no solo color
    const d = tarjeta(/Domicilio PED-ABC123/);
    expect(d).toHaveTextContent("Entrega 11:30");
    expect(d).toHaveTextContent("1 × Tostada francesa");
    expect(d).toHaveTextContent("Nota: Sin azúcar");
    expect(screen.getByRole("button", { name: "Barra" })).toHaveAttribute("aria-pressed", "true");
    // La estación activa se dice en texto, aparte del usuario (revisor-visual)
    expect(screen.getByText("Estación:", { exact: false }).closest("p")).toHaveTextContent("Estación: Barra");
    expect(within(d).getByText("Nuevo")).toHaveClass("kds-estado"); // el estado del pedido, en píldora
  });

  it("cambiar de estación lee su cola, la recuerda en este dispositivo y avisa cuando no hay nada", async () => {
    pintar();
    await screen.findByText(/No hay nada pendiente en Barra/);
    fireEvent.click(screen.getByRole("button", { name: "Cocina" }));
    await screen.findByText(/No hay nada pendiente en Cocina/);
    expect(llamadasCola("cocina")).toBeGreaterThan(0);
    expect(localStorage.getItem(CLAVE_ESTACION)).toBe("cocina");
  });

  it("abre en la estación guardada en el dispositivo", async () => {
    localStorage.setItem(CLAVE_ESTACION, "cocina");
    pintar();
    await screen.findByText(/No hay nada pendiente en Cocina/);
    expect(llamadasCola("barra")).toBe(0);
  });

  it("temporizador con los umbrales de la estación, en texto e icono: a tiempo, atención y retrasada", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", {
      salon: [
        // A mitad de minuto: el desfase de milisegundos con el reloj del servidor no cambia el minuto
        ronda({ comandaId: "a", mesas: [1], enviadaEn: haceMin(2.5) }),
        ronda({ comandaId: "b", mesas: [2], enviadaEn: haceMin(6.5) }),
        ronda({ comandaId: "c", mesas: [4], enviadaEn: haceMin(12.5) }),
      ],
    }));
    pintar();
    await screen.findByRole("heading", { name: /Mesa 1/ });
    expect(tarjeta(/Mesa 1/)).toHaveTextContent(/2 min.*A tiempo/);
    expect(tarjeta(/Mesa 2/)).toHaveTextContent(/6 min.*Atención/);
    expect(tarjeta(/Mesa 4/)).toHaveTextContent(/12 min.*Retrasada/);
    expect(tarjeta(/Mesa 4/)).toHaveClass("kds-tarjeta--alerta");
  });

  it("un ítem anulado se ve tachado, con su motivo y un aviso en la tarjeta, sin botones", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", {
      salon: [ronda({ items: [item(), item({ id: "i2", nombre: "Jugo de naranja", cantidad: 1, estado: "anulado", anulacion: { motivo: "error_toma", detalle: "" } })] })],
    }));
    pintar();
    const r = (await screen.findByRole("heading", { name: /Mesa 3/ })).closest("article");
    expect(within(r).getByRole("alert")).toHaveTextContent("Se anuló 1 ítem: no lo prepares");
    const anulado = within(r).getByText("1 × Jugo de naranja").closest("li");
    expect(anulado).toHaveClass("kds-item--anulado");
    expect(anulado).toHaveTextContent("Anulado: Error de toma"); // el texto del motivo, no su clave
    expect(within(anulado).queryByRole("button")).not.toBeInTheDocument();
  });

  it("si la cola viene recortada, lo dice", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", { truncado: true, salon: [ronda()] }));
    pintar();
    expect(await screen.findByText(/Hay más rondas de las que caben/)).toBeInTheDocument();
  });
});

describe("KDS: acciones", () => {
  it("«Empezar» y «Listo» por ítem envían el estado visto y una Idempotency-Key, y recargan la cola", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", {
      salon: [ronda({ items: [item(), item({ id: "i2", nombre: "Arepa", estado: "en_preparacion", iniciadoEn: haceMin(1) })] })],
    }));
    pintar();
    await screen.findByRole("heading", { name: /Mesa 3/ });
    const antes = llamadasCola("barra");
    fireEvent.click(screen.getByRole("button", { name: "Empezar: 2 × Huevos rancheros" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const [ruta, opciones] = posts()[0];
    expect(ruta).toBe("/v1/staff/items/i1/estado");
    expect(JSON.parse(opciones.body)).toEqual({ a: "en_preparacion", de: "enviado" });
    expect(opciones.headers["Idempotency-Key"]).toBeTruthy();
    await waitFor(() => expect(llamadasCola("barra")).toBeGreaterThan(antes));
    fireEvent.click(screen.getByRole("button", { name: "Listo: 2 × Arepa" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(JSON.parse(posts()[1][1].body)).toEqual({ a: "listo", de: "en_preparacion" });
  });

  it("«Todo listo» marca la ronda en esta estación", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", { salon: [ronda()] }));
    pintar();
    await screen.findByRole("heading", { name: /Mesa 3/ });
    fireEvent.click(screen.getByRole("button", { name: "Todo listo: Mesa 3, ronda 2" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][0]).toBe("/v1/staff/cocina/rondas/r1/todo-listo");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ estacion: "barra" });
  });

  it("«Deshacer» solo para quien lo marcó y durante 10 s; un listo ajeno no lo ofrece", async () => {
    const hace = (s) => new Date(Date.now() - s * 1000).toISOString();
    respuestas.barra = () => Promise.resolve(cola("barra", {
      salon: [ronda({ items: [
        item({ estado: "listo", iniciadoEn: hace(60), listoEn: hace(3), listoPor: "u-coc" }),
        item({ id: "i2", nombre: "Arepa", estado: "listo", iniciadoEn: hace(60), listoEn: hace(3), listoPor: "otro" }),
      ] })],
    }));
    pintar();
    await screen.findByRole("heading", { name: /Mesa 3/ });
    const deshacer = screen.getByRole("button", { name: /Deshacer: 2 × Huevos rancheros/ });
    expect(screen.queryByRole("button", { name: /Deshacer: 2 × Arepa/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Listo").length).toBeGreaterThan(0);
    fireEvent.click(deshacer);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body)).toEqual({ a: "en_preparacion", de: "listo" });
  });

  it("el «Deshacer» desaparece a los 10 s (con el último segundo de margen por el reloj de la pantalla)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listoEn = new Date().toISOString(); // fijo: el polling de respaldo vuelve a pedir la cola
    respuestas.barra = () => Promise.resolve(cola("barra", {
      salon: [ronda({ items: [item({ estado: "listo", listoEn, listoPor: "u-coc", iniciadoEn: haceMin(1) })] })],
    }));
    pintar();
    await screen.findByRole("button", { name: /Deshacer/ });
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByRole("button", { name: /Deshacer/ })).not.toBeInTheDocument();
  });

  it("si otro ya lo cambió (409), lo dice y recarga", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", { salon: [ronda()] }));
    estado.apiRequest.mockImplementation((ruta, opciones) => {
      if (ruta === "/v1/staff/cocina/estaciones") return Promise.resolve(ESTACIONES);
      if (opciones?.method === "POST") {
        const e = new Error("Otra persona ya cambió este ítem: recarga la pantalla.");
        e.status = 409;
        return Promise.reject(e);
      }
      return colaDe("barra");
    });
    pintar();
    await screen.findByRole("heading", { name: /Mesa 3/ });
    const antes = llamadasCola("barra");
    fireEvent.click(screen.getByRole("button", { name: "Empezar: 2 × Huevos rancheros" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Otra persona ya cambió este ítem");
    await waitFor(() => expect(llamadasCola("barra")).toBeGreaterThan(antes));
  });

  it("domicilio: «Empezar» (confirmado) y «Listo» marcan la parte de esta estación", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", { domicilio: [pedido()] }));
    pintar();
    await screen.findByRole("heading", { name: /Domicilio PED-ABC123/ });
    fireEvent.click(screen.getByRole("button", { name: "Empezar: domicilio PED-ABC123" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][0]).toBe("/v1/staff/cocina/pedidos/p1/estacion");
    expect(JSON.parse(posts()[0][1].body)).toEqual({ estacion: "barra", a: "en_preparacion" });
    fireEvent.click(screen.getByRole("button", { name: "Listo: domicilio PED-ABC123" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(JSON.parse(posts()[1][1].body)).toEqual({ estacion: "barra", a: "listo" });
  });

  it("los botones de acción son grandes (clase de 56 px)", async () => {
    respuestas.barra = () => Promise.resolve(cola("barra", { salon: [ronda()] }));
    pintar();
    await screen.findByRole("heading", { name: /Mesa 3/ });
    for (const b of screen.getAllByRole("button", { name: /^(Empezar|Todo listo)/ })) expect(b).toHaveClass("kds-boton");
  });
});

describe("KDS: sonido (F2-8)", () => {
  it("suena al llegar una ronda nueva, no en la primera carga ni al cambiar de estación", async () => {
    let salon = [ronda()];
    respuestas.barra = () => Promise.resolve(cola("barra", { salon }));
    pintar();
    await screen.findByRole("heading", { name: /Mesa 3/ });
    expect(estado.sonar).not.toHaveBeenCalled();
    salon = [ronda(), ronda({ comandaId: "r2", mesas: [5], numeroRonda: 1 })];
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await screen.findByRole("heading", { name: /Mesa 5/ });
    expect(estado.sonar).toHaveBeenCalledTimes(1);
    respuestas.cocina = () => Promise.resolve(cola("cocina", { salon: [ronda({ comandaId: "r9", mesas: [8] })] }));
    fireEvent.click(screen.getByRole("button", { name: "Cocina" }));
    await screen.findByRole("heading", { name: /Mesa 8/ });
    expect(estado.sonar).toHaveBeenCalledTimes(1);
  });

  it("con el navegador bloqueando el audio, ofrece «Activar sonido»; el interruptor dice si está activado", async () => {
    estado.sonido = { disponible: true, activado: true, bloqueado: true };
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Activar sonido" }));
    expect(estado.activarSonido).toHaveBeenCalled();
    const interruptor = screen.getByRole("button", { name: "Sonido" });
    expect(interruptor).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(interruptor);
    expect(estado.alternarSonido).toHaveBeenCalled();
  });
});

describe("KDS: estaciones del rol (2.5b)", () => {
  const conEstaciones = (lista) => estado.apiRequest.mockImplementation((ruta) => {
    if (ruta === "/v1/staff/cocina/estaciones") return Promise.resolve(lista);
    const m = ruta.match(/^\/v1\/staff\/cocina\/cola\?estacion=(\w+)$/);
    if (m) return colaDe(m[1]);
    return Promise.reject(new Error(`Ruta inesperada ${ruta}`));
  });

  it("con una sola estación entra directo a ella, sin los botones de cambio", async () => {
    conEstaciones([ESTACIONES[1]]);
    pintar();
    await screen.findByText(/No hay nada pendiente en Cocina/);
    expect(screen.queryByRole("group", { name: "Estación" })).not.toBeInTheDocument();
    expect(screen.getByText("Estación:", { exact: false }).closest("p")).toHaveTextContent("Estación: Cocina");
  });

  it("una estación guardada en el dispositivo que ya no es del rol se ignora", async () => {
    localStorage.setItem(CLAVE_ESTACION, "barra");
    conEstaciones([ESTACIONES[1]]);
    pintar();
    await screen.findByText(/No hay nada pendiente en Cocina/);
    expect(llamadasCola("barra")).toBe(0);
  });

  it("sin estaciones asignadas lo dice y no pide ninguna cola", async () => {
    conEstaciones([]);
    pintar();
    expect(await screen.findByText(/Tu rol no tiene estaciones asignadas/)).toBeInTheDocument();
    expect(estado.apiRequest.mock.calls.some(([r]) => r.startsWith("/v1/staff/cocina/cola"))).toBe(false);
  });

  it("el usuario y su rol van en el encabezado («Hola, Nombre · Rol»), no junto a la estación", async () => {
    pintar();
    await screen.findByText(/No hay nada pendiente en Barra/);
    const encabezado = screen.getByRole("banner");
    expect(within(encabezado).getByText("Hola, Carla · Cocina")).toBeInTheDocument();
    expect(screen.getByText("Estación:", { exact: false }).closest("p")).toHaveTextContent(/^Estación: Barra$/);
  });
});

describe("KDS: sesión", () => {
  it("«Cambiar de usuario» cierra la sesión", async () => {
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Cambiar de usuario" }));
    await waitFor(() => expect(estado.logout).toHaveBeenCalled());
  });
});
