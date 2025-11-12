// Mock for @opennextjs/cloudflare package
// This package uses ESM which Jest cannot transform by default
// In test environments, we mock it to return a simple context object

module.exports = {
  getCloudflareContext(options) {
    if (options?.async) {
      return Promise.resolve({
        env: process.env,
        request: null,
        waitUntil: () => {},
        passThroughOnException: () => {},
      });
    }
    return {
      env: process.env,
      request: null,
      waitUntil: () => {},
      passThroughOnException: () => {},
    };
  },
};
