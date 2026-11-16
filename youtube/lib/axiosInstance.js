import axios from "axios";
import { auth } from "./firebase";

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  withCredentials: true,
});

axiosInstance.interceptors.request.use(async (config) => {
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    const token = await firebaseUser.getIdToken();
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const code = error?.response?.data?.code;
    if (
      typeof window !== "undefined" &&
      ["APP_SESSION_REQUIRED", "APP_SESSION_INVALID", "APP_SESSION_REVERIFY"].includes(code)
    ) {
      window.dispatchEvent(new CustomEvent("app-auth-required"));
    }
    return Promise.reject(error);
  },
);

export default axiosInstance;
