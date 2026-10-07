// API helper for Hygiene 360 Enterprise Client
const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('h360_token');
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If not FormData, default to application/json
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const { timeoutMs, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    let res;
    try {
      res = await fetch(url, {
        ...fetchOptions,
        headers,
        ...(controller ? { signal: controller.signal } : {})
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        const error = new Error('The server did not respond in time. Please check your connection and try again.');
        error.timeout = true;
        throw error;
      }
      throw fetchErr;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.error || data.message || `Request failed with status ${res.status}`;
      const error = new Error(errorMsg);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, err);
    throw err;
  }
}

export function photoUrl(path) {
  if (!path || typeof path !== 'string') return null;
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path;
  }
  if (path.startsWith('/uploads/')) return `${BASE_URL}${path}`;
  if (path.startsWith('uploads/')) return `${BASE_URL}/${path}`;
  return path;
}

export const api = {
  get(endpoint, params = {}) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v);
      }
    }
    const qStr = query.toString();
    return request(`${endpoint}${qStr ? '?' + qStr : ''}`, { method: 'GET' });
  },

  post(endpoint, body = {}, options = {}) {
    if (body instanceof FormData) {
      return request(endpoint, {
        method: 'POST',
        body,
        ...options
      });
    }
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options
    });
  },

  async postMultipart(endpoint, formData, retries = 2) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request(endpoint, { method: 'POST', body: formData, timeoutMs: 60000 });
      } catch (err) {
        const transient = !err.timeout && (!err.status || [502, 503, 504].includes(err.status));
        if (!transient || attempt >= retries) throw err;
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  },

  patch(endpoint, body = {}) {
    if (body instanceof FormData) {
      return request(endpoint, {
        method: 'PATCH',
        body
      });
    }
    return request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body = {}) {
    if (body instanceof FormData) {
      return request(endpoint, {
        method: 'PUT',
        body
      });
    }
    return request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint, body = {}) {
    const options = { method: 'DELETE' };
    if (body && Object.keys(body).length > 0) {
      options.body = JSON.stringify(body);
    }
    return request(endpoint, options);
  }
};
