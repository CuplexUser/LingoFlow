// Content directory locations, computed once here so they stay correct whether the
// server runs from source (server/src) or from the esbuild bundle (server/dist) --
// both sit exactly one level inside server/, so a single ".." traversal from this
// file's own __dirname is depth-symmetric in both cases. Modules that instead compute
// these paths relative to their own (deeper) location break once everything is
// flattened into one bundled file.
const path: typeof import("path") = require("path");

const SERVER_ROOT = path.join(__dirname, "..");

module.exports = {
  SERVER_ROOT,
  CONTENT_DIR: path.join(SERVER_ROOT, "content", "languages"),
  PRACTICE_WORDS_DIR: path.join(SERVER_ROOT, "content", "practice_words"),
  STORIES_DIR: path.join(SERVER_ROOT, "content", "stories")
};
