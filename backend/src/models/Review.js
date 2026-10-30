import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tipo: { type: String, enum: ['general', 'producto'], default: 'general', required: true },
    productoId: { type: Number, min: 1 },
    calificacion: { type: Number, required: true, min: 1, max: 5 },
    comentario: { type: String, required: true, trim: true, minlength: 10, maxlength: 300 },
  },
  { timestamps: true }
);

export default mongoose.model('Review', reviewSchema);
