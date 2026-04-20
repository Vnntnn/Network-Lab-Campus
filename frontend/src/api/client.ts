import axios from "axios";

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();

export const api = axios.create({
  baseURL: configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase : "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.detail ?? err.message ?? "Unknown error";
    return Promise.reject(new Error(message));
  }
);
