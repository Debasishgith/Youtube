"use client";

import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosInstance";
import { useUser } from "@/lib/authContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ReportComment {
  _id: string;
  commentbody: string;
  usercommented: string;
  deletedAt: string | null;
  moderationStatus: string;
  userid: { name: string; image?: string } | string;
}

interface Report {
  _id: string;
  reason: string;
  details: string;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  createdAt: string;
  commentId: ReportComment | null;
  reporterId: { name: string; image?: string } | null;
  history: Array<{
    action: string;
    fromStatus?: string;
    toStatus?: string;
    commentAction?: string;
    note?: string;
    createdAt: string;
  }>;
}

interface ModerationHistory {
  moderationStatus: string;
  deletedAt: string | null;
  history: Array<{
    action: string;
    previousBody?: string | null;
    nextBody?: string | null;
    note?: string | null;
    createdAt: string;
  }>;
  reports: Report[];
}

const getApiMessage = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }
  return error instanceof Error ? error.message : "The moderation request failed.";
};

export default function CommentModerationPage() {
  const { user } = useUser();
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("open");
  const [action, setAction] = useState<Record<string, string>>({});
  const [nextStatus, setNextStatus] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, ModerationHistory>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    if (user?.role !== "admin") return;
    setBusy(true);
    try {
      const response = await axiosInstance.get<Report[]>("/comment/admin/reports", {
        params: { status },
      });
      setReports(response.data);
      setError("");
    } catch (requestError) {
      setError(getApiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [status, user?.role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReports();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  const review = async (report: Report) => {
    setBusy(true);
    setError("");
    try {
      await axiosInstance.patch(`/comment/admin/reports/${report._id}`, {
        status: nextStatus[report._id] || "reviewed",
        action: action[report._id] || "none",
        note: notes[report._id] || "",
      });
      await loadReports();
    } catch (requestError) {
      setError(getApiMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async (commentId: string) => {
    try {
      const response = await axiosInstance.get<ModerationHistory>(
        `/comment/admin/history/${commentId}`,
      );
      setHistory((previous) => ({ ...previous, [commentId]: response.data }));
    } catch (requestError) {
      setError(getApiMessage(requestError));
    }
  };

  if (!user) {
    return <main className="flex-1 p-6">Sign in with an administrator account to review reports.</main>;
  }
  if (user.role !== "admin") {
    return <main className="flex-1 p-6">Administrator access is required.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Comment moderation</h1>
          <p className="text-sm text-muted-foreground">
            Reports are queued for review; dislikes never remove comments.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Status
          <select
            className="rounded-md border bg-background p-2"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="open">Open</option>
            <option value="reviewed">Reviewed</option>
            <option value="dismissed">Dismissed</option>
            <option value="actioned">Actioned</option>
          </select>
        </label>
      </header>

      {error && <p role="alert" className="rounded-md bg-muted p-3 text-sm">{error}</p>}
      {busy && <p className="text-sm text-muted-foreground">Loading moderation queue...</p>}
      {!busy && reports.length === 0 && (
        <p className="rounded-md border p-5 text-sm text-muted-foreground">No reports in this queue.</p>
      )}

      <div className="space-y-4">
        {reports.map((report) => {
          const author =
            report.commentId?.userid && typeof report.commentId.userid === "object"
              ? report.commentId.userid
              : null;
          return (
            <article key={report._id} className="space-y-4 rounded-lg border bg-background p-5">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={author?.image || ""} />
                  <AvatarFallback>{author?.name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{author?.name || report.commentId?.usercommented || "User"}</p>
                  <p className="text-xs text-muted-foreground">
                    Reported by {report.reporterId?.name || "User"} · {new Date(report.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="mb-1 text-xs font-semibold uppercase">{report.reason}</p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {report.commentId?.deletedAt
                    ? "Comment deleted"
                    : report.commentId?.commentbody || "Comment unavailable"}
                </p>
                {report.details && <p className="mt-2 text-sm text-muted-foreground">{report.details}</p>}
              </div>

              {report.commentId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadHistory(report.commentId!._id)}
                >
                  {history[report.commentId._id] ? "Refresh history" : "View history"}
                </Button>
              )}
              {report.commentId && history[report.commentId._id] && (
                <ol className="space-y-2 border-l pl-4 text-sm">
                  {history[report.commentId._id].history.map((entry, index) => (
                    <li key={`${entry.action}-${entry.createdAt}-${index}`}>
                      <strong>{entry.action}</strong> · {new Date(entry.createdAt).toLocaleString()}
                      {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                      {entry.previousBody && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs">Previous text</summary>
                          <p className="whitespace-pre-wrap">{entry.previousBody}</p>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <select
                  className="rounded-md border bg-background p-2 text-sm"
                  value={nextStatus[report._id] || "reviewed"}
                  onChange={(event) =>
                    setNextStatus((previous) => ({ ...previous, [report._id]: event.target.value }))
                  }
                >
                  <option value="reviewed">Reviewed</option>
                  <option value="dismissed">Dismiss report</option>
                  <option value="actioned">Actioned</option>
                </select>
                <select
                  className="rounded-md border bg-background p-2 text-sm"
                  value={action[report._id] || "none"}
                  onChange={(event) =>
                    setAction((previous) => ({ ...previous, [report._id]: event.target.value }))
                  }
                >
                  <option value="none">No comment action</option>
                  <option value="hide">Hide comment</option>
                  <option value="restore">Restore comment</option>
                  <option value="delete">Delete comment</option>
                </select>
                <Button disabled={busy} onClick={() => void review(report)}>
                  Save decision
                </Button>
              </div>
              <Textarea
                value={notes[report._id] || ""}
                maxLength={500}
                placeholder="Internal moderation note"
                onChange={(event) =>
                  setNotes((previous) => ({ ...previous, [report._id]: event.target.value }))
                }
              />
            </article>
          );
        })}
      </div>
    </main>
  );
}
