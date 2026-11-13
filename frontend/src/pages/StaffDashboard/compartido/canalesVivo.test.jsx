// 2.4 · Cada vista de sala escucha solo el canal que su permiso le deja: el plano «plano», la cuenta
// «cuenta:<id>» y «Cuentas abiertas» el plano solo con mesa:ver (sin él, solo polling y sin indicador).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

vi.mock("../../../services/api", () => ({ apiRequest: vi.fn(), API_URL: "http://api.test/api" }));

import { apiRequest } from "../../../services/api";
import CuentasAbiertas from "../cuentas/CuentasAbiertas";
import { usePlano } from "../plano/usePlano";
import { useCuenta } from "../comanda/useCuenta";

class FakeEventSource {
  static instancias = [];
  static CLOSED = 2;
  constructor(url) { this.url = url; FakeEventSource.instancias.push(this); }
  addEventListener() {}
  close() {}
}

const canalesAbiertos = () => FakeEventSource.instancias.map((es) => new URL(es.url).searchParams.get("canales"));

function Plano() { usePlano(); return null; }
function Cuenta({ id }) { useCuenta(id); return null; }

describe("canales en vivo por vista (2.4)", () => {
  beforeEach(() => {
    FakeEventSource.instancias = [];
    globalThis.EventSource = FakeEventSource;
    apiRequest.mockReset().mockResolvedValue({ cuentas: [], canales: { salon: true }, mesas: [] });
  });
  afterEach(() => { delete globalThis.EventSource; });

  it("el plano escucha «plano»", async () => {
    render(<Plano />);
    await act(async () => {});
    expect(canalesAbiertos()).toEqual(["plano"]);
  });

  it("la cuenta escucha «cuenta:<id>»", async () => {
    const id = "a".repeat(24);
    render(<Cuenta id={id} />);
    await act(async () => {});
    expect(canalesAbiertos()).toEqual([`cuenta:${id}`]);
  });

  it("«Cuentas abiertas» escucha el plano solo con mesa:ver", async () => {
    const { unmount } = render(<CuentasAbiertas permisos={["cuenta:ver"]} />);
    await act(async () => {});
    expect(canalesAbiertos()).toEqual([]);
    expect(screen.queryByText(/En vivo|Sin tiempo real|Conectando/)).toBeNull();
    unmount();
    render(<CuentasAbiertas permisos={["cuenta:ver", "mesa:ver"]} />);
    await act(async () => {});
    expect(canalesAbiertos()).toEqual(["plano"]);
    expect(screen.getByText("Conectando…")).toBeInTheDocument();
  });
});
