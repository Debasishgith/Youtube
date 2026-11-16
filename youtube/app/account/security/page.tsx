"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import axiosInstance from "@/lib/axiosInstance";
import { useUser } from "@/lib/authContext";
import { Button } from "@/components/ui/button";

type SecurityMetadata = {
  ipAddress?: string | null;
  browser?: string;
  browserVersion?: string | null;
  os?: string;
  osVersion?: string | null;
  deviceType?: string;
  deviceModel?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

type LoginEvent = {
  _id: string;
  eventType: string;
  outcome: string;
  createdAt: string;
  metadata?: SecurityMetadata;
};

type LoginSession = {
  _id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  metadata?: SecurityMetadata;
};

type TrustedDevice = {
  _id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  metadata?: SecurityMetadata;
};

type SecurityOverview = {
  events: LoginEvent[];
  sessions: LoginSession[];
  devices: TrustedDevice[];
  currentSessionId: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));

const describeDevice = (metadata?: SecurityMetadata) => {
  if (!metadata) return "Device information unavailable";
  const browser = [metadata.browser, metadata.browserVersion]
    .filter(Boolean)
    .join(" ");
  const os = [metadata.os, metadata.osVersion].filter(Boolean).join(" ");
  return [
    browser || "Unknown browser",
    os || "Unknown operating system",
    [metadata.deviceType, metadata.deviceModel].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");
};

const describeLocation = (metadata?: SecurityMetadata) =>
  [metadata?.city, metadata?.state, metadata?.country]
    .filter(Boolean)
    .join(", ") || "Location unavailable";

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

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
      setError(getRequestErrorMessage(requestError, "Account security activity could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    axiosInstance
      .get<SecurityOverview>("/user/security")
      .then((response) => {
        if (active) setOverview(response.data);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            getRequestErrorMessage(
              requestError,
              "Account security activity could not be loaded.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const revoke = async (path: string, id: string) => {
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
        getRequestErrorMessage(
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
              <article key={session._id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {describeDevice(session.metadata)}
                      {session._id === overview.currentSessionId && (
                        <span className="ml-2 text-xs text-muted-foreground">(this session)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {session.metadata?.ipAddress || "IP unavailable"} ·{" "}
                      {describeLocation(session.metadata)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last active {formatDate(session.lastUsedAt)} · Expires{" "}
                      {formatDate(session.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === session._id}
                    onClick={() => void revoke("sessions", session._id)}
                  >
                    {actionId === session._id ? "Revoking..." : "Revoke"}
                  </Button>
                </div>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">Trusted devices</h2>
            {overview.devices.length === 0 && (
              <p className="text-sm text-muted-foreground">No trusted devices found.</p>
            )}
            {overview.devices.map((device) => (
              <article key={device._id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">{describeDevice(device.metadata)}</p>
                    <p className="text-sm text-muted-foreground">
                      {device.metadata?.ipAddress || "IP unavailable"} ·{" "}
                      {describeLocation(device.metadata)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last used {formatDate(device.lastUsedAt)} · Trusted until{" "}
                      {formatDate(device.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionId === device._id}
                    onClick={() => void revoke("devices", device._id)}
                  >
                    {actionId === device._id ? "Revoking..." : "Revoke"}
                  </Button>
                </div>
              </article>
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
                    {formatDate(event.createdAt)}
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
