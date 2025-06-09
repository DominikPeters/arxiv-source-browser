// Base URL configuration for the application
// This should match the directory where the app is served from
export const BASE_URL = import.meta.env.VITE_BASE_URL || '/'

// Ensure BASE_URL ends with a slash for consistent URL building
export const API_BASE_URL = BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/'