import express from "express";
import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const __publicdir = path.join(__dirname, "../public");

export const app = express();
export const server = createServer(app);
export const io = new Server(server, { cors: { origin: "*" } });

//app configs

app.use(express.json());
app.use(express.static(__publicdir));

//allow cross origin
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept,Authorization"
  );
  res.header("Access-control-Allow-Methods", "GET, PATCH, POST, PUT");
  next();
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
