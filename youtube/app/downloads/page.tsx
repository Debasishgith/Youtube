"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileVideo } from "lucide-react";
import axios from "axios";
import { auth } from "@/lib/firebase";
import axiosInstance from "@/lib/axiosInstance";
import { useUser } from "@/lib/authContext";

type DownloadStatus = "in_progress" | "completed" | "failed" | "interrupted";

interface DownloadEntry {
  _id: string;
  timestamp: string;
  status: DownloadStatus;
  fileSize?: number;
  subscriptionPlan?: string;
  quotaRemaining?: number;
  failureReason?: string;
  videoId?: {
    _id: string;
    videotitle: string;
    filepath?: string;
  } | null;
}

interface DownloadsResponse {
  quota: {
    plan: string;
    limit: number;
    used: number;
    remaining: number;
    resetsAt: string;
  };
  downloads: DownloadEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
}

const statusLabels: Record<DownloadStatus, string> = {
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
};

const formatFileSize = (size?: number) => {
  if (size === undefined) return "Unavailable";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatQuotaReset = (date: string) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

export default function DownloadsPage() {
  const { user } = useUser();
  const [data, setData] = useState<DownloadsResponse | null>(null);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDownloads = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!user || !firebaseUser) return;

    setLoading(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.get<DownloadsResponse>(
        "/download/me",
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            ...(status ? { status } : {}),
            sort,
            ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
            ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
            page,
            pageSize: 50,
          },
        },
      );
      setData(response.data);
    } catch (requestError: unknown) {
      const responseData = axios.isAxiosError(requestError)
        ? requestError.response?.data
        : undefined;
      setError(
        typeof responseData === "object" &&
          responseData !== null &&
          "message" in responseData &&
          typeof responseData.message === "string"
          ? responseData.message
          : "Download history could not be loaded. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [from, page, sort, status, to, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDownloads();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDownloads]);

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-5xl p-6">
        <h1 className="mb-2 text-2xl font-semibold">Downloads</h1>
        <p>Sign in to view your download history and quota.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Downloads</h1>
        <p className="text-sm text-gray-600">
          Review your download history and current plan quota.
        </p>
      </div>

      {data && (
        <section className="rounded-lg border bg-gray-50 p-4">
          <h2 className="font-medium">{data.quota.plan} plan</h2>
          <p className="mt-1 text-sm text-gray-700">
            {data.quota.remaining} of {data.quota.limit} downloads remaining
            today. Resets at {formatQuotaReset(data.quota.resetsAt)}.
          </p>
        </section>
      )}

      <section className="flex flex-wrap items-end gap-3" aria-label="Filters">
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            className="rounded border bg-white px-3 py-2"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            className="rounded border px-3 py-2"
            type="date"
            value={from}
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <input
            className="rounded border px-3 py-2"
            type="date"
            value={to}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Sort by date
          <select
            className="rounded border bg-white px-3 py-2"
            value={sort}
            onChange={(event) => {
              setPage(1);
              setSort(event.target.value);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </section>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {data && data.pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span>
            Showing {(page - 1) * data.pagination.pageSize + 1}–
            {Math.min(page * data.pagination.pageSize, data.pagination.total)} of{" "}
            {data.pagination.total} downloads
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 disabled:opacity-50"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <span>
              Page {data.pagination.page} of {Math.max(1, data.pagination.pages)}
            </span>
            <button
              type="button"
              className="rounded border px-3 py-1 disabled:opacity-50"
              onClick={() =>
                setPage((current) =>
                  Math.min(data.pagination.pages, current + 1),
                )
              }
              disabled={page >= data.pagination.pages || loading}
            >
              Next
            </button>
          </div>
        </div>
      )}
      {loading && <p className="text-sm text-gray-600">Loading downloads…</p>}
      {!loading && !error && data?.downloads.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Download className="mx-auto mb-3 h-8 w-8 text-gray-400" />
          <p className="font-medium">No downloads found</p>
          <p className="mt-1 text-sm text-gray-600">
            Completed and attempted downloads will appear here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data?.downloads.map((entry) => (
          <article key={entry._id} className="flex gap-4 rounded-lg border p-4">
            <Link
              className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100"
              href={entry.videoId ? `/watch/${entry.videoId._id}` : "/downloads"}
              aria-label={entry.videoId?.videotitle || "Unavailable video"}
            >
              {entry.videoId?.filepath ? (
                <video
                  className="h-full w-full object-cover"
                  src={`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/${entry.videoId.filepath}`}
                  preload="metadata"
                  muted
                  onLoadedMetadata={(event) => {
                    const preview = event.currentTarget;
                    if (Number.isFinite(preview.duration) && preview.duration > 0) {
                      preview.currentTime = Math.min(1, preview.duration / 2);
                    }
                  }}
                />
              ) : (
                <FileVideo className="h-8 w-8 text-gray-400" />
              )}
            </Link>
            <div className="min-w-0 flex-1">
              {entry.videoId ? (
                <Link
                  href={`/watch/${entry.videoId._id}`}
                  className="font-medium hover:underline"
                >
                  {entry.videoId.videotitle}
                </Link>
              ) : (
                <p className="font-medium">Unavailable video</p>
              )}
              <p className="mt-1 text-sm text-gray-600">
                {new Date(entry.timestamp).toLocaleString()}
              </p>
              <p className="text-sm text-gray-600">
                {statusLabels[entry.status]} · {formatFileSize(entry.fileSize)}
              </p>
              <p className="text-sm text-gray-600">
                {entry.subscriptionPlan || "Unknown"} plan ·{" "}
                {entry.quotaRemaining ?? "—"} downloads remaining at request
              </p>
              {entry.failureReason && (
                <p className="mt-1 text-sm text-red-600">
                  {entry.failureReason}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
