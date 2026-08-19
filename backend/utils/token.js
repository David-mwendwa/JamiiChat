import jwt from 'jsonwebtoken';

export const signToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

export const verifyToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

// Both the HTTP middleware and the socket handshake read tokens through this,
// so there is one definition of where a credential may live.
export const extractToken = (req) => {
  const header = req.headers?.authorization;
  if (header && /^Bearer /i.test(header)) return header.slice(7).trim();
  return req.cookies?.token || null;
};

export const cookieOptions = () => ({
  httpOnly: true,
  // Secure cookies are dropped over plain http, which would silently break
  // local development.
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
});
