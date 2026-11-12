import { Link } from "react-router-dom";
import "./NoEncontrada.css";

// 2.0b · Ruta desconocida: antes la página quedaba vacía entre el navbar y el pie
export default function NoEncontrada() {
  return (
    <main className="no-encontrada">
      <div className="no-encontrada__tarjeta">
        <span aria-hidden="true">✦</span>
        <h1>No encontramos esta página</h1>
        <p>Puede que el enlace esté mal escrito o que la página ya no exista.</p>
        <div className="no-encontrada__acciones">
          <Link to="/" className="no-encontrada__boton no-encontrada__boton--principal">Volver al inicio</Link>
          <Link to="/menu" className="no-encontrada__boton">Ver el menú</Link>
        </div>
      </div>
    </main>
  );
}
