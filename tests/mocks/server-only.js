// This file is used to mock the 'server-only' package in Jest.
// It prevents the "This module cannot be imported from a Client Component module" error.
// server-only is a marker package used by Next.js to prevent client-side imports.
// In test environments, we safely mock it as tests run in Node.js, not in a browser context.
