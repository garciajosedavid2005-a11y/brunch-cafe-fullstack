// 2.4 · Tiempo real en las vistas de sala: el sondeo escucha su canal (SSE) y recarga al recibir un aviso;
// el polling queda de respaldo con un intervalo 4 veces más largo mientras el canal está vivo. Si la
// conexión se cae, «Reconectando…»; si el servidor la rechaza o no hay EventSource, «Sin tiempo real»
// y el polling normal.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("../../../services/api", () => ({ apiRequest: vi.fn(), API_URL: "http://api.test/api" }));

import { apiRequest } from "../../../services/api";
import { useSondeo } from "./useSondeo";
import Actualizado from "./Actualizado";

class FakeEventSource {
  static instancias = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  constructor(url, opciones) {
    this.url = url;
    this.opciones = opciones;
    this.readyState = FakeEventSource.CONNECTING;
    this.escuchas = {};
    FakeEventSource.instancias.push(this);
  }
  addEventListener(tipo, fn) { this.escuchas[tipo] = fn; }
  close() { this.readyState = FakeEventSource.CLOSED; this.cerrado = true; }
  abrir() { this.readyState = FakeEventSource.OPEN; this.onopen?.(); }
  aviso(datos) { this.onmessage?.({ data: JSON.stringify(datos) }); }
  fallar(cerrar = false) { if (cerrar) this.readyState = FakeEventSource.CLOSED; this.onerror?.(); }
}

const INTERVALO = 10_000;
function Vista({ canales }) {
  const { datos, error, actualizadoEn, recargar, enVivo } = useSondeo("/v1/staff/salon/mesas", INTERVALO, { canales });
  return (
    <div>
      <span>{datos ? `datos ${datos.n ?? ""}` : "sin datos"}</span>
      <Actualizado desde={actualizadoEn} error={error} onActualizar={recargar} enVivo={enVivo} />
    </div>
  );
}

describe("useSondeo con tiempo real (2.4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instancias = [];
    globalThis.EventSource = FakeEventSource;
    apiRequest.mockReset().mockResolvedValue({ mesas: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.EventSource;
  });

  it("abre el canal con la cookie, recarga al recibir un aviso y lo dice («En vivo»)", async () => {
    render(<Vista canales={["plano"]} />);
    await act(async () => {});
    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [es] = FakeEventSource.instancias;
    expect(es.url).toBe("http://api.test/api/v1/staff/eventos?canales=plano");
    expect(es.opciones).toEqual({ withCredentials: true });
    act(() => es.abrir());
    expect(screen.getByText(/En vivo/)).toBeInTheDocument();
    await act(async () => { es.aviso({ canal: "plano", tipo: "salon_cambio", ids: {} }); });
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("en vivo, el polling de respaldo es 4 veces más lento; al caerse vuelve al normal y dice «Reconectando…»", async () => {
    render(<Vista canales={["plano"]} />);
    await act(async () => {});
    const [es] = FakeEventSource.instancias;
    act(() => es.abrir());
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO + 100); });
    expect(apiRequest).toHaveBeenCalledTimes(1); // sin polling normal mientras está vivo
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO * 3); });
    expect(apiRequest).toHaveBeenCalledTimes(2); // respaldo cada 4 × intervalo
    act(() => es.fallar());
    expect(screen.getByText(/Reconectando/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO + 100); });
    expect(apiRequest).toHaveBeenCalledTimes(3); // polling normal
    // Reconecta (EventSource reintenta solo): vuelve «En vivo» y el respaldo lento
    act(() => es.abrir());
    expect(screen.getByText(/En vivo/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO + 100); });
    expect(apiRequest).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO * 3); });
    expect(apiRequest).toHaveBeenCalledTimes(4);
  });

  it("si el servidor rechaza el canal (conexión cerrada), «Sin tiempo real» y polling normal", async () => {
    render(<Vista canales={["plano"]} />);
    await act(async () => {});
    act(() => FakeEventSource.instancias[0].fallar(true));
    expect(screen.getByText(/Sin tiempo real/)).toBeInTheDocument();
  });

  it("sin canales o sin EventSource, solo polling (como antes) y sin conexiones", async () => {
    const { unmount } = render(<Vista canales={[]} />);
    await act(async () => {});
    expect(FakeEventSource.instancias).toHaveLength(0);
    unmount();
    delete globalThis.EventSource;
    render(<Vista canales={["plano"]} />);
    await act(async () => {});
    expect(screen.queryByText(/En vivo|Reconectando/)).toBeNull();
  });

  it("al pasar a «En vivo» los avisos siguen pintando los datos nuevos", async () => {
    apiRequest.mockResolvedValueOnce({ n: 1 }).mockResolvedValue({ n: 2 });
    render(<Vista canales={["plano"]} />);
    await act(async () => {});
    expect(screen.getByText("datos 1")).toBeInTheDocument();
    const [es] = FakeEventSource.instancias;
    act(() => es.abrir());
    await act(async () => { es.aviso({ canal: "plano", tipo: "salon_cambio", ids: {} }); });
    expect(screen.getByText("datos 2")).toBeInTheDocument();
  });

  it("un aviso que llega con una recarga en curso no se pierde: se recarga otra vez al terminar", async () => {
    let soltar;
    apiRequest.mockResolvedValueOnce({ n: 1 })
      .mockImplementationOnce(() => new Promise((r) => { soltar = () => r({ n: 2 }); }))
      .mockResolvedValue({ n: 3 });
    render(<Vista canales={["plano"]} />);
    await act(async () => {});
    const [es] = FakeEventSource.instancias;
    act(() => es.abrir());
    await act(async () => { es.aviso({ tipo: "salon_cambio" }); }); // 2.ª petición, en curso
    await act(async () => { es.aviso({ tipo: "salon_cambio" }); }); // llega durante la 2.ª
    expect(apiRequest).toHaveBeenCalledTimes(2);
    await act(async () => { soltar(); });
    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(screen.getByText("datos 3")).toBeInTheDocument();
  });

  it("al desmontar cierra la conexión; «sesion_cerrada» la cierra y deja de reintentar", async () => {
    const { unmount } = render(<Vista canales={["plano"]} />);
    await act(async () => {});
    const [es] = FakeEventSource.instancias;
    act(() => es.escuchas.sesion_cerrada?.({ data: "{}" }));
    expect(es.cerrado).toBe(true);
    unmount();
    const { unmount: otro } = render(<Vista canales={["plano"]} />);
    await act(async () => {});
    otro();
    expect(FakeEventSource.instancias[1].cerrado).toBe(true);
  });
});
