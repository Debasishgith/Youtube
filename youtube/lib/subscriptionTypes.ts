export type PlanName = "Free" | "Bronze" | "Silver" | "Gold";
export type PaidPlanName = Exclude<PlanName, "Free">;

export interface SubscriptionPlan {
  name: PlanName;
  amount: number;
  downloads: number;
  access: string;
  description: string;
}

export interface BillingTransaction {
  _id: string;
  invoiceNumber: string;
  paymentId?: string;
  orderId?: string;
  plan: PaidPlanName;
  amount: number;
  currency: string;
  paymentStatus: string;
  subscriptionStart?: string;
  subscriptionExpiry?: string;
  renewal: boolean;
  createdAt: string;
  failureReason?: string;
}

export interface SubscriptionDashboard {
  plan: PlanName;
  status: string;
  subscriptionExpiry: string | null;
  remainingDays: number;
  nextRenewalAt: string | null;
  cancelAtCycleEnd: boolean;
  canCancelRenewal: boolean;
  billingHistory: BillingTransaction[];
}

export interface CheckoutResponse {
  order_id: string;
  amount: number;
  currency: string;
}

export interface RazorpayPaymentResponse {
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
