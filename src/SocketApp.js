import { io } from "./App.js";
import { Client } from "./database/Models/clients.js";
import jsonwebtoken from "jsonwebtoken"
import { Room } from "./database/Models/rooms.js";



export const socketHandler = async () => {

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      socket.disconnect()
    }

    try {
      const { id, roomname } = jsonwebtoken.verify(token, process.env.SECRET_KEY)


      const client = await Client.findById(id)

      if (!client) return socket.disconnect()

      const rooms = await client.populate({
        path: "room", match: {
          name: roomname
        },
        option: {
          limit: 1
        }
      })


      if (rooms.room.length === 0) {
        const room = new Room({ name: roomname, owner: client._id })

        try {
          await room.save()
          rooms.room.push(room)
        } catch (e) {
          console.log({ error: e, location: "saving room" })
        }

      }

      socket.handshake.query = { ...socket.handshake.query, room: rooms.room[0] }

      next()
    }
    catch (e) {
      socket.disconnect()
      console.log("disconnected", { error: e, location: "Initiating socket connection" })
    }

  });

  io.on("connection", async (socket) => {
    const { uid, role, room } = socket.handshake.query

    let Existing = room.participants.filter((item) => item.name.split("-")[0] === uid)
    Existing = Existing[Existing.length - 1]

    if (Existing) {
      const name = uid.split("-")[0]
      const sequence = Existing.name.split("-")[1] || "0"
      const newUid = `${name}-${parseInt(sequence) + 1}`

      room.participants = room.participants.concat({ role, name: newUid, socketId: socket.id })
    }
    else {
      room.participants = room.participants.concat({ role, name: uid, socketId: socket.id })
    }


    let updatedParticipants = false

    try {
      await Room.findByIdAndUpdate(room._id, { participants: room.participants })
      updatedParticipants = true
    }
    catch (e) {
      console.log({ error: e, location: "adding participants" })
      socket.disconnect()
    }

    if (!updatedParticipants) return

    socket.join(room.name)

    socket.to(room.name).emit("user-joined", { uid, role })

    socket.emit("connected", { id: socket.id });

    socket.on("disconnect", async () => {
      socket.to(room.name).emit("user-left", { uid, role })
      try {
        room.participants = room.participants.filter(item => item.name !== uid)
        await Room.findByIdAndUpdate(room._id, { participants: room.participants })
      } catch (e) {
        console.log({ error: e, location: "removing participants" })
      }
    })

    //custom event handling from here
    socket.on("send-message", async ({ content }, callback) => {
      const data = {
        content,
        date: new Date().getTime(),
        by: uid,
      };

      const localRoom = Room.findById(room._id)

      localRoom.messages = localRoom.messages.concat(data)

      await Room.findByIdAndUpdate(room._id, { messages: localRoom.messages })


      io.to(room.name).emit("message", data);
      callback();
    });

  });
};
