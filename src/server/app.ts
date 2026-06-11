import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { attachHandlers } from './net/handlers';
import { rooms, startDriver, stopDriver } from './rooms';

export interface GameServer {
  http: HttpServer;
  io: Server;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export function createGameServer(): GameServer {
  const app = express();
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });
  // production client bundle; in dev Vite serves the client instead
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  app.use(express.static(clientDir));
  app.get('/', (_req, res, next) => {
    res.sendFile(path.join(clientDir, 'index.html'), (err) => (err ? next() : undefined));
  });

  const http = createServer(app);
  const io = new Server(http, {
    cors: { origin: true },
    pingInterval: 10000,
    pingTimeout: 8000
  });
  attachHandlers(io);
  startDriver(io);

  return {
    http,
    io,
    listen(port: number) {
      return new Promise<number>((resolve) => {
        http.listen(port, '0.0.0.0', () => {
          const addr = http.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    async close() {
      stopDriver();
      rooms.clear();
      io.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  };
}
