/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { execFile } = require("child_process");

const OLLAMA_DISCOVERY_TIMEOUT_MS = 5_000;
const OLLAMA_PULL_TIMEOUT_MS = 600_000;
const OLLAMA_CHAT_TIMEOUT_MS = 90_000;
const OLLAMA_APP_PATH = "/Applications/Ollama.app";

function buildUrl(baseUrl, pathName) {
  return new URL(pathName, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function formatOllamaConnectionMessage(baseUrl) {
  return `Ollama is not running at ${baseUrl}. Start the Ollama app or run \`ollama serve\`, then try again.`;
}

function toOllamaError(baseUrl, error, timeoutMs) {
  if (error instanceof Error) {
    const nested = error.cause;
    if (nested && typeof nested === "object" && nested.code === "ECONNREFUSED") {
      return new Error(formatOllamaConnectionMessage(baseUrl));
    }

    if (error.name === "AbortError") {
      const seconds = timeoutMs ? Math.round(timeoutMs / 1000) : 5;
      return new Error(`Ollama did not respond at ${baseUrl} within ${seconds} seconds.`);
    }

    if (error.message === "fetch failed") {
      return new Error(formatOllamaConnectionMessage(baseUrl));
    }
  }

  return error instanceof Error ? error : new Error("Could not reach Ollama.");
}

async function fetchWithTimeout(input, init, timeoutMs = OLLAMA_DISCOVERY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isOllamaInstalled() {
  return process.platform === "darwin" && fs.existsSync(OLLAMA_APP_PATH);
}

function launchOllamaApp() {
  return new Promise((resolve, reject) => {
    execFile("open", ["-a", "Ollama"], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function isOllamaReachable(baseUrl) {
  try {
    const response = await fetchWithTimeout(
      buildUrl(baseUrl, "/api/version"),
      undefined,
      OLLAMA_DISCOVERY_TIMEOUT_MS,
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForOllama(baseUrl, attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    if (await isOllamaReachable(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureOllamaRunning(baseUrl) {
  if (await isOllamaReachable(baseUrl)) return true;
  if (!isOllamaInstalled()) return false;

  try {
    await launchOllamaApp();
    return waitForOllama(baseUrl);
  } catch {
    return false;
  }
}

async function listOllamaModels(baseUrl) {
  try {
    const response = await fetchWithTimeout(
      buildUrl(baseUrl, "/api/tags"),
      undefined,
      OLLAMA_DISCOVERY_TIMEOUT_MS,
    );
    if (!response.ok) {
      throw new Error("Could not read the local Ollama models.");
    }

    const payload = await response.json();
    return (payload.models ?? [])
      .map((model) => ({
        name: model.name,
        size: model.size,
        modifiedAt: model.modified_at,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    throw toOllamaError(baseUrl, error, OLLAMA_DISCOVERY_TIMEOUT_MS);
  }
}

async function pullOllamaModel(baseUrl, modelName) {
  try {
    const response = await fetchWithTimeout(
      buildUrl(baseUrl, "/api/pull"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          stream: true,
        }),
      },
      OLLAMA_PULL_TIMEOUT_MS,
    );

    if (!response.ok || !response.body) {
      throw new Error("Could not download the Ollama model.");
    }

    const reader = response.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  } catch (error) {
    throw toOllamaError(baseUrl, error, OLLAMA_PULL_TIMEOUT_MS);
  }
}

async function getOllamaStatus(baseUrl) {
  const reachable = await isOllamaReachable(baseUrl);
  return {
    installed: isOllamaInstalled(),
    reachable,
    models: reachable ? await listOllamaModels(baseUrl) : [],
  };
}

function cleanRewriteOutput(content, rawText) {
  const trimmed = content?.trim();
  if (!trimmed) {
    return rawText;
  }

  const stripped =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1).trim()
      : trimmed.startsWith("'") && trimmed.endsWith("'")
        ? trimmed.slice(1, -1).trim()
        : trimmed;

  const metaLeadPattern =
    /^(sure|here(?:'s| is)|rewritten|revised|updated|i changed|i rewrote|i made|this is)/i;

  if (!metaLeadPattern.test(stripped)) {
    return stripped;
  }

  const quotedMatches = Array.from(
    stripped.matchAll(/["“”'`](.+?)["“”'`]/g),
    (match) => match[1]?.trim(),
  ).filter(Boolean);

  if (quotedMatches.length > 0) {
    return quotedMatches.sort((left, right) => right.length - left.length)[0];
  }

  const colonIndex = stripped.indexOf(":");
  if (colonIndex >= 0) {
    const afterColon = stripped.slice(colonIndex + 1).trim();
    const cleanedTail = afterColon.replace(/\bI changed\b[\s\S]*$/i, "").trim();
    if (cleanedTail) {
      return cleanedTail;
    }
  }

  return stripped;
}

async function rewriteWithOllama(baseUrl, modelName, systemPrompt, rawText) {
  try {
    const response = await fetchWithTimeout(
      buildUrl(baseUrl, "/api/chat"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          stream: false,
          keep_alive: "10m",
          options: {
            temperature: 0,
          },
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: [
                "Rewrite the dictated text below.",
                "If the speaker corrected themselves or changed their mind, use only their final intent.",
                "Reply with only the final rewritten text and no commentary.",
                "",
                "<dictation>",
                rawText,
                "</dictation>",
              ].join("\n"),
            },
          ],
        }),
      },
      OLLAMA_CHAT_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error("Could not reach Ollama for the rewrite pass.");
    }

    const payload = await response.json();
    return cleanRewriteOutput(payload?.message?.content, rawText);
  } catch (error) {
    throw toOllamaError(baseUrl, error, OLLAMA_CHAT_TIMEOUT_MS);
  }
}

module.exports = {
  ensureOllamaRunning,
  getOllamaStatus,
  isOllamaInstalled,
  isOllamaReachable,
  launchOllamaApp,
  listOllamaModels,
  pullOllamaModel,
  rewriteWithOllama,
};
