import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Inicio from "./pages/Inicio/Inicio";
import Menu from "./pages/Menu/Menu";
import Nosotros from "./pages/Nosotros/Nosotros";
import Reservas from "./pages/Reservas/Reservas";
import Domicilios from "./pages/Domicilios/Domicilios";
import Comentarios from "./pages/Comentarios/Comentarios";
import Login from "./pages/Login/Login";
import Perfil from "./pages/Perfil/Perfil";
import { CarritoProvider } from './context/CarritoContext'

import "./styles/index.css";
import "./styles/variables.css";

function App() {
  return (
    <CarritoProvider>
      <BrowserRouter>
        <Navbar />
        <div className="main-content">
          <Routes>
            <Route path="/"            element={<Inicio />}     />
            <Route path="/menu"        element={<Menu />}        />
            <Route path="/nosotros"    element={<Nosotros />}    />
            <Route path="/reservas"    element={<Reservas />}    />
            <Route path="/comentarios" element={<Comentarios />} />
            <Route path="/domicilios"  element={<Domicilios />}  />
            <Route path="/login"       element={<Login />}       />
            <Route path="/perfil"      element={<Perfil />}      />
          </Routes>
        </div>
        <Footer />
      </BrowserRouter>
    </CarritoProvider>
  );
}

export default App;