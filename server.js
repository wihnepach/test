const env = require("./config/env");
const app = require("./server/app");

app.listen(env.PORT, env.HOST, () => {
  console.log(`To-Do server started: http://${env.HOST}:${env.PORT}`);
});
