import mongoose from 'mongoose';

export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'violence', 'nudity', 'misinformation', 'other'];

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['post', 'user'], required: true },
    post: { type: mongoose.Schema.ObjectId, ref: 'Post', default: null },
    user: { type: mongoose.Schema.ObjectId, ref: 'User', default: null },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    detail: { type: String, trim: true, maxlength: 500, default: '' },
    // What a human decided, kept separate from what was reported — the report
    // is a signal, the state is the decision.
    state: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
    moderator: { type: mongoose.Schema.ObjectId, ref: 'User', default: null },
    moderatorNote: { type: String, trim: true, maxlength: 500, default: '' },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSchema.index({ state: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, post: 1, user: 1 }, { unique: true, sparse: true });

export default mongoose.model('Report', reportSchema);
