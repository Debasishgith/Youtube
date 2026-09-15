import express from "express";
import { getUser, logIn, updateProfile } from "../controllers/auth.js";

const routes = express.Router();

routes.get("/:id", getUser);
routes.post("/login", logIn);
routes.patch("/update/:id", updateProfile);

export default routes;
