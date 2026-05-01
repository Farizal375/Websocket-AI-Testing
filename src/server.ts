import { app, websocket } from "./app";

const PORT = Number(process.env.PORT) || 3000;

console.log(`Server running at http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
  websocket,
};
