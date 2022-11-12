import mongoose from "mongoose";
const url = process.env.MONGO_URL;
export const database = mongoose.connect(
  url,
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "Meet",
  },
  (err) => {
    console.log("connected to db");
  }
);