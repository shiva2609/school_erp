import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

let csrfTokenFromResponse = '';

api.interceptors.request.use((config) => {
  // Let the browser set multipart boundaries; default JSON Content-Type breaks file uploads.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const h = config.headers;
    if (h && typeof (h as { delete?: (k: string) => void }).delete === 'function') {
      (h as { delete: (k: string) => void }).delete('Content-Type');
    } else if (h && typeof h === 'object') {
      delete (h as Record<string, unknown>)['Content-Type'];
    }
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    (config.headers as Record<string, string>)['X-School-Origin-Host'] = window.location.hostname;
  }
  if (csrfTokenFromResponse) {
    config.headers['X-CSRFToken'] = csrfTokenFromResponse;
  } else if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(^|;\s*)csrftoken=([^;]*)/);
    if (match && match[2]) {
      config.headers['X-CSRFToken'] = match[2];
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Capture CSRF token if backend sends it in JSON body (solves cross-domain cookie reading issue)
    if (response.data && response.data.csrf_token) {
      csrfTokenFromResponse = response.data.csrf_token;
    }
    return response;
  },
  async (error) => {
    // If 401, we might want to trigger a refresh logic here or redirect to login.
    const originalRequest = error.config;
    
    // Do not intercept or retry 401s for login requests themselves
    if (
      originalRequest.url &&
      (originalRequest.url.includes('auth/login/') ||
        originalRequest.url.includes('auth/mfa/verify/'))
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}auth/refresh/`,
          {},
          { withCredentials: true }
        );
        return api(originalRequest);
      } catch (e) {
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
