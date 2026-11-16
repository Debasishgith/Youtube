import express from "express";
import {
  abandonOrderCheckout,
  cancelSubscription,
  createOrder,
  getSubscriptionDashboard,
  recordPaymentFailure,
  verifyOrderPayment,
} from "../controllers/subscription.js";
import { verifyFirebaseToken } from "../middleware/authFirebase.js";

const routes = express.Router();

routes.get("/me", verifyFirebaseToken, getSubscriptionDashboard);
routes.post("/create-order", verifyFirebaseToken, createOrder);
routes.post("/verify-payment", verifyFirebaseToken, verifyOrderPayment);
routes.post("/cancel", verifyFirebaseToken, cancelSubscription);
routes.post("/failure", verifyFirebaseToken, recordPaymentFailure);
routes.post("/abandon", verifyFirebaseToken, abandonOrderCheckout);

export default routes;
