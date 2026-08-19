import mongoose from 'mongoose';

// Keyset pagination. A feed gains rows while the reader scrolls, so an offset
// re-runs the query against a list that has shifted underneath it: rows near
// the boundary get served twice or skipped entirely. Anchoring to the last
// item's (createdAt, _id) instead makes the next page independent of anything
// inserted above it.

export const encodeCursor = (doc) => {
  if (!doc) return null;
  const at = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt;
  return Buffer.from(`${at}|${doc._id}`).toString('base64url');
};

export const decodeCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!at || !mongoose.isValidObjectId(id)) return null;
    const createdAt = new Date(at);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: new mongoose.Types.ObjectId(id) };
  } catch {
    // A malformed cursor is treated as no cursor — the reader gets page one
    // rather than an error they cannot act on.
    return null;
  }
};

// Mongo cannot compare tuples, so the tie on identical timestamps is broken by
// _id in a second clause.
export const cursorFilter = (cursor, direction = 'desc') => {
  if (!cursor) return {};
  const op = direction === 'desc' ? '$lt' : '$gt';
  return {
    $or: [
      { createdAt: { [op]: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { [op]: cursor.id } },
    ],
  };
};

export const PAGE_SIZE = 20;

export const clampLimit = (raw, fallback = PAGE_SIZE) => {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return Math.min(n, 50);
};

// Fetches one extra row to learn whether another page exists without a second
// count query.
export const paginate = async (query, { cursor, limit, direction = 'desc' }) => {
  const sort = direction === 'desc' ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 };
  const rows = await query.sort(sort).limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
};
