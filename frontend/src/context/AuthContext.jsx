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
    // Etiqueta visible del rol ("Mesero"); la envían /auth/me (roleLabel) y el login (rolEtiqueta)
    roleLabel: user.roleLabel || user.rolEtiqueta || user.rol?.etiqueta || "",
    permisos: user.permisos || [],
    esPersonal: Boolean(user.esPersonal),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Aviso para el login tras cerrar la sesión (1.1, «Cambiar de usuario»). Va en el contexto y no
  // en el estado de la navegación: al vaciar el usuario, los guardas de rutas redirigen a /login
  // por su cuenta y esa redirección pisaría el estado de la navegación
  const [avisoLogin, setAvisoLogin] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/v1/auth/me")
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
    const authenticatedUser = await apiRequest("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ correo: email, contraseña: password }),
    });
    const normalizedUser = normalizeUser(authenticatedUser);
    setAvisoLogin("");
    setUser(normalizedUser);
    return normalizedUser;
  };

  const register = async (data) => {
    const registeredUser = await apiRequest("/v1/auth/registro", {
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

  const logout = async ({ aviso = "" } = {}) => {
    await apiRequest("/v1/auth/logout", { method: "POST" });
    setAvisoLogin(aviso);
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
        avisoLogin,
        usuario: user && { ...user, correo: user.email },
        cargando: loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
