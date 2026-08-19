// Vercel serverless entrypoint. Wraps the Express app built by server/dist/index.js
// (produced by `npm run build --prefix server` as part of the Vercel build command).
// createApp() is async (it awaits DB bootstrap), so the resulting app is cached at
// module scope -- a warm Lambda instance reuses it across invocations instead of
// re-running schema/content bootstrap on every request.
const { createApp } = require("../server/dist/index.js");

let appPromise;
function getApp() {
  if (!appPromise) appPromise = createApp();
  return appPromise;
}

module.exports = async (req, res) => {
  const app = await getApp();
  return app(req, res);
};
