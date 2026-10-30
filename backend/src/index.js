import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.routes.js';
import customerRoutes from './routes/customer.routes.js';
import reviewRoutes from './routes/review.routes.js';
import usuarioRoutes from './routes/usuario.routes.js';
import reservaRoutes from './routes/reserva.routes.js';

const app = express();

app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', entorno: config.NODE_ENV });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/reviews', reviewRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.code === 11000) {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos.' });
  }
  return res.status(error.status || 500).json({
    message: error.status ? error.message : 'Ocurrió un error interno.',
  });
});

const start = async () => {
  await connectDB();
  app.listen(config.PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${config.PORT}`);
  });
};

start();
