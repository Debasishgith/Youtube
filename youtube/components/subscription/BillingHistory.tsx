"use client";

import { formatDate, formatPrice } from "@/lib/subscriptionHelpers";
import type { BillingTransaction } from "@/lib/subscriptionTypes";

interface BillingHistoryProps {
  signedIn: boolean;
  loading: boolean;
  transactions: BillingTransaction[];
}

export default function BillingHistory({
  signedIn,
  loading,
  transactions,
}: BillingHistoryProps) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b p-5">
        <h2 className="text-xl font-semibold">Billing history</h2>
        <p className="mt-1 text-sm text-gray-600">
          One-time payments, invoice references and access periods.
        </p>
      </div>
      {!signedIn ? (
        <p className="p-5 text-sm text-gray-600">
          Sign in to view billing history.
        </p>
      ) : transactions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-190px text-left text-sm">
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
              {transactions.map((transaction) => (
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
  );
}
