"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useUser } from "@/lib/authContext";
import axiosInstance from "@/lib/axiosInstance";
import { Button } from "@/components/ui/button";
import PlanCard from "@/components/subscription/PlanCard";
import BillingHistory from "@/components/subscription/BillingHistory";
import {
  formatDate,
  getApiError,
  loadRazorpay,
} from "@/lib/subscriptionHelpers";
import { subscriptionPlans } from "@/lib/subscriptionPlans";
import type {
  CheckoutResponse,
  PlanName,
  PaidPlanName,
  RazorpayPaymentResponse,
  SubscriptionDashboard,
} from "@/lib/subscriptionTypes";

export default function SubscriptionPage() {
  const { user, handleGoogleSignIn } = useUser();
  const [dashboard, setDashboard] = useState<SubscriptionDashboard | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [busyPlan, setBusyPlan] = useState<PlanName | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingVerification, setPendingVerification] =
    useState<RazorpayPaymentResponse | null>(null);
  const idempotencyKey = useRef("");
  const checkoutFinished = useRef(false);

  const loadDashboard = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!user || !firebaseUser) return;

    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.get<SubscriptionDashboard>(
        "/subscription/me",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setDashboard(response.data);
      setError("");
    } catch (requestError) {
      setError(
        getApiError(requestError, "Subscription details could not be loaded."),
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const verifyPayment = async (payment: RazorpayPaymentResponse) => {
    setPendingVerification(payment);
    setError("");
    setMessage("Verifying payment securely…");
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setError("Sign in again to verify this payment.");
      setMessage("");
      return;
    }

    try {
      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.post(
        "/subscription/verify-payment",
        payment,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setPendingVerification(null);
      idempotencyKey.current = "";
      setMessage(
        `Payment confirmed. Your ${response.data.plan} access is active through ${new Date(response.data.subscriptionExpiry).toLocaleDateString()}. Invoice ${response.data.invoiceNumber}.`,
      );
      await loadDashboard();
    } catch (verificationError) {
      setError(
        `${getApiError(verificationError, "Payment verification is still pending.")} Do not pay again; retry verification below.`,
      );
      setMessage("");
    }
  };

  const startCheckout = async (planName: PaidPlanName) => {
    if (!auth.currentUser) {
      setError("Sign in before choosing a plan.");
      return;
    }

    setBusyPlan(planName);
    setError("");
    setMessage("");
    checkoutFinished.current = false;

    try {
      const checkoutLoaded = await loadRazorpay();
      if (!checkoutLoaded || !window.Razorpay) {
        throw new Error(
          "Razorpay Checkout could not be loaded. Check your connection.",
        );
      }
      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key) {
        throw new Error(
          "Set NEXT_PUBLIC_RAZORPAY_KEY_ID in youtube/.env and restart Next.js.",
        );
      }

      const token = await auth.currentUser.getIdToken();
      if (!idempotencyKey.current) {
        idempotencyKey.current = window.crypto.randomUUID();
      }
      const response = await axiosInstance.post<CheckoutResponse>(
        "/subscription/create-order",
        { plan: planName },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": idempotencyKey.current,
          },
        },
      );

      const checkout = new window.Razorpay({
        key,
        order_id: response.data.order_id,
        amount: response.data.amount,
        currency: response.data.currency,
        name: "My-Youtube",
        description: `${planName} plan for 30 days`,
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        theme: { color: "#dc2626" },
        handler: async (payment) => {
          checkoutFinished.current = true;
          await verifyPayment(payment);
        },
        modal: {
          ondismiss: () => {
            if (checkoutFinished.current) return;
            checkoutFinished.current = true;
            idempotencyKey.current = "";
            setMessage("Checkout was closed. No payment was confirmed.");
            const currentUser = auth.currentUser;
            if (!currentUser) return;
            void currentUser.getIdToken().then((freshToken) =>
              axiosInstance
                .post(
                  "/subscription/abandon",
                  { orderId: response.data.order_id },
                  { headers: { Authorization: `Bearer ${freshToken}` } },
                )
                .catch((cancelError) => {
                  console.error(
                    "Unable to record dismissed checkout:",
                    cancelError,
                  );
                }),
            );
          },
        },
      });

      checkout.on("payment.failed", (failure) => {
        checkoutFinished.current = true;
        const paymentId = failure.error?.metadata?.payment_id;
        const orderId =
          failure.error?.metadata?.order_id || response.data.order_id;
        const currentUser = auth.currentUser;
        if (currentUser) {
          void currentUser.getIdToken().then((freshToken) =>
            axiosInstance
              .post(
                "/subscription/failure",
                {
                  orderId,
                  paymentId,
                  reason: failure.error?.description,
                },
                { headers: { Authorization: `Bearer ${freshToken}` } },
              )
              .catch((failureError) => {
                console.error("Unable to record failed payment:", failureError);
              }),
          );
        }
        idempotencyKey.current = "";
        setError(
          failure.error?.description ||
            "Payment failed. Your plan has not been changed.",
        );
      });

      checkout.open();
    } catch (checkoutError) {
      setError(getApiError(checkoutError, "Could not start checkout."));
    } finally {
      setBusyPlan(null);
    }
  };

  const cancelRenewal = async () => {
    if (
      !auth.currentUser ||
      !window.confirm(
        "Cancel automatic renewal? Your plan stays active until its expiry date.",
      )
    ) {
      return;
    }

    setBusyPlan("cancel");
    setError("");
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await axiosInstance.post(
        "/subscription/cancel",
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMessage(response.data.message);
      await loadDashboard();
    } catch (cancelError) {
      setError(
        getApiError(cancelError, "Subscription could not be cancelled."),
      );
    } finally {
      setBusyPlan(null);
    }
  };

  const currentPlan = dashboard?.plan || user?.subscriptionPlan || "Free";

  return (
    <main className="min-h-screen flex-1 bg-gray-50 px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <Download className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold">Membership plans</h1>

          <p className="mx-auto mt-2 max-w-3xl text-sm text-gray-500">
            Streaming quality, ad-free playback, watch-time limits and exclusive
            courses are not currently enforced by this platform.
          </p>
        </header>

        {!user ? (
          <section className="rounded-xl border bg-white p-6 text-center">
            <p className="mb-4 text-gray-700">
              Sign in to manage your plan or purchase access.
            </p>
            <Button onClick={handleGoogleSignIn}>Sign in</Button>
          </section>
        ) : (
          <section className="rounded-xl border bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-500">Current plan</p>
                <p className="text-xl font-semibold">
                  {loading ? "Loading…" : currentPlan}
                  {dashboard?.status && (
                    <span className="ml-2 text-sm font-normal capitalize text-gray-600">
                      · {dashboard.status}
                    </span>
                  )}
                </p>
                {dashboard?.subscriptionExpiry && (
                  <p className="mt-1 text-sm text-gray-600">
                    Access expires {formatDate(dashboard.subscriptionExpiry)} (
                    {dashboard.remainingDays} days remaining)
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {dashboard?.canCancelRenewal && (
                  <Button
                    variant="outline"
                    disabled={busyPlan !== null}
                    onClick={cancelRenewal}
                  >
                    {busyPlan === "cancel" ? "Cancelling…" : "Cancel renewal"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => void loadDashboard()}>
                  Refresh status
                </Button>
              </div>
            </div>
          </section>
        )}

        {(error || message) && (
          <p
            className={`rounded-lg p-4 text-sm ${
              error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
            }`}
            role={error ? "alert" : "status"}
          >
            {error || message}
          </p>
        )}
        {pendingVerification && (
          <Button
            variant="outline"
            disabled={busyPlan !== null}
            onClick={() => void verifyPayment(pendingVerification)}
          >
            Retry payment verification
          </Button>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {subscriptionPlans.map((plan) => {
            const isCurrentPlan = currentPlan === plan.name;
            return (
              <PlanCard
                key={plan.name}
                plan={plan}
                currentPlan={currentPlan}
                isCurrentPlan={isCurrentPlan}
                renewalCancelled={
                  isCurrentPlan && Boolean(dashboard?.cancelAtCycleEnd)
                }
                canPurchase={Boolean(user)}
                disabled={busyPlan !== null}
                loading={busyPlan === plan.name}
                onChoose={startCheckout}
              />
            );
          })}
        </section>

        <BillingHistory
          signedIn={Boolean(user)}
          loading={loading}
          transactions={dashboard?.billingHistory ?? []}
        />

        <footer className="text-center text-sm text-gray-600">
          Plan access is activated only after Razorpay verifies payment. Need
          help? Contact {process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support"}.
          {" · "}
          <Link className="underline" href="/downloads">
            View download history
          </Link>
        </footer>
      </div>
    </main>
  );
}
