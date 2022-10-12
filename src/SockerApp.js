import { io } from "./App.js";

export const socketHandler = () => {
  io.use(async (socket, next) => {
    next();
  });

  io.on("connection", async (socket) => {
    socket.emit("connected", { id: socket.id });
  });
};
