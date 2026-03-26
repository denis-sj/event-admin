import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config.js';
import { wss } from './ws/server.js';
import { prisma } from './prisma.js';

const server = createServer(app);

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

const startServer = async () => {
  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connected');

    server.listen(config.PORT, () => {
      console.log(`🚀 Server listening on port ${config.PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle graceful shutdown
const shutdown = async () => {
  console.log('Shutting down server...');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server and database connections closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);