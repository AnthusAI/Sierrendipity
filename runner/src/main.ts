import { startServer } from "./server.ts";

const port = Number(process.env.PORT ?? 8080);
startServer(port).then(() => console.log(`runner listening on ${port}`));
