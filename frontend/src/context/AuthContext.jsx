import { useEffect, useState } from "react";
import AuthContext from "./authContextValue";
import { apiRequest } from "../services/api";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (active && error.status !== 401) {
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

  const login = async (credentials) => {
    const { user: authenticatedUser } = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setUser(authenticatedUser);
    return authenticatedUser;
  };

  const register = async (data) => {
    const { user: registeredUser } = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setUser(registeredUser);
    return registeredUser;
  };

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
