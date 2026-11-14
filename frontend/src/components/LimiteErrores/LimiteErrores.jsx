import { Component } from "react";
import { TriangleAlert, RefreshCw } from "lucide-react";
import "./LimiteErrores.css";

// 2.6b · Límite de errores (Error Boundary): si algo dentro falla al dibujarse, se muestra este aviso en
// lugar de dejar toda la pantalla en blanco (React desmonta el árbol entero ante un error sin capturar).
// El error queda en la consola con la sección, para diagnosticarlo. Solo atrapa errores de render y de
// los ciclos de vida: los de peticiones y eventos ya los avisa cada pantalla.
// Se usa por sección, no por ruta (decisión 2.6b): con `key` de la sección, cambiar de pestaña lo reinicia.
export default class LimiteErrores extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[Brunch Café] Error en la sección «${this.props.seccion || "pantalla"}»:`, error, info?.componentStack || "");
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="limite-errores" role="alert">
        <TriangleAlert size={22} aria-hidden="true" />
        <div className="limite-errores__texto">
          <strong>Algo salió mal en esta sección</strong>
          <span>El resto de la pantalla sigue funcionando. Si vuelve a pasar, avisa al administrador.</span>
        </div>
        <button type="button" className="limite-errores__boton" onClick={() => window.location.reload()}>
          <RefreshCw size={18} aria-hidden="true" /> Recargar
        </button>
      </div>
    );
  }
}
