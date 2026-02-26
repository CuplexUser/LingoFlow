const LOG_LEVEL = String(process.env.LOG_LEVEL || "info").toLowerCase();

const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function shouldLog(level) {
  const current = LEVEL_PRIORITY[LOG_LEVEL] || LEVEL_PRIORITY.info;
  const incoming = LEVEL_PRIORITY[level] || LEVEL_PRIORITY.info;
  return incoming >= current;
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta
  };
  console.log(JSON.stringify(entry));
}

function requestLogger(req, res, next) {
  const startedAt = Date.now();
  const requestId = req.requestId || "unknown";
  res.on("finish", () => {
    write("info", "http_request", {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      authUserId: req.authUserId || null
    });
  });
  next();
}

function logAuthEvent(event, meta = {}) {
  write("info", "auth_event", { event, ...meta });
}

module.exports = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
  requestLogger,
  logAuthEvent
};
