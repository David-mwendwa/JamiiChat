import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import validator from 'validator';
import { isReservedHandle } from '../utils/reservedHandles.js';

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

const userSchema = new mongoose.Schema(
  {
    handle: {
      type: String,
      required: [true, 'Pick a username'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        // A handle that shadows one of the app's own routes (e.g. `admin`,
        // `settings`) is otherwise syntactically valid, so the reserved check
        // has to sit alongside the pattern check rather than the schema
        // accepting it and a real user's profile becoming unreachable later.
        validator: (v) => HANDLE_PATTERN.test(v) && !isReservedHandle(v),
        message: (props) =>
          isReservedHandle(props.value)
            ? `"${props.value}" is reserved and cannot be used as a username`
            : 'Usernames are 3-20 characters, using letters, numbers and underscores only',
      },
    },
    displayName: {
      type: String,
      required: [true, 'Tell people what to call you'],
      trim: true,
      maxlength: [50, 'A display name must be 50 characters or fewer'],
    },
    email: {
      type: String,
      required: [true, 'An email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'That email address does not look right'],
    },
    password: {
      type: String,
      required: [true, 'A password is required'],
      minlength: [8, 'Passwords must be at least 8 characters'],
      select: false,
    },
    bio: { type: String, trim: true, maxlength: [160, 'A bio must be 160 characters or fewer'], default: '' },
    location: { type: String, trim: true, maxlength: [40, 'Keep the location under 40 characters'], default: '' },
    website: { type: String, trim: true, default: '' },
    avatar: { type: String, default: '' },
    cover: { type: String, default: '' },
    // A private account turns every new follow into a request the owner approves.
    isPrivate: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
    active: { type: Boolean, default: true, select: false },
    suspendedUntil: { type: Date, default: null },
    // Denormalised so a profile header is one document read rather than three
    // count queries. Rebuilt from source by `npm run reconcile:counts`.
    counts: {
      followers: { type: Number, default: 0, min: 0 },
      following: { type: Number, default: 0, min: 0 },
      posts: { type: Number, default: 0, min: 0 },
    },
    lastSeenAt: { type: Date, default: Date.now },
    passwordChangedAt: Date,
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ displayName: 'text', handle: 'text', bio: 'text' });
userSchema.index({ 'counts.followers': -1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  // Backdated by a second: the token issued right after a password change would
  // otherwise have an `iat` in the same second and be rejected as stale.
  if (!this.isNew) this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.matchesPassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.passwordChangedAfter = function (tokenIssuedAt) {
  if (!this.passwordChangedAt) return false;
  return Math.floor(this.passwordChangedAt.getTime() / 1000) > tokenIssuedAt;
};

// The token mailed to the user is the plain, random one; only its hash is
// stored, the same split a session token uses, so a leaked database dump
// can't be turned into a working reset link.
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
  return resetToken;
};

// The shape every endpoint returns for a user. Keeping it here means no
// controller can accidentally serialise the password hash or email address.
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    handle: this.handle,
    displayName: this.displayName,
    bio: this.bio,
    location: this.location,
    website: this.website,
    avatar: this.avatar,
    cover: this.cover,
    isPrivate: this.isPrivate,
    role: this.role,
    counts: this.counts,
    createdAt: this.createdAt,
  };
};

userSchema.methods.toPrivate = function () {
  return { ...this.toPublic(), email: this.email, lastSeenAt: this.lastSeenAt };
};

export default mongoose.model('User', userSchema);
