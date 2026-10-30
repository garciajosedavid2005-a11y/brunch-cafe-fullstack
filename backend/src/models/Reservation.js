import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    nombre: { type: String, trim: true, maxlength: 120 },
    correo: { type: String, lowercase: true, trim: true, maxlength: 254 },
    motivo: { type: String, required: true, trim: true, maxlength: 120 },
    personas: { type: Number, required: true, min: 1, max: 20 },
    fecha: { type: Date, required: true },
    hora: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    observaciones: { type: String, trim: true, maxlength: 200, default: '' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.model('Reservation', reservationSchema);
