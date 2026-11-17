"use client";

import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { auth, provider } from "./firebase";
import axiosInstance from "./axiosInstance";

/**
 * @typedef {"auto" | "light" | "dark"} ThemePreference
 * @typedef {{ _id: string, id?: string, name: string, email?: string, image?: string, channelName?: string, description?: string, role?: "user" | "admin", themePreference?: ThemePreference, subscriptionPlan?: "Free" | "Bronze" | "Silver" | "Gold", subscriptionExpiry?: string, joinedOn?: string }} AppUser
 * @typedef {{ challengeId: string, email: string, expiresAt: string }} LoginChallenge
 * @typedef {Object} UserContextValue
 * @property {AppUser | null} user
 * @property {(user: AppUser) => void} logIn
 * @property {() => Promise<boolean>} logOut
 * @property {() => Promise<void>} handleGoogleSignIn
 * @property {LoginChallenge | null} loginChallenge
 * @property {(options: { code: string, trustDevice: boolean }) => Promise<boolean>} verifyLoginOtp
 * @property {() => Promise<boolean>} cancelLogin
 * @property {boolean} authPending
 * @property {string} authError
 * @property {() => Promise<void> | null} retryLogin
 * @property {"light" | "dark"} theme
 * @property {(preference: ThemePreference) => Promise<boolean>} changeThemePreference
 */
const userContext = createContext(/** @type {UserContextValue | null} */ (null));

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.message || error?.message || fallback;

const getAutomaticTheme = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour >= 5 && hour < 12 ? "light" : "dark";
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(getAutomaticTheme);
  const [loginChallenge, setLoginChallenge] = useState(null);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const loginInFlight = useRef(null);

  const logIn = useCallback((userdata) => {
    setUser(userdata);
  }, []);

  const startLogin = useCallback(async (firebaseUser) => {
    if (!firebaseUser || loginInFlight.current === firebaseUser.uid) return;
    loginInFlight.current = firebaseUser.uid;
    setAuthPending(true);
    setAuthError("");
    try {
      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.post(
        "/user/login",
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data.requiresOtp) {
        setUser(null);
        setLoginChallenge(response.data);
        return;
      }
      setLoginChallenge(null);
      setUser(response.data.result);
      setTheme(response.data.effectiveTheme || getAutomaticTheme());
    } catch (error) {
      setUser(null);
      setAuthError(getErrorMessage(error, "Secure sign-in could not be completed."));
    } finally {
      loginInFlight.current = null;
      setAuthPending(false);
    }
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    if (auth.currentUser) {
      await startLogin(auth.currentUser);
      return;
    }
    setAuthError("");
    setAuthPending(true);
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      setAuthPending(false);
      setAuthError(getErrorMessage(error, "Google sign-in could not be completed."));
    }
  }, [startLogin]);

  const verifyLoginOtp = useCallback(async ({ code, trustDevice }) => {
    if (!loginChallenge?.challengeId) return false;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setAuthError("Sign in again before entering the verification code.");
      return false;
    }
    setAuthPending(true);
    setAuthError("");
    try {
      const token = await firebaseUser.getIdToken();
      const response = await axiosInstance.post(
        "/user/login/verify-otp",
        {
          challengeId: loginChallenge.challengeId,
          code,
          trustDevice,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setLoginChallenge(null);
      setUser(response.data.result);
      setTheme(response.data.effectiveTheme || getAutomaticTheme());
      return true;
    } catch (error) {
      const message = getErrorMessage(error, "The verification code could not be checked.");
      if (error?.response?.data?.attemptsRemaining === 0) {
        setLoginChallenge(null);
      }
      setAuthError(message);
      return false;
    } finally {
      setAuthPending(false);
    }
  }, [loginChallenge]);

  const logOut = useCallback(async () => {
    setAuthPending(true);
    setAuthError("");
    let logoutFailed = false;
    try {
      await axiosInstance.post("/user/logout");
    } catch (error) {
      logoutFailed = true;
      setAuthError(getErrorMessage(error, "The secure session could not be revoked."));
      console.error("Server sign-out failed:", error);
    } finally {
      try {
        await signOut(auth);
      } catch (error) {
        setAuthError(getErrorMessage(error, "Google sign-out could not be completed."));
        console.error("Google sign-out failed:", error);
      }
      setUser(null);
      setLoginChallenge(null);
      setTheme(getAutomaticTheme());
      setAuthPending(false);
    }
    return !logoutFailed;
  }, []);

  const changeThemePreference = useCallback(async (themePreference) => {
    if (!user) return false;
    setAuthError("");
    try {
      const response = await axiosInstance.patch("/user/theme", { themePreference });
      setUser(response.data.result);
      setTheme(response.data.effectiveTheme);
      return true;
    } catch (error) {
      setAuthError(getErrorMessage(error, "Theme preference could not be saved."));
      return false;
    }
  }, [user]);

  useEffect(() => {
    void getRedirectResult(auth).catch((error) => {
      setAuthError(getErrorMessage(error, "Google sign-in could not be completed."));
    });
    const handleAuthRequired = () => {
      if (auth.currentUser) void startLogin(auth.currentUser);
    };
    window.addEventListener("app-auth-required", handleAuthRequired);
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        void startLogin(firebaseUser);
      } else {
        loginInFlight.current = null;
        setUser(null);
        setLoginChallenge(null);
        setAuthPending(false);
      }
    });
    return () => {
      unsubscribe();
      window.removeEventListener("app-auth-required", handleAuthRequired);
    };
  }, [startLogin]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <userContext.Provider
      value={{
        user,
        logIn,
        logOut,
        handleGoogleSignIn,
        loginChallenge,
        verifyLoginOtp,
        cancelLogin: logOut,
        authPending,
        authError,
        retryLogin: () => auth.currentUser && startLogin(auth.currentUser),
        theme,
        changeThemePreference,
      }}
    >
      {children}
    </userContext.Provider>
  );
};

export const useUser = () =>
  /** @type {UserContextValue} */ (useContext(userContext));
