import "./Comentarios.css";
import HeroComentarios from "../../components/HeroComentarios/HeroComentarios";
import ListaComentarios from "../../components/ListaComentarios/ListaComentarios";
import useAnimacionEntrada from "../../hooks/useAnimacionEntrada";

const Comentarios = () => {
  const heroRef = useAnimacionEntrada();
  const listaRef = useAnimacionEntrada();

  return (
    <main className="pagina-comentarios">
      <div className="mancha-comentarios mancha-comentarios-1" aria-hidden="true" />
      <div className="mancha-comentarios mancha-comentarios-2" aria-hidden="true" />
      <div className="mancha-comentarios mancha-comentarios-3" aria-hidden="true" />

      <section ref={heroRef} className="animar comentarios-hero">
        <HeroComentarios />
      </section>
      <section ref={listaRef} className="animar comentarios-lista">
        <ListaComentarios />
      </section>
    </main>
  );
};

export default Comentarios;
