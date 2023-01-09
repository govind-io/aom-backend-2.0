import express from "express";
import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import { database } from "./database/index.js";
import { AppAuth } from "./middleware/AppAuth.js";
import jsonwebtoken from "jsonwebtoken";
import { RoomAuth } from "./middleware/RoomAuth.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __publicdir = path.join(__dirname, "../public");

//certificates
// const certicateOptions={
//   key:readFileSync(`${__dirname}/SSL/key.pem` ,"utf-8"),
//   cert:readFileSync(`${__dirname}/SSL/cert.pem` ,"utf-8")
// }

export const app = express();
export const server = createServer(app);
export const io = new Server(server, { cors: { origin: "*" } });

//app configs

app.use(express.json());
app.use(express.static(__publicdir));

//allow cross origin
app.use(cors());

app.post("/generate-token", AppAuth, async (req, res) => {
  const client = req.client;

  const { room } = req.body;

  const token = await jsonwebtoken.sign(
    { roomname: room, id: client._id.toString() },
    process.env.SECRET_KEY,
    { expiresIn: "24h" }
  );

  res.status(200).send({ token });
});

app.get("/participants", RoomAuth, async (req, res) => {
  return res.status(200).send({ participants: req.room.participants });
});

app.get("/messages", RoomAuth, async (req, res) => {
  return res.status(200).send({ messages: req.room.messages });
});

app.get("/healthcheck", (req, res) => {
  if (mongoose.connection.readyState === 1) {
    return res.status(200).send("Ok");
  }
  return res.status(503).send("Database not connected");
});

app.get("*", async (req, res) => {
  res.status(404).send("Not found");
});
