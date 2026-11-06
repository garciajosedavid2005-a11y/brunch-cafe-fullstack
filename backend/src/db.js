import mongoose from 'mongoose';
import { config } from './config.js';
 
export const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    if (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv') {
      console.error(
        '❌ Node.js no pudo consultar el registro DNS SRV de MongoDB. ' +
        'En Windows, usa la URI estándar mongodb:// de Atlas en MONGO_URI ' +
        'o permite consultas DNS (puerto 53) desde Node.js. Este error ocurre antes de autenticar.'
      );
    } else {
      console.error('❌ Error al conectar a MongoDB:', error.message);
    }
    process.exit(1);
  }
};