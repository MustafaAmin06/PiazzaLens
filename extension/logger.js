(function () {
  "use strict";

  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const DEFAULT_LEVEL = "info";

  function shouldLog(level) {
    return LEVELS[level] >= LEVELS[DEFAULT_LEVEL];
  }

  function create(moduleName) {
    function emit(level, ...args) {
      if (!shouldLog(level)) {
        return;
      }

      const timestamp = new Date().toISOString();
      const prefix = `${timestamp} [PiazzaLens:${moduleName}] ${level.toUpperCase()}:`;
      const sink = console[level] || console.log;
      sink.call(console, prefix, ...args);
    }

    return {
      debug: (...args) => emit("debug", ...args),
      info: (...args) => emit("info", ...args),
      warn: (...args) => emit("warn", ...args),
      error: (...args) => emit("error", ...args)
    };
  }

  globalThis.PiazzaLogger = { create };
})();