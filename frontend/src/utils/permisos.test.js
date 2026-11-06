import { describe, it, expect } from "vitest";
import { tienePermiso, esAdministrador, esPersonal, rutaInicio } from "./permisos";

const usuario = (permisos, extra = {}) => ({ permisos, esPersonal: true, ...extra });

describe("permisos del usuario (0.15d)", () => {
  it("tienePermiso: clave exacta o comodín *", () => {
    expect(tienePermiso(usuario(["reserva:ver"]), "reserva:ver")).toBe(true);
    expect(tienePermiso(usuario(["reserva:ver"]), "reserva:crear")).toBe(false);
    expect(tienePermiso(usuario(["*"]), "reserva:crear")).toBe(true);
    expect(tienePermiso(null, "reserva:ver")).toBe(false);
  });

  it("rutaInicio: * → /admin; personal → /staff (aunque no tenga permisos); cliente → /cuenta", () => {
    expect(rutaInicio(usuario(["*"], { role: "gerente" }))).toBe("/admin");
    expect(rutaInicio(usuario(["reserva:ver"], { role: "caja" }))).toBe("/staff");
    expect(rutaInicio(usuario([]))).toBe("/staff");
    expect(rutaInicio(usuario([], { esPersonal: false, role: "mesero" }))).toBe("/cuenta");
    expect(esAdministrador(usuario(["*"]))).toBe(true);
    expect(esPersonal(usuario(["*"]))).toBe(false);
  });
});
