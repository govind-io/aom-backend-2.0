import jsonwebtoken from "jsonwebtoken"
import { Room } from "../database/Models/rooms.js"

export const RoomAuth = async (req, res, next) => {
    const token = req.header("Authorization")

    if (!token) {
        return res.status(401).send("Token not found")
    }

    let data;

    try {
        data = jsonwebtoken.verify(token, process.env.SECRET_KEY)
    } catch (e) {
        return res.status(401).send("Unauthorized Access")
    }

    const room = await Room.findOne({ name: data.roomname })

    if (!room) {
        return res.status(404).send("Room not found")
    }

    req.room = room

    next()
}