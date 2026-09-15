import Videos from "../models/Video.js";

export const uploadVideo = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "Please upload a valid video file." });
  }

  try {
    const file = new Videos({
      videotitle: req.body.videotitle,
      filename: req.file.originalname,
      filetype: req.file.mimetype,
      filepath: req.file.path,
      filesize: req.file.size,
      videochanel: req.body.videochanel,
      uploader: req.body.uploader,
    });
    await file.save();
    return res.status(200).json({ message: "file uploaded successfully" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "something went wrong" });
  }
};

export const getAllVideo = async (req, res) => {
  try {
    const file = await Videos.find();
    res.status(200).send(file);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "something went wrong" });
  }
};
