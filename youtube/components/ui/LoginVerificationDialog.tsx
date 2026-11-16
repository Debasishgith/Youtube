"use client";

import { FormEvent, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { useUser } from "@/lib/authContext";

const LoginVerificationDialog = () => {
  const {
    loginChallenge,
    verifyLoginOtp,
    cancelLogin,
    authPending,
    authError,
  } = useUser();
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await verifyLoginOtp({ code, trustDevice });
  };

  const handleCancel = async () => {
    setCode("");
    await cancelLogin();
  };

  return (
    <Dialog
      open={Boolean(loginChallenge)}
      onOpenChange={(open) => {
        if (!open && !authPending) void handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify it&apos;s you</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Enter the verification code sent to {loginChallenge?.email}.
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="login-otp">Email verification code</Label>
            <Input
              id="login-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </div>
          <div className="flex items-start gap-2">
            <input
              id="trust-device"
              type="checkbox"
              className="mt-1"
              checked={trustDevice}
              onChange={(event) => setTrustDevice(event.target.checked)}
            />
            <Label htmlFor="trust-device" className="font-normal leading-5">
              Trust this browser for 10 days. New IP addresses or locations may
              still require verification.
            </Label>
          </div>
          {authError && (
            <p role="alert" className="text-sm text-destructive">
              {authError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={authPending}
              onClick={() => void handleCancel()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={authPending || code.length !== 6}>
              {authPending ? "Verifying..." : "Verify and sign in"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LoginVerificationDialog;
