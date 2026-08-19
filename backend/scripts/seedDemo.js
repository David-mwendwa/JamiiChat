import dotenv from 'dotenv';
import mongoose from 'mongoose';

import User from '../models/userModel.js';
import { demoAccounts } from '../data/seedContent.js';

dotenv.config();

// Restores just the demo sign-ins, without touching anyone's posts.
//
// `npm run seed` wipes and rebuilds the whole database, which is the wrong tool
// when the only problem is that someone changed the demo password while poking
// at a deployed copy. This resets those two accounts in place and leaves every
// post, follow and conversation where it was.

const media = await (async () => {
  try {
    const { readFile } = await import('fs/promises');
    return JSON.parse(
      await readFile(new URL('../data/mediaManifest.json', import.meta.url), 'utf8')
    );
  } catch {
    // Artwork is optional here — the accounts still work without it.
    return { avatars: {}, covers: {} };
  }
})();

const run = async () => {
  const uri = process.env.DATABASE_URL || process.env.MONGO_URI;
  if (!uri) throw new Error('DATABASE_URL is not set');

  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.name}`);

  for (const account of demoAccounts) {
    const existing = await User.findOne({ handle: account.handle }).select('+active');

    if (existing) {
      // Assigned then saved rather than updated in place: the password hashing
      // hook lives on `save`, and findOneAndUpdate would store it in clear.
      existing.displayName = account.displayName;
      existing.email = account.email;
      existing.password = account.password;
      existing.bio = account.bio;
      existing.location = account.location;
      existing.role = account.role;
      existing.active = true;
      existing.suspendedUntil = null;
      if (!existing.avatar) existing.avatar = media.avatars?.[account.handle] ?? '';
      if (!existing.cover) existing.cover = media.covers?.[account.handle] ?? '';
      await existing.save();
      console.log(`  reset  ${account.email}`);
    } else {
      await User.create({
        ...account,
        avatar: media.avatars?.[account.handle] ?? '',
        cover: media.covers?.[account.handle] ?? '',
      });
      console.log(`  created ${account.email}`);
    }
  }

  console.log('\nDemo sign-ins ready:');
  for (const account of demoAccounts) console.log(`  ${account.email} / ${account.password}`);

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Demo seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
