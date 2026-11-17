"use client";

import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosInstance";
import { useUser } from "@/lib/authContext";
import SecurityRecordCard from "@/components/security/SecurityRecordCard";
import {
  describeDevice,
  describeLocation,
  formatSecurityDate,
  getSecurityErrorMessage,
} from "@/lib/securityHelpers";
import type { SecurityOverview } from "@/lib/securityTypes";

const AccountSecurityPage = () => {
  const { user, logOut } = useUser();
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axiosInstance.get<SecurityOverview>("/user/security");
      setOverview(response.data);
    } catch (requestError: unknown) {
      setError(
        getSecurityErrorMessage(
          requestError,
          "Account security activity could not be loaded.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadOverview]);

  const revoke = async (path: "sessions" | "devices", id: string) => {
    setActionId(id);
    setError("");
    try {
      const response = await axiosInstance.delete<{ currentSessionRevoked: boolean }>(
        `/user/security/${path}/${id}`,
      );
      if (response.data.currentSessionRevoked) {
        await logOut();
        return;
      }
      await loadOverview();
    } catch (requestError: unknown) {
      setError(
        getSecurityErrorMessage(
          requestError,
          "The selected session or device could not be revoked.",
        ),
      );
    } finally {
      setActionId("");
    }
  };

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-4xl p-6">
        <h1 className="text-2xl font-semibold">Account security</h1>
        <p className="mt-3 text-muted-foreground">Sign in to review your account security.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Account security</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review sign-in attempts, active sessions, and trusted devices.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">Loading security activity...</p>}

      {!loading && overview && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Active sessions</h2>
            {overview.sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No active sessions found.</p>
            )}
            {overview.sessions.map((session) => (
              <SecurityRecordCard
                key={session._id}
                record={session}
                activityLabel="active"
                isCurrentSession={session._id === overview.currentSessionId}
                isRevoking={actionId === session._id}
                onRevoke={() => void revoke("sessions", session._id)}
              />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Trusted devices</h2>
            {overview.devices.length === 0 && (
              <p className="text-sm text-muted-foreground">No trusted devices found.</p>
            )}
            {overview.devices.map((device) => (
              <SecurityRecordCard
                key={device._id}
                record={device}
                activityLabel="used"
                isRevoking={actionId === device._id}
                onRevoke={() => void revoke("devices", device._id)}
              />
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Recent login activity</h2>
            {overview.events.length === 0 && (
              <p className="text-sm text-muted-foreground">No login activity found.</p>
            )}
            {overview.events.map((event) => (
              <article key={event._id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {event.eventType.replaceAll("_", " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {event.outcome.replaceAll("_", " ")} ·{" "}
                      {describeDevice(event.metadata)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {event.metadata?.ipAddress || "IP unavailable"} ·{" "}
                      {describeLocation(event.metadata)}
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {formatSecurityDate(event.createdAt)}
                  </time>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
};

export default AccountSecurityPage;
