"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type GrecaptchaApi = {
  ready: (callback: () => void) => void;
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => number;
  reset: (widgetId?: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: GrecaptchaApi;
  }
}

const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

const GoogleRecaptcha = ({
  onChange,
  resetKey,
}: {
  onChange: (token: string | null) => void;
  resetKey: number;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.grecaptcha) {
      return;
    }

    let active = true;
    window.grecaptcha.ready(() => {
      if (
        !active ||
        widgetIdRef.current !== null ||
        !containerRef.current ||
        !window.grecaptcha
      ) {
        return;
      }
      widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => onChangeRef.current(token),
        "expired-callback": () => onChangeRef.current(null),
        "error-callback": () => onChangeRef.current(null),
      });
    });
    return () => {
      active = false;
    };
  }, [scriptReady]);

  useEffect(() => {
    if (resetKey > 0 && widgetIdRef.current !== null) {
      window.grecaptcha?.reset(widgetIdRef.current);
      onChangeRef.current(null);
    }
  }, [resetKey]);

  return (
    <div className="space-y-2" aria-live="polite">
      {siteKey ? (
        <>
          <Script
            src="https://www.google.com/recaptcha/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
          />
          <div ref={containerRef} />
        </>
      ) : (
        <p className="text-sm text-destructive">
          Google reCAPTCHA is not configured. Set NEXT_PUBLIC_RECAPTCHA_SITE_KEY.
        </p>
      )}
    </div>
  );
};

export default GoogleRecaptcha;
