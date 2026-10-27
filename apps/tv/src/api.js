export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// XHR works on the older television engines; no fetch/AbortController polyfill.
export function transport(url, options) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(options.method || 'GET', url, true);
    xhr.timeout = 20000;
    Object.keys(options.headers || {}).forEach(function (key) {
      xhr.setRequestHeader(key, options.headers[key]);
    });
    xhr.onload = function () {
      var body = null;
      try { body = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (_) {}
      resolve({ status: xhr.status, body: body });
    };
    xhr.onerror = function () { reject(new ApiError(0, 'Cannot connect. Check your internet connection and try again.')); };
    xhr.ontimeout = function () { reject(new ApiError(0, 'The connection timed out. Please try again.')); };
    xhr.send(options.body === undefined ? null : JSON.stringify(options.body));
  });
}

export class TvApi {
  constructor(base, storage, send = transport) {
    this.base = base.replace(/\/$/, '');
    this.storage = storage;
    this.send = send;
    this.access = null;
    this.refreshing = null;
    this.generation = 0;
    this.refreshToken = this.read('ct.tv.refresh');
  }
  read(key) { try { return this.storage.getItem(key); } catch (_) { return null; } }
  persist(value) {
    try {
      if (value) this.storage.setItem('ct.tv.refresh', value);
      else this.storage.removeItem('ct.tv.refresh');
    } catch (_) { /* Memory-only session when TV storage is unavailable. */ }
  }
  store(pair) {
    if (!pair || !pair.accessToken || !pair.refreshToken) throw new ApiError(502, 'Invalid sign-in response. Please retry.');
    this.access = pair.accessToken;
    this.refreshToken = pair.refreshToken;
    this.persist(pair.refreshToken);
  }
  clear() {
    this.generation++;
    this.access = null;
    this.refreshToken = null;
    this.persist(null);
    if (this.onSessionLost) this.onSessionLost();
  }
  async rotate() {
    if (this.refreshing) return this.refreshing;
    if (!this.refreshToken) throw new ApiError(401, 'Please sign in to continue.');
    var generation = this.generation;
    this.refreshing = (async () => {
      var response = await this.send(this.base + '/v1/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: { refreshToken: this.refreshToken }
      });
      if (generation !== this.generation) throw new ApiError(401, 'The session changed. Please sign in again.');
      if (response.status === 401 || response.status === 403) this.clear();
      this.check(response);
      this.store(response.body);
    })();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }
  check(response) {
    if (response.status < 200 || response.status >= 300) {
      var body = response.body || {};
      throw new ApiError(response.status, body.detail || body.message || 'Request failed. Please try again.');
    }
  }
  async request(path, options = {}) {
    var generation = this.generation;
    if (options.auth && !this.access && this.refreshToken) await this.rotate();
    var failedToken = this.access;
    var headers = { 'Content-Type': 'application/json' };
    if (options.auth && this.access) headers.Authorization = 'Bearer ' + this.access;
    var response = await this.send(this.base + path, {
      method: options.method || 'GET', headers: headers, body: options.body
    });
    if (options.auth && generation !== this.generation) throw new ApiError(401, 'The session changed. Please sign in again.');
    if (response.status === 401 && options.auth && !options.retried && this.refreshToken) {
      // A delayed 401 may arrive AFTER another request finished rotating.
      if (this.access === failedToken) await this.rotate();
      return this.request(path, { method: options.method, body: options.body, auth: true, retried: true });
    }
    this.check(response);
    return response.body;
  }
  async login(email, password) {
    this.clear();
    var pair = await this.request('/v1/auth/login', { method: 'POST', body: { email: email, password: password } });
    this.store(pair);
    return this.request('/v1/auth/me', { auth: true });
  }
  async logout() {
    var token = this.refreshToken;
    var access = this.access;
    this.clear();
    if (token && access) {
      try {
        await this.send(this.base + '/v1/auth/logout', { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
          body: { refreshToken: token } });
      } catch (_) { /* Local sign-out must still complete offline. */ }
    }
  }
}
