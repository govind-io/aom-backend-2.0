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
    if (err) {
      return console.log("could not connect to db", err.message);
    }
    console.log("connected to db");
  }
);
