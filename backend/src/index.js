import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { connectDB } from './db.js';
import routes from './routes/index.routes.js';

const app = express();

app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());

if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', entorno: config.NODE_ENV });
});

// Todas las rutas de la API se montan desde index.routes.js
app.use('/api', routes);

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
