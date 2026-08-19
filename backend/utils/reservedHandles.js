// Every top-level path segment the frontend router defines. `:handle` is
// matched last in App.jsx specifically so these win first — which means a real
// user who managed to register under one of these words would find their own
// profile permanently unreachable: `/admin` always resolves to the admin
// dashboard, never to that person's profile, no matter who is asking.
//
// This was not a hypothetical: the seeded admin demo account originally used
// the handle `admin`, which collided with the `/admin` route. Its profile was
// unreachable, and the nav rail showed both "Profile" and "Admin" as active at
// once, because they pointed at the literal same URL. Renaming that one
// account fixed the symptom; this list is what stops the next one.
export const RESERVED_HANDLES = new Set([
  'login',
  'register',
  'explore',
  'search',
  'tag',
  'post',
  'notifications',
  'bookmarks',
  'settings',
  'admin',
  'messages',
  '404',
  'home',
  'api',
]);

export const isReservedHandle = (handle) => RESERVED_HANDLES.has(String(handle).toLowerCase());
