import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useDatosCuenta, { etiquetaRolCuenta } from '../../hooks/useDatosCuenta';

// Vista simple de /perfil (se mantiene; usa el mismo cliente HTTP que el resto de la app)
const Perfil = () => {
  const { cuenta: usuario, cargando, error } = useDatosCuenta();
  const navigate = useNavigate();

  useEffect(() => {
    if (error) navigate('/login');
  }, [error, navigate]);

  if (cargando) return <p>Cargando...</p>;
  if (!usuario) return null;

  return (
    <div style={{ maxWidth: 360, margin: '60px auto' }}>
      <h2>Mi perfil</h2>
      <p><strong>Nombre:</strong> {usuario.nombre} {usuario.apellido}</p>
      <p><strong>Correo:</strong> {usuario.correo}</p>
      <p><strong>Teléfono:</strong> {usuario.telefono}</p>
      <p><strong>Rol:</strong> {etiquetaRolCuenta(usuario.rol)}</p>
    </div>
  );
};

export default Perfil;
