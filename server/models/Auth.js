import mongoose from "mongoose";

const userSchema=new mongoose.Schema({
  email:{type:"string",required:"true"},
  name:{type:"string",required:"true"},
  channelName: {type:"string"},
  description:{type:"string"},
  image:{type:"string"},
  joinedOn: {type: Date, default:Date.now}
})

export default mongoose.model("user",userSchema)