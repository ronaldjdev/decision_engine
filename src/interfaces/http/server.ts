import { createDecisionEngine } from '../../composition/DecisionEngineContainer.ts';
import { createDecisionEngineHttpServer } from './HttpServer.ts';

const port = Number(process.env.PORT ?? '3000');
const host = process.env.HOST ?? '127.0.0.1';

const engine = createDecisionEngine();
const server = createDecisionEngineHttpServer(engine);

server.listen(port, host, () => {
  console.log(
    `[CrediFlow Decision Engine] REST API activa en http://${host}:${port}`,
  );
  console.log(`Endpoints disponibles: GET http://${host}:${port}/`);
});
