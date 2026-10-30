
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import reviewRoutes from './routes/review.routes.js';
 
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
  app.use(morgan('dev')); // log de peticiones en consola
}
 
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', entorno: config.NODE_ENV });
});

app.use('/api/auth', authRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/reviews', reviewRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.code === 11000) {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos.' });
  }
  res.status(error.status || 500).json({
    message: error.status ? error.message : 'Ocurrió un error interno.',
  });
});
 
const start = async () => {
  await connectDB();
  app.listen(config.PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${config.PORT}`);
  });
};
 
start();