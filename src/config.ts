// Base URL configuration for the application
// This should match the directory where the app is served from
export const BASE_URL = import.meta.env.VITE_BASE_URL || '/'

// API URL configuration - defaults to /api/ for local development
// Can be overridden with VITE_API_URL for production deployment
export const API_URL = import.meta.env.VITE_API_URL || '/api/api.php'

// Ensure BASE_URL ends with a slash for consistent URL building
export const API_BASE_URL = BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/'