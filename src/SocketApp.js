import { io } from "./App.js";

export const socketHandler = () => {
  io.use(async (socket, next) => {
    if(process.env.TOKEN===socket.handshake.auth.token){
      return next()
    }
    else{
      socket.disconnect()
      return next(new Error("Auth failed"));
    }
  });

  io.on("connection", async (socket) => {
    const {name,role,room}=socket.handshake.query

    socket.join(room)

    socket.to(room).emit("user-joined",{name,role})

    socket.emit("connected", { id: socket.id });
  });
};
