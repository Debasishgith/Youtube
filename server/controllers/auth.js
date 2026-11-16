import mongoose from "mongoose";
import users from "../models/Auth.js";

export const getUser = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  try {
    const user = await users.findById(_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong" });
  }
};

export const updateProfile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelName, description } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "Invalid user ID." });
  }
  if (String(req.appUser._id) !== _id) {
    return res.status(403).json({ message: "You can only update your own profile." });
  }
  try {
    const updatedData = await users.findByIdAndUpdate(
      _id,
      {
        $set: { channelName, description },
      },
      { new: true },
    );
    res.status(201).json(updatedData);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong" });
  }
};
