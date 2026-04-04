// Centralized configuration for API base URL
// Uses VITE_API_BASE_URL if defined (for production), otherwise defaults to local dev server
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
