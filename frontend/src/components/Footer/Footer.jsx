import { Link } from "react-router-dom";
import "./Footer.css";
import { FaFacebook, FaInstagram, FaTiktok, FaTripadvisor } from "react-icons/fa";
import HorariosCafe from "../HorariosCafe/HorariosCafe";

const Footer = () => {
  return (
    <div className="container">
      <div className="grid-x grid-padding-x">

        {/* Enlaces rápidos */}
        <div className="cell small-12 medium-4">
          <h4>Enlaces Rápidos</h4>
          <ul>
            <li><Link className="fast-access" to="/">Inicio</Link></li>
            <li><Link className="fast-access" to="/menu">Menú</Link></li>
            <li><Link className="fast-access" to="/nosotros">Nosotros</Link></li>
            <li><Link className="fast-access" to="/reservas">Reservas</Link></li>
            <li><Link className="fast-access" to="/domicilios">Domicilios</Link></li>
          </ul>
        </div>

        {/* Horario y redes */}
        <div className="cell small-12 medium-4">
          {/* Leídos de la configuración (Admin › Horarios) */}
          <h4>Horarios</h4>
          <HorariosCafe className="footer-horarios" />
          <div className="footer-icons">
            <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">
              <FaFacebook />
            </a>
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">
              <FaInstagram />
            </a>
            <a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer">
              <FaTiktok />
            </a>
            <a href="https://www.tripadvisor.com/" target="_blank" rel="noopener noreferrer">
              <FaTripadvisor />
            </a>
          </div>
        </div>

        {/* Contacto */}
        <div className="cell small-12 medium-4">
          <h4>Contáctenos</h4>
          <span>Tel: +57 0000000000</span>
          <br />
          <span>Email: info@brunchcafe.com</span>
          <br />
          <span>Dirección: Carrera 36B #30-06</span>
        </div>

      </div>
      <div className="footer-bottom">
        <span>© 2026 Brunch Café | Todos los derechos reservados</span>
      </div>
    </div>
  );
};

export default Footer;