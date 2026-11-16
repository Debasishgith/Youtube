"use client";

import { Button } from "@/components/ui/button";
import { describeDevice, describeLocation, formatSecurityDate } from "@/lib/securityHelpers";
import type { SecurityRecord } from "@/lib/securityTypes";

interface SecurityRecordCardProps {
  record: SecurityRecord;
  activityLabel: "active" | "used";
  isCurrentSession?: boolean;
  isRevoking: boolean;
  onRevoke: () => void;
}

export default function SecurityRecordCard({
  record,
  activityLabel,
  isCurrentSession = false,
  isRevoking,
  onRevoke,
}: SecurityRecordCardProps) {
  const expiryLabel =
    activityLabel === "active" ? "Expires" : "Trusted until";

  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium">
            {describeDevice(record.metadata)}
            {isCurrentSession && (
              <span className="ml-2 text-xs text-muted-foreground">
                (this session)
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            {record.metadata?.ipAddress || "IP unavailable"} ·{" "}
            {describeLocation(record.metadata)}
          </p>
          <p className="text-xs text-muted-foreground">
            Last {activityLabel} {formatSecurityDate(record.lastUsedAt)} ·{" "}
            {expiryLabel} {formatSecurityDate(record.expiresAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isRevoking}
          onClick={onRevoke}
        >
          {isRevoking ? "Revoking..." : "Revoke"}
        </Button>
      </div>
    </article>
  );
}
