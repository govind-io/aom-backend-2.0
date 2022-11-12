//import jsonwebtoken from "jsonwebtoken";
import mongoose from "mongoose";
//import { ACCESS_EXPIRY, REFRESH_EXPIRY } from "../../../config/constants";
import validator from "validator";
// import bcrypt from "bcrypt";
// const secretkey = process.env.SECRET_KEY;
const clientSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    validate: (val) => {
      if (val.length < 6) {
        throw new Error("Name should be minimum 6 character long");
      }
    },
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    validate(val) {
      if (!validator.isEmail(val)) {
        throw new Error("Please enter a valid email address");
      }
    },
  },
  token:
  {
    type: String,
    unique: true
  },

  avatar: {
    type: Buffer,
  },
});

clientSchema.virtual("room", {
  ref: "Room",
  localField: "_id",
  foreignField: "owner",
});

// //user generated instance methods here
// clientSchema.methods.generateRefreshToken = async function () {
//   const user = this;
//   const refresh = jsonwebtoken.sign({ id: user._id.toString() }, secretkey, {
//     expiresIn: REFRESH_EXPIRY,
//   });

//   return { refresh };
// };

// clientSchema.methods.generateAccessToken = async function () {
//   const user = this;

//   const access = jsonwebtoken.sign({ id: user._id.toString() }, secretkey, {
//     expiresIn: ACCESS_EXPIRY,
//   });

//   return { access };
// };

clientSchema.methods.toJSON = function () {
  const user = this;
  const userobject = user.toObject();
  delete userobject.password;
  delete userobject.tokens;
  delete userobject.avatar;
  return userobject;
};

// clientSchema.statics.findByCredentials = async function (email, password) {
//   let user = await User.findOne({ email });

//   if (!user) {
//     throw new Error("no such user found");
//   }
//   const ismatch = await bcrypt.compare(password, user.password);

//   if (!ismatch) {
//     throw new Error("Login error");
//   }

//   return user;
// };

// clientSchema.pre("save", async function (next) {
//   const user = this;
//   if (user.isModified("password")) {
//     user.password = await bcrypt.hash(user.password, 8);
//   }
//   next();
// });

export const Client = mongoose.model("Client", clientSchema);
