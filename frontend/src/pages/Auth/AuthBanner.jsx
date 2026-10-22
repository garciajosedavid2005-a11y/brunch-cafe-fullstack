import slideImg from "../../assets/imagenes/slide1.jpg";
import logoClaro from "../../assets/LogoClaro.png";
import { Coffee, UtensilsCrossed, Sparkles } from "lucide-react";

const AuthBanner = ({ modo = "login" }) => {
  return (
    <aside className="auth-banner" aria-label="Brunch Café experiencia">
      <img
        src={slideImg}
        alt="Ambiente acogedor de Brunch Café"
        className="auth-banner__fondo"
      />
      <div className="auth-banner__overlay" />

      <div className="auth-banner__contenido">
        {/* Identidad de marca superior: ÚNICAMENTE el logo y el nombre 'Brunch Café' */}
        <div className="auth-banner__marca">
          <img
            src={logoClaro}
            alt="Logo Brunch Café"
            className="auth-banner__logo"
          />
          <span className="auth-banner__nombre-marca">Brunch Café</span>
        </div>

        {/* Mensaje inspirador según la pantalla */}
        <div className="auth-banner__cuerpo">
          <h2 className="auth-banner__titulo">
            {modo === "login" ? (
              <>
                El aroma de casa
                <span>te da la bienvenida</span>
              </>
            ) : (
              <>
                Comparte el placer
                <span>de cada mañana</span>
              </>
            )}
          </h2>

          <p className="auth-banner__descripcion">
            {modo === "login"
              ? "Accede a tus reservas exclusivas, pedidos favoritos y novedades preparadas con el cuidado y la calidez de siempre."
              : "Crea tu cuenta para disfrutar de promociones de temporada, reserva preferencial de mesa y pedidos directos a tu puerta."}
          </p>

          <ul className="auth-banner__detalles">
            <li className="auth-banner__item">
              <span className="auth-banner__icono">
                <Coffee size={16} />
              </span>
              <span>Granos de especialidad recién tostados</span>
            </li>
            <li className="auth-banner__item">
              <span className="auth-banner__icono">
                <UtensilsCrossed size={16} />
              </span>
              <span>Panadería y recetas artesanales del día</span>
            </li>
            <li className="auth-banner__item">
              <span className="auth-banner__icono">
                <Sparkles size={16} />
              </span>
              <span>Ambiente diseñado para disfrutar despacio</span>
            </li>
          </ul>
        </div>

        {/* Pie con nota cálida */}
        <p className="auth-banner__pie">
          "El brunch no es solo una comida, es una pausa deliciosa en el día."
        </p>
      </div>
    </aside>
  );
};

export default AuthBanner;
