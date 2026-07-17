import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.RBT_ONLINE_MOCK_PORT ?? 4175);
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  response.end('Rota Brasil Tycoon online mock\n');
});
const sockets = new Set<WebSocket>();
const sessions = new Map<WebSocket, string>();
const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('message', (data) => {
    const text = data.toString();
    if (Buffer.byteLength(text) > 8_192) return socket.close(1009, 'payload too large');
    try {
      const message = JSON.parse(text) as { type?: string; sender?: string };
      if (message.type === 'presence' && typeof message.sender === 'string') sessions.set(socket, message.sender);
    } catch { return; }
    for (const client of sockets) if (client.readyState === WebSocket.OPEN) client.send(text);
  });
  socket.on('close', () => {
    sockets.delete(socket);
    const sessionId = sessions.get(socket);
    sessions.delete(socket);
    if (!sessionId) return;
    const leave = JSON.stringify({ type: 'leave', sender: '__relay__', sessionId });
    for (const client of sockets) if (client.readyState === WebSocket.OPEN) client.send(leave);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`Online mock em http://127.0.0.1:${port}`));

const shutdown = () => {
  for (const socket of sockets) socket.close(1001, 'server shutdown');
  wss.close(() => server.close(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
