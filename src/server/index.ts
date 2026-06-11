import { createGameServer } from './app';

const port = Number(process.env.PORT || 3000);
const server = createGameServer();
server.listen(port).then((p) => {
  console.log(`[mole-in-the-mine] serving on http://localhost:${p}`);
});
