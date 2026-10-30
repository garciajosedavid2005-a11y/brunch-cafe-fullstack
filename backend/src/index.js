import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDB } from './db.js';
import routes from './routes/index.routes.js';

const app = express();

// Middlewares base
app.use(
  cors({
    origin: config.CLIENT_URL, // el front (React) corriendo en Vite
    credentials: true, // permite enviar/recibir cookies (necesario para el JWT en cookie)
  })
);
app.use(express.json()); // parsear JSON en el body de las peticiones
app.use(cookieParser()); // leer cookies (para el token JWT)

if (config.NODE_ENV === 'development') {
  app.use(morgan('dev')); // log de peticiones en consola (debe ir ANTES de las rutas)
}

// Ruta de prueba para confirmar que el servidor y la DB están vivos
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', entorno: config.NODE_ENV });
});

// Todas las rutas de la API (auth, usuarios, categorias, productos, pedidos,
// reservas, comentarios, estados, metodos-pago) se montan desde index.routes.js
app.use('/api', routes);

const start = async () => {
  await connectDB();
  app.listen(config.PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${config.PORT}`);
  });
};

start();