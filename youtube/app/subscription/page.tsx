"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Check, Download, LoaderCircle, Sparkles } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useUser } from "@/lib/authContext";
import axiosInstance from "@/lib/axiosInstance";
import { Button } from "@/components/ui/button";

type PlanName = "Free" | "Bronze" | "Silver" | "Gold";

interface BillingTransaction {
  _id: string;
  invoiceNumber: string;
  paymentId?: string;
  orderId?: string;
  plan: Exclude<PlanName, "Free">;
  amount: number;
  currency: string;
  paymentStatus: string;
  subscriptionStart?: string;
  subscriptionExpiry?: string;
  renewal: boolean;
  createdAt: string;
  failureReason?: string;
}

interface SubscriptionDashboard {
  plan: PlanName;
  status: string;
  subscriptionExpiry: string | null;
  remainingDays: number;
  nextRenewalAt: string | null;
  cancelAtCycleEnd: boolean;
  canCancelRenewal: boolean;
  billingHistory: BillingTransaction[];
}

interface CheckoutResponse {
  order_id: string;
  amount: number;
  currency: string;
}

interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string };
  theme: { color: string };
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (
        event: "payment.failed",
        handler: (response: {
          error?: {
            metadata?: {
              payment_id?: string;
              order_id?: string;
            };
            description?: string;
          };
        }) => void,
      ) => void;
    };
  }
}

const plans = [
  {
    name: "Free",
    amount: 0,
    downloads: 1,
    access: "Selected free videos",
    description: "Basic access to get started.",
  },
  {
    name: "Bronze",
    amount: 100,
    downloads: 5,
    access: "Free and Bronze videos",
    description: "More daily downloads and premium access.",
  },
  {
    name: "Silver",
    amount: 200,
    downloads: 15,
    access: "Free, Bronze and Silver videos",
    description: "Higher limits with expanded premium access.",
  },
  {
    name: "Gold",
    amount: 300,
    downloads: 30,
    access: "All plan-level video access",
    description: "The highest daily quota and plan access.",
  },
] as const;

const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const getApiError = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }
  const message = error.response?.data?.message;
  return typeof message === "string" ? message : fallback;
};

const formatDate = (date: string | null | undefined) =>
  date ? new Date(date).toLocaleString() : "Not scheduled";

const formatPrice = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);

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

  const startCheckout = async (planName: Exclude<PlanName, "Free">) => {
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
          {plans.map((plan) => {
            const selected = currentPlan === plan.name;
            const paidPlan = plan.name !== "Free";
            const renewalCancelled =
              selected && Boolean(dashboard?.cancelAtCycleEnd);
            return (
              <article
                key={plan.name}
                className={`flex flex-col rounded-xl border bg-white p-6 ${
                  selected
                    ? "border-red-500 ring-2 ring-red-100"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {selected ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                      Current plan
                    </span>
                  ) : plan.name === "Gold" ? (
                    <Sparkles className="h-5 w-5 text-amber-500" />
                  ) : null}
                </div>
                <p className="mt-5 text-3xl font-bold">
                  {plan.amount === 0 ? "Free" : `₹${plan.amount}`}
                  {paidPlan && (
                    <span className="ml-1 text-sm font-normal text-gray-500">
                      /30 days
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm text-gray-600">{plan.description}</p>
                <div className="my-5 h-px bg-gray-100" />
                <dl className="flex-1 space-y-4 text-sm">
                  <div>
                    <dt className="font-medium text-gray-900">Video access</dt>
                    <dd className="mt-1 text-gray-600">{plan.access}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-900">
                      Daily downloads
                    </dt>
                    <dd className="mt-1 text-gray-600">
                      {plan.downloads} video{plan.downloads === 1 ? "" : "s"}{" "}
                      per day
                      {" · resets at midnight IST"}
                    </dd>
                  </div>
                  {[
                    "One-time payment",
                    "30 days of access",
                    "No automatic renewal",
                  ].map((feature) => (
                    <dd
                      key={feature}
                      className="flex items-center gap-2 text-gray-700"
                    >
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                      {feature}
                    </dd>
                  ))}
                </dl>
                {paidPlan && user && (
                  <Button
                    className="mt-6 w-full"
                    variant={selected ? "outline" : "default"}
                    disabled={busyPlan !== null}
                    onClick={() =>
                      void startCheckout(plan.name as Exclude<PlanName, "Free">)
                    }
                  >
                    {busyPlan === plan.name ? (
                      <>
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        Opening checkout…
                      </>
                    ) : renewalCancelled ? (
                      "Renew plan"
                    ) : selected ? (
                      "Renew this plan"
                    ) : currentPlan === "Free" ? (
                      `Choose ${plan.name}`
                    ) : plan.amount >
                      (plans.find((item) => item.name === currentPlan)
                        ?.amount || 0) ? (
                      `Upgrade to ${plan.name}`
                    ) : (
                      `Switch to ${plan.name}`
                    )}
                  </Button>
                )}
              </article>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b p-5">
            <h2 className="text-xl font-semibold">Billing history</h2>
            <p className="mt-1 text-sm text-gray-600">
              One-time payments, invoice references and access periods.
            </p>
          </div>
          {!user ? (
            <p className="p-5 text-sm text-gray-600">
              Sign in to view billing history.
            </p>
          ) : dashboard?.billingHistory.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="p-4 font-medium">Date / invoice</th>
                    <th className="p-4 font-medium">Plan</th>
                    <th className="p-4 font-medium">Amount</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Payment / validity</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.billingHistory.map((transaction) => (
                    <tr key={transaction._id} className="border-t">
                      <td className="p-4">
                        {formatDate(transaction.createdAt)}
                        <div className="text-xs text-gray-500">
                          {transaction.invoiceNumber}
                        </div>
                      </td>
                      <td className="p-4">
                        {transaction.plan}
                        {transaction.renewal ? " · renewal" : ""}
                      </td>
                      <td className="p-4">
                        {formatPrice(transaction.amount, transaction.currency)}
                      </td>
                      <td className="p-4 capitalize">
                        {transaction.paymentStatus}
                      </td>
                      <td className="p-4">
                        <div>{transaction.paymentId || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {formatDate(transaction.subscriptionStart)} –{" "}
                          {formatDate(transaction.subscriptionExpiry)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-sm text-gray-600">
              {loading
                ? "Loading billing history…"
                : "No billing transactions yet."}
            </p>
          )}
        </section>

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
