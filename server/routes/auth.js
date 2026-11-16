import express from "express";
import { getUser, updateProfile } from "../controllers/auth.js";
import {
  getSecurityOverview,
  loginStart,
  logout,
  revokeLoginSession,
  revokeTrustedDevice,
  updateThemePreference,
  verifyLoginOtp,
} from "../controllers/loginSecurity.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";

const routes = express.Router();

routes.get("/security", verifyFirebaseToken, getSecurityOverview);
routes.delete(
  "/security/sessions/:sessionId",
  verifyFirebaseToken,
  revokeLoginSession,
);
routes.delete(
  "/security/devices/:deviceId",
  verifyFirebaseToken,
  revokeTrustedDevice,
);
routes.patch("/theme", verifyFirebaseToken, updateThemePreference);
routes.post("/login", loginStart);
routes.post("/login/verify-otp", verifyLoginOtp);
routes.post("/logout", logout);
routes.get("/:id", getUser);
routes.patch("/update/:id", verifyFirebaseToken, updateProfile);

export default routes;
