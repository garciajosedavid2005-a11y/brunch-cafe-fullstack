import { useEffect, useState } from "react";
import AuthContext from "./authContextValue";
import { apiRequest } from "../services/api";

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id || user._id,
    nombre: user.nombre,
    apellido: user.apellido,
    email: user.email || user.correo,
    telefono: user.telefono || "",
    role: user.role || user.rol?.nombre || user.rol,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(normalizeUser(currentUser));
      })
      .catch((error) => {
        if (active && error.status !== 401 && error.status !== 403) {
          console.error("No se pudo comprobar la sesión:", error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async ({ email, password }) => {
    const authenticatedUser = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ correo: email, contraseña: password }),
    });
    const normalizedUser = normalizeUser(authenticatedUser);
    setUser(normalizedUser);
    return normalizedUser;
  };

  const register = async (data) => {
    const registeredUser = await apiRequest("/auth/registro", {
      method: "POST",
      body: JSON.stringify({
        nombre: data.nombre,
        apellido: data.apellido,
        correo: data.email,
        contraseña: data.password,
        telefono: data.telefono,
      }),
    });
    const normalizedUser = normalizeUser(registeredUser);
    setUser(normalizedUser);
    return normalizedUser;
  };

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
        register,
        logout,
        usuario: user && { ...user, correo: user.email },
        cargando: loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
