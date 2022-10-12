import { server } from "./src/App.js";
import { socketHandler } from "./src/SockerApp.js";

const PORT = process.env.PORT;

server.listen(PORT, () => {
  socketHandler();
  console.log("app running on port " + PORT);
});
