import { describe, it, expect, vi, afterEach } from "vitest";
import { api, apiRequest } from "./api";

const respuesta = (status, cuerpo) => ({
  ok: status < 400, status, json: () => (cuerpo === undefined ? Promise.reject(new Error("sin cuerpo")) : Promise.resolve(cuerpo)),
});
afterEach(() => vi.unstubAllGlobals());

describe("Cliente HTTP único", () => {
  it("envía JSON con cookies y devuelve el cuerpo", async () => {
    const fetch = vi.fn().mockResolvedValue(respuesta(200, { ok: 1 }));
    vi.stubGlobal("fetch", fetch);
    expect(await api.post("/v1/x", { a: 1 })).toEqual({ ok: 1 });
    const [url, opciones] = fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/x$/);
    expect(opciones).toMatchObject({ method: "POST", credentials: "include", body: '{"a":1}' });
    expect(opciones.headers["Content-Type"]).toBe("application/json");
  });

  it("error con formato { error: { code, message, details } }", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(409, { error: { code: "DUPLICATE", message: "Ya existe", details: { campos: ["correo"] } } })));
    await expect(api.get("/v1/x")).rejects.toMatchObject({ message: "Ya existe", code: "DUPLICATE", status: 409, details: { campos: ["correo"] } });
  });

  it("sin conexión: mensaje claro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("/v1/x")).rejects.toThrow("No se pudo conectar con el servidor.");
  });

  it("204 o respuesta sin cuerpo → null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(204)));
    expect(await api.delete("/v1/x")).toBeNull();
  });
});
