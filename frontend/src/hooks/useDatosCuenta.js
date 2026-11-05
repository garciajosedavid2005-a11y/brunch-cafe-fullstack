import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";

/**
 * Datos de la cuenta de la sesión (GET /usuarios/perfil): nombre, correo,
 * teléfono, rol y fecha de registro. Lo usan /perfil y "Seguridad y configuración".
 */
export default function useDatosCuenta() {
  const [cuenta, setCuenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    apiRequest("/usuarios/perfil")
      .then((datos) => activo && setCuenta(datos))
      .catch((e) => activo && setError(e))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, []);

  return { cuenta, cargando, error };
}

export const etiquetaRolCuenta = (rol) => rol?.etiqueta || rol?.nombre || "";

export const fechaRegistro = (valor) => {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? ""
    : new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(fecha);
};
