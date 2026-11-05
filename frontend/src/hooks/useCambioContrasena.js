import { useState } from "react";
import { apiRequest } from "../services/api";

export const MINIMO_CONTRASENA = 6;
const VACIO = { actual: "", nueva: "", confirmar: "" };

// Errores por campo (los muestra el formulario junto a cada input)
export const validarCambioContrasena = ({ actual, nueva, confirmar }) => {
  const errores = {};
  if (!actual) errores.actual = "Ingresa tu contraseña actual.";
  if (nueva.length < MINIMO_CONTRASENA) {
    errores.nueva = `La nueva contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`;
  }
  if (nueva !== confirmar) errores.confirmar = "La confirmación no coincide.";
  return errores;
};

/** Estado y envío del cambio de contraseña (PUT /usuarios/perfil/contrasena). */
export default function useCambioContrasena() {
  const [datos, setDatos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo) => (event) => {
    setDatos((actual) => ({ ...actual, [campo]: event.target.value }));
    setMensaje("");
  };

  const enviar = async (event) => {
    event?.preventDefault();
    setMensaje("");
    setErrorServidor("");
    const nuevos = validarCambioContrasena(datos);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return false;

    setGuardando(true);
    try {
      await apiRequest("/usuarios/perfil/contrasena", {
        method: "PUT",
        body: JSON.stringify({ actual: datos.actual, nueva: datos.nueva }),
      });
      setDatos(VACIO);
      setMensaje("Contraseña actualizada correctamente.");
      return true;
    } catch (error) {
      setErrorServidor(error.message);
      return false;
    } finally {
      setGuardando(false);
    }
  };

  return { datos, errores, mensaje, errorServidor, guardando, cambiar, enviar };
}
