import axios from 'axios';
import { getToken, clearToken } from '../lib/storage.js';

export const AUTH_EXPIRED_EVENT = 'jamii:auth-expired';

// A 401 from these endpoints means "those credentials were wrong", not "your
// session ended" — signing someone out of their own failed sign-in attempt
// would clear the session they are trying to create.
const CREDENTIAL_CHECK_PATHS = ['/auth/login', '/auth/register', '/auth/password'];

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5007/api/v1',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? '';
    const isCredentialCheck = CREDENTIAL_CHECK_PATHS.some((path) => url.startsWith(path));

    if (error.response?.status === 401 && !isCredentialCheck) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    return Promise.reject(error);
  }
);

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message || error?.message || fallback;

export default apiClient;
