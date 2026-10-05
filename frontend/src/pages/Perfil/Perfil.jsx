import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Perfil = () => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const obtenerPerfil = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/usuarios/perfil', {
          credentials: 'include', // IMPORTANTE: manda la cookie del token
        });

        if (!res.ok) {
          navigate('/login');
          return;
        }

        const data = await res.json();
        setUsuario(data);
      } catch (err) {
        navigate('/login');
      } finally {
        setCargando(false);
      }
    };

    obtenerPerfil();
  }, [navigate]);

  if (cargando) return <p>Cargando...</p>;
  if (!usuario) return null;

  return (
    <div style={{ maxWidth: 360, margin: '60px auto' }}>
      <h2>Mi perfil</h2>
      <p><strong>Nombre:</strong> {usuario.nombre} {usuario.apellido}</p>
      <p><strong>Correo:</strong> {usuario.correo}</p>
      <p><strong>Teléfono:</strong> {usuario.telefono}</p>
      <p><strong>Rol:</strong> {usuario.rol?.nombre}</p>
    </div>
  );
};

export default Perfil;