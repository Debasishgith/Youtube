"use client";

import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscriptionPlans } from "@/lib/subscriptionPlans";
import type {
  PaidPlanName,
  PlanName,
  SubscriptionPlan,
} from "@/lib/subscriptionTypes";

interface PlanCardProps {
  plan: SubscriptionPlan;
  currentPlan: PlanName;
  isCurrentPlan: boolean;
  renewalCancelled: boolean;
  canPurchase: boolean;
  disabled: boolean;
  loading: boolean;
  onChoose: (plan: PaidPlanName) => void;
}

const getButtonLabel = (
  plan: SubscriptionPlan,
  currentPlan: PlanName,
  renewalCancelled: boolean,
) => {
  if (renewalCancelled) return "Renew plan";
  if (currentPlan === plan.name) return "Renew this plan";
  if (currentPlan === "Free") return `Choose ${plan.name}`;

  const currentAmount =
    subscriptionPlans.find((item) => item.name === currentPlan)?.amount ?? 0;
  return plan.amount > currentAmount
    ? `Upgrade to ${plan.name}`
    : `Switch to ${plan.name}`;
};

export default function PlanCard({
  plan,
  currentPlan,
  isCurrentPlan,
  renewalCancelled,
  canPurchase,
  disabled,
  loading,
  onChoose,
}: PlanCardProps) {
  const isPaidPlan = plan.name !== "Free";

  return (
    <article
      className={`flex flex-col rounded-xl border bg-white p-6 ${
        isCurrentPlan
          ? "border-red-500 ring-2 ring-red-100"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{plan.name}</h2>
        {isCurrentPlan ? (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
            Current plan
          </span>
        ) : plan.name === "Gold" ? (
          <Sparkles className="h-5 w-5 text-amber-500" />
        ) : null}
      </div>
      <p className="mt-5 text-3xl font-bold">
        {plan.amount === 0 ? "Free" : `₹${plan.amount}`}
        {isPaidPlan && canPurchase && (
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
          <dt className="font-medium text-gray-900">Daily downloads</dt>
          <dd className="mt-1 text-gray-600">
            {plan.downloads} video{plan.downloads === 1 ? "" : "s"} per day
            {" · resets at midnight IST"}
          </dd>
        </div>
        {["One-time payment", "30 days of access", "No automatic renewal"].map(
          (feature) => (
            <dd key={feature} className="flex items-center gap-2 text-gray-700">
              <Check className="h-4 w-4 shrink-0 text-green-600" />
              {feature}
            </dd>
          ),
        )}
      </dl>
      {isPaidPlan && (
        <Button
          className="mt-6 w-full"
          variant={isCurrentPlan ? "outline" : "default"}
          disabled={disabled}
          onClick={() => {
            if (plan.name !== "Free") onChoose(plan.name);
          }}
        >
          {loading ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              Opening checkout…
            </>
          ) : (
            getButtonLabel(plan, currentPlan, renewalCancelled)
          )}
        </Button>
      )}
    </article>
  );
}
