import http from 'http';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION — shutting down');
  console.error(err.name, err.message);
  process.exit(1);
});

const PORT = process.env.PORT || 5007;
const DB = process.env.DATABASE_URL || process.env.MONGO_URI;

if (!DB) {
  console.error('No database connection string set (DATABASE_URL)');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set');
  process.exit(1);
}

// Connect before the app is imported, so a bad connection string fails here
// rather than on the first request that touches a model.
await mongoose.connect(DB);
console.log(`MongoDB connected: ${mongoose.connection.name}`);

const { default: app, allowedOrigins } = await import('./app.js');
const { initSocket } = await import('./socket/index.js');

// Express and Socket.IO share one http server, so both are reachable on the
// same port and the same origin allowlist governs each.
const server = http.createServer(app);
initSocket(server, { allowedOrigins });

server.listen(PORT, () => console.log(`JamiiChat API listening on http://localhost:${PORT}`));

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION — shutting down');
  console.error(err.name, err.message);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  server.close(() => console.log('Process terminated'));
});
