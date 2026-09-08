import { getToken, clearToken } from '../lib/storage.js';

/*
 * A small fetch client, in place of axios.
 *
 * axios was 52KB (18.6KB gzipped) — after React itself, the largest thing in
 * the critical path, on an app that uses four of its verbs and none of its
 * features. This is the same contract in about seventy lines: the same
 * `{ data }` shape back, the same `error.response.status` and
 * `error.response.data` on failure, so `errorMessage` and the two call sites
 * that branch on a status code did not change.
 *
 * The contract is deliberately axios-shaped rather than fetch-shaped. A
 * fetch-shaped error would have meant editing every catch block in the app for
 * a saving that has nothing to do with them.
 *
 * Three things fetch does not do that are handled here: it does not reject on
 * a 4xx or 5xx, it does not parse JSON, and it does not serialise query
 * parameters.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5007/api/v1';

export const AUTH_EXPIRED_EVENT = 'jamii:auth-expired';

/*
 * Fired when the API is taking long enough that the reader deserves to be told.
 *
 * This deploys to a free hosting tier that sleeps after inactivity, and the
 * first request after that pays the whole cold start — measured at 23.1s
 * against 0.59s warm. Nothing was said about it, so the app looked broken
 * rather than slow, and the difference between those two is whether someone
 * waits or closes the tab. The socket already admits to reconnecting
 * (ConnectionStatus); this is the same admission for the REST side.
 */
export const API_SLOW_EVENT = 'jamii:api-slow';
export const API_AWAKE_EVENT = 'jamii:api-awake';

// Long enough that an ordinary slow request never trips it — a warm response
// is well under a second, and a notice that flickers on every page load is
// noise that teaches people to ignore it.
const SLOW_AFTER_MS = 4000;

let inflight = 0;
let slowTimer = null;
let announced = false;

const requestStarted = () => {
  inflight += 1;
  if (inflight === 1 && !slowTimer) {
    slowTimer = setTimeout(() => {
      announced = true;
      window.dispatchEvent(new Event(API_SLOW_EVENT));
    }, SLOW_AFTER_MS);
  }
};

const requestSettled = () => {
  // Never below zero: the count is what decides whether the notice comes down,
  // and one stray decrement would strand it on screen for the whole session.
  inflight = Math.max(0, inflight - 1);
  if (inflight > 0) return;
  clearTimeout(slowTimer);
  slowTimer = null;
  if (announced) {
    announced = false;
    window.dispatchEvent(new Event(API_AWAKE_EVENT));
  }
};

// A 401 from these endpoints means "those credentials were wrong", not "your
// session ended" — signing someone out of their own failed sign-in attempt
// would clear the session they are trying to create.
const CREDENTIAL_CHECK_PATHS = ['/auth/login', '/auth/register', '/auth/password'];

/**
 * `{ a: 1, b: undefined }` becomes `?a=1`.
 *
 * Dropping undefined matters: cursors and filters are passed as `undefined` on
 * a first page, and `URLSearchParams` would otherwise send the five-character
 * string "undefined" as the value rather than omitting the parameter.
 *
 * `undefined` and `null` only, which is exactly what axios dropped. An empty
 * string is a value a caller chose to send, and deciding here that it means
 * "absent" would be a behaviour change smuggled into a library swap — the kind
 * that surfaces later as one screen quietly querying something different.
 */
const queryString = (params) => {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.append(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
};

/** An axios-shaped error, so every existing catch block still reads it. */
const requestError = (message, response, data) => {
  const error = new Error(message);
  if (response) error.response = { status: response.status, data };
  return error;
};

const request = async (method, url, body, options = {}) => {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // FormData must set its own Content-Type: the boundary is generated with the
  // body, and naming the type by hand produces a header whose boundary does
  // not match the payload, which the server cannot parse.
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  requestStarted();

  let response;
  try {
    response = await fetch(`${BASE_URL}${url}${queryString(options.params)}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch (networkError) {
    requestSettled();
    // No `response` property: this never reached the server, so there is no
    // status to branch on. AuthProvider depends on that distinction — it must
    // not end a session because a phone lost signal.
    throw requestError(networkError.message || 'Network error');
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A proxy error page or a gateway timeout is HTML, not JSON.
    data = text;
  }

  requestSettled();

  if (!response.ok) {
    const isCredentialCheck = CREDENTIAL_CHECK_PATHS.some((path) => url.startsWith(path));
    if (response.status === 401 && !isCredentialCheck) {
      clearToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw requestError(data?.message || response.statusText, response, data);
  }

  return { data, status: response.status };
};

const apiClient = {
  get: (url, options) => request('GET', url, undefined, options),
  post: (url, body, options) => request('POST', url, body ?? {}, options),
  patch: (url, body, options) => request('PATCH', url, body ?? {}, options),
  delete: (url, options) => request('DELETE', url, undefined, options),
};

export const errorMessage = (error, fallback = 'Something went wrong') =>
  error?.response?.data?.message || error?.message || fallback;

export default apiClient;
