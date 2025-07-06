module.exports = {
  ci: {
    collect: {
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/auth/login",
        "http://localhost:3000/auth/register",
        "http://localhost:3000/auth/reset-password",
      ],
      startServerCommand: "npm start",
      startServerReadyPattern: "ready",
      startServerReadyTimeout: 30000,
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.9 }],
        "categories:pwa": "off",
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
