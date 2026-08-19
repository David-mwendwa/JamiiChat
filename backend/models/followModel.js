import mongoose from 'mongoose';

const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    following: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    // `pending` is how private accounts work: the edge exists but grants no
    // visibility until the owner accepts it.
    status: { type: String, enum: ['accepted', 'pending'], default: 'accepted', index: true },
  },
  { timestamps: true }
);

// Makes a duplicate follow a database error rather than a race between two
// concurrent requests, so the counter increment below it can be trusted.
followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ following: 1, status: 1, createdAt: -1 });
followSchema.index({ follower: 1, status: 1, createdAt: -1 });

export default mongoose.model('Follow', followSchema);
