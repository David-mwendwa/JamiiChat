import apiClient from './apiClient.js';

export const authApi = {
  register: (payload) => apiClient.post('/auth/register', payload),
  login: (payload) => apiClient.post('/auth/login', payload),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me'),
  updatePassword: (payload) => apiClient.patch('/auth/password', payload),
  handleAvailable: (handle) => apiClient.get('/auth/handle-available', { params: { handle } }),
  testAccounts: () => apiClient.get('/auth/test-accounts'),
  forgotPassword: (email) => apiClient.post('/auth/password/forgot', { email }),
  resetPassword: (token, payload) => apiClient.patch(`/auth/password/reset/${token}`, payload),
};

export const feedApi = {
  home: (params) => apiClient.get('/feed/home', { params }),
  explore: (params) => apiClient.get('/feed/explore', { params }),
  tag: (tag, params) => apiClient.get(`/feed/tag/${tag}`, { params }),
};

export const postApi = {
  create: (formData) => apiClient.post('/posts', formData),
  get: (id) => apiClient.get(`/posts/${id}`),
  replies: (id, params) => apiClient.get(`/posts/${id}/replies`, { params }),
  remove: (id) => apiClient.delete(`/posts/${id}`),
  like: (id) => apiClient.post(`/posts/${id}/like`),
  unlike: (id) => apiClient.delete(`/posts/${id}/like`),
  repost: (id, text) => apiClient.post(`/posts/${id}/repost`, { text }),
  undoRepost: (id) => apiClient.delete(`/posts/${id}/repost`),
  bookmark: (id) => apiClient.post(`/posts/${id}/bookmark`),
  unbookmark: (id) => apiClient.delete(`/posts/${id}/bookmark`),
  bookmarks: (params) => apiClient.get('/posts/bookmarks', { params }),
  likers: (id) => apiClient.get(`/posts/${id}/likes`),
};

export const userApi = {
  profile: (handle) => apiClient.get(`/users/${handle}`),
  posts: (handle, params) => apiClient.get(`/users/${handle}/posts`, { params }),
  followers: (handle, params) => apiClient.get(`/users/${handle}/followers`, { params }),
  following: (handle, params) => apiClient.get(`/users/${handle}/following`, { params }),
  follow: (handle) => apiClient.post(`/users/${handle}/follow`),
  unfollow: (handle) => apiClient.delete(`/users/${handle}/follow`),
  respond: (handle, accept) => apiClient.post(`/users/${handle}/respond`, { accept }),
  requests: () => apiClient.get('/users/requests'),
  suggestions: (params) => apiClient.get('/users/suggestions', { params }),
  block: (handle) => apiClient.post(`/users/${handle}/block`),
  unblock: (handle) => apiClient.delete(`/users/${handle}/block`),
  mute: (handle) => apiClient.post(`/users/${handle}/mute`),
  unmute: (handle) => apiClient.delete(`/users/${handle}/mute`),
  blocked: () => apiClient.get('/users/blocked'),
  updateMe: (payload) => apiClient.patch('/users/me', payload),
  updateHandle: (handle) => apiClient.patch('/users/me/handle', { handle }),
  uploadImage: (kind, formData) => apiClient.patch(`/users/me/image/${kind}`, formData),
  removeImage: (kind) => apiClient.delete(`/users/me/image/${kind}`),
};

export const messageApi = {
  conversations: () => apiClient.get('/conversations'),
  open: (handle) => apiClient.post(`/conversations/with/${handle}`),
  hideConversation: (id) => apiClient.post(`/conversations/${id}/hide`),
  messages: (id, params) => apiClient.get(`/conversations/${id}/messages`, { params }),
  send: (id, text, replyTo) => apiClient.post(`/conversations/${id}/messages`, { text, replyTo }),
  // A separate call rather than branching inside `send`: multipart and JSON
  // bodies are different enough shapes (FormData vs. a plain object) that
  // folding them into one function just moves the branch to every caller.
  // Same endpoint for an image or a recorded voice note — the field name
  // inside the FormData is what tells the server which one it is.
  sendWithMedia: (id, formData) => apiClient.post(`/conversations/${id}/messages`, formData),
  edit: (id, messageId, text) =>
    apiClient.patch(`/conversations/${id}/messages/${messageId}`, { text }),
  remove: (id, messageId) => apiClient.delete(`/conversations/${id}/messages/${messageId}`),
  hide: (id, messageId) => apiClient.post(`/conversations/${id}/messages/${messageId}/hide`),
  markRead: (id) => apiClient.patch(`/conversations/${id}/read`),
  unread: () => apiClient.get('/conversations/unread'),
};

export const notificationApi = {
  list: (params) => apiClient.get('/notifications', { params }),
  unread: () => apiClient.get('/notifications/unread'),
  markAllRead: () => apiClient.patch('/notifications/read'),
  markRead: (id) => apiClient.patch(`/notifications/${id}/read`),
};

export const searchApi = {
  query: (q, params) => apiClient.get('/search', { params: { q, ...params } }),
  trending: (params) => apiClient.get('/search/trending', { params }),
};

export const reportApi = {
  create: (payload) => apiClient.post('/reports', payload),
};

export const adminApi = {
  overview: () => apiClient.get('/admin/overview'),
  reports: (params) => apiClient.get('/admin/reports', { params }),
  resolve: (id, payload) => apiClient.patch(`/admin/reports/${id}`, payload),
  users: (params) => apiClient.get('/admin/users', { params }),
  setActive: (id, active) => apiClient.patch(`/admin/users/${id}/active`, { active }),
};
