import type { SubscriptionPlan } from "./subscriptionTypes";

export const subscriptionPlans: SubscriptionPlan[] = [
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
];
