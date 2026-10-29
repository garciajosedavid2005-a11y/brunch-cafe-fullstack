import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al cargar la app, pregunta al backend si ya hay una sesión activa (cookie válida)
  useEffect(() => {
    const verificarSesion = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/usuarios/perfil', {
          credentials: 'include',
        });
        setUsuario(res.ok ? await res.json() : null);
      } catch (error) {
        setUsuario(null);
      } finally {
        setCargando(false);
      }
    };
    verificarSesion();
  }, []);

  const login = (datosUsuario) => setUsuario(datosUsuario);

  const logout = async () => {
    const res = await fetch('http://localhost:4000/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('No se pudo cerrar la sesión en el servidor.');
    }

    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};