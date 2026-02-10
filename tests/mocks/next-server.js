// Mock for next/server package
// This package uses Web APIs (Request, Response) that are not available in Node.js Jest environment
// We provide minimal mocks for NextResponse and other server-side APIs

class MockHeaders {
  constructor(init = {}) {
    this._headers = new Map();
    if (init) {
      if (Array.isArray(init)) {
        for (const [key, value] of init) {
          this._headers.set(key.toLowerCase(), value);
        }
      } else if (typeof init === "object") {
        for (const [key, value] of Object.entries(init)) {
          this._headers.set(key.toLowerCase(), value);
        }
      }
    }
  }

  get(name) {
    return this._headers.get(name.toLowerCase()) || null;
  }

  set(name, value) {
    this._headers.set(name.toLowerCase(), value);
  }

  has(name) {
    return this._headers.has(name.toLowerCase());
  }

  delete(name) {
    this._headers.delete(name.toLowerCase());
  }

  forEach(callback) {
    this._headers.forEach((value, key) => {
      callback(value, key, this);
    });
  }
}

class MockResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.statusText = init.statusText || "OK";
    this.headers = new MockHeaders(init.headers || {});
    this.ok = this.status >= 200 && this.status < 300;
    this.redirected = false;
    this.type = "default";
    this.url = "";
  }

  json() {
    return Promise.resolve(this.body);
  }

  text() {
    return Promise.resolve(typeof this.body === "string" ? this.body : JSON.stringify(this.body));
  }

  clone() {
    return new MockResponse(this.body, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
    });
  }
}

class NextResponse extends MockResponse {
  static json(body, init = {}) {
    return new MockResponse(body, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  }

  static next(init = {}) {
    return new MockResponse(null, {
      ...init,
      status: init.status || 200,
    });
  }

  static redirect(url, init = {}) {
    return new MockResponse(null, {
      ...init,
      status: init.status || 307,
      headers: {
        Location: url,
        ...init.headers,
      },
    });
  }

  static rewrite(url, init = {}) {
    return new MockResponse(null, {
      ...init,
      status: init.status || 200,
    });
  }
}

// Polyfill Request and Response for Node.js environment
// This must be done after MockHeaders is defined
if (typeof globalThis.Request === "undefined") {
  // Use undici's Request/Response if available (Node.js 18+)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Request, Response, Headers } = require("undici");
    globalThis.Request = Request;
    globalThis.Response = Response;
    globalThis.Headers = Headers;
  } catch {
    // Fallback to minimal mocks if undici is not available
    globalThis.Request = class MockRequest {
      constructor(input, init = {}) {
        this.url = typeof input === "string" ? input : input?.url || "";
        this.method = init.method || "GET";
        this.headers = new MockHeaders(init.headers || {});
        this.body = init.body || null;
      }
    };
    globalThis.Response = class MockResponseGlobal {
      constructor(body, init = {}) {
        this.body = body;
        this.status = init.status || 200;
        this.statusText = init.statusText || "OK";
        this.headers = new MockHeaders(init.headers || {});
        this.ok = this.status >= 200 && this.status < 300;
      }
      json() {
        return Promise.resolve(this.body);
      }
      text() {
        return Promise.resolve(
          typeof this.body === "string" ? this.body : JSON.stringify(this.body)
        );
      }
    };
    globalThis.Headers = MockHeaders;
  }
}

// NextRequest class for testing
class NextRequest extends globalThis.Request {
  constructor(input, init = {}) {
    super(input, init);
    // Safely handle URL parsing
    let urlString;
    if (typeof input === "string") {
      urlString = input;
    } else if (input && typeof input === "object") {
      urlString = input.url || "http://localhost/";
    } else {
      urlString = "http://localhost/";
    }

    try {
      this.nextUrl = new URL(urlString);
    } catch (e) {
      // Fallback to localhost if URL is invalid
      this.nextUrl = new URL("http://localhost/");
    }

    this.cookies = {
      get: (name) => undefined,
      set: () => {},
      has: (name) => false,
      delete: () => {},
      getAll: () => [],
    };
    this.geo = {};
    this.ip = init.ip || "127.0.0.1";
  }
}

module.exports = {
  NextResponse,
  NextRequest,
  // Export other Next.js server APIs if needed
  headers: () => ({
    get: (name) => null,
    set: () => {},
    has: () => false,
  }),
  cookies: () => ({
    get: (name) => undefined,
    set: () => {},
    has: (name) => false,
    delete: () => {},
    getAll: () => [],
  }),
};
