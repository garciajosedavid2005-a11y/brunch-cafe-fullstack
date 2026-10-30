import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
      default: 'pending',
    },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true, trim: true },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
      },
    ],
    total: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);
