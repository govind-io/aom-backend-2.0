import jsonwebtoken from "jsonwebtoken"
import { Client } from "../database/Models/clients.js"

export const AppAuth = async (req, res, next) => {

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

    const client = await Client.findById(data.id)

    if (!client) {
        return res.status(404).send("Client not found")
    }

    req.client = client

    next()
}