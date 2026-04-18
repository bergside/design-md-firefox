import { normalizeExtractedStyles } from "./lib/normalize.mjs";
import { generateDesignMarkdown } from "./lib/generate-design-md.mjs";
import { generateSkillMarkdown } from "./lib/generate-skill-md.mjs";
import { validateMarkdownOutput } from "./lib/validate.mjs";

const EXTRACTION_MESSAGE = "TYPEUI_EXTRACT_STYLES";
const ext = globalThis.browser ?? globalThis.chrome;
const BLOCKED_PROTOCOLS = [
  "about:",
  "chrome:",
  "edge:",
  "view-source:",
  "resource:",
  "moz-extension:",
  "chrome-extension:",
  "devtools:"
];
const objectUrlsByDownloadId = new Map();
const objectUrlCleanupTimersByDownloadId = new Map();

ext.runtime.onInstalled.addListener(() => {
  ext.storage.local.set({
    outputMode: "design"
  });
});

ext.downloads.onChanged.addListener((delta) => {
  const downloadId = Number(delta?.id);
  if (!Number.isFinite(downloadId)) {
    return;
  }

  const state = delta?.state?.current;
  if (state === "complete" || state === "interrupted") {
    cleanupDownloadObjectUrl(downloadId);
  }
});

ext.runtime.onMessage.addListener((message) => {
  if (!message || !message.type) {
    return undefined;
  }

  if (message.type === "RUN_EXTRACTION") {
    return handleExtraction(message)
      .then((result) => ({ ok: true, ...result }))
      .catch((error) => ({ ok: false, error: stringifyError(error) }));
  }

  if (message.type === "DOWNLOAD_MARKDOWN") {
    return handleDownload(message)
      .then((downloadId) => ({ ok: true, downloadId }))
      .catch((error) => ({ ok: false, error: stringifyError(error) }));
  }

  return undefined;
});

async function handleExtraction(message) {
  const mode = message.mode === "skill" ? "skill" : "design";
  const tab = await getActiveTab();
  await injectExtractor(tab.id);
  const payload = await requestExtractionPayload(tab.id);
  const normalized = normalizeExtractedStyles(payload);

  const context = {
    normalized
  };

  const markdown =
    mode === "skill"
      ? generateSkillMarkdown(context)
      : generateDesignMarkdown(context);

  const validation = validateMarkdownOutput(mode, markdown);
  const filename = mode === "skill" ? "SKILL.md" : "DESIGN.md";

  if (message.persistOutputMode !== false) {
    await ext.storage.local.set({
      outputMode: mode
    });
  }

  return {
    mode,
    filename,
    markdown,
    normalized,
    validation
  };
}

async function handleDownload(message) {
  if (!message.markdown) {
    throw new Error("Cannot download empty markdown.");
  }

  const filename = normalizeMarkdownFilename(message.filename, message.mode);
  const blob = new Blob([message.markdown], {
    type: "text/markdown;charset=utf-8"
  });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const downloadId = await ext.downloads.download({
      url: objectUrl,
      filename,
      saveAs: true,
      conflictAction: "uniquify"
    });
    registerDownloadObjectUrl(downloadId, objectUrl);
    return downloadId;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function getActiveTab() {
  const [tab] = await ext.tabs.query({
    active: true,
    currentWindow: true
  });
  if (!tab || !tab.id) {
    throw new Error("No active tab available.");
  }
  if (isRestrictedUrl(tab.url)) {
    throw new Error("Extraction is not available on browser internal pages.");
  }
  return tab;
}

async function injectExtractor(tabId) {
  await ext.scripting.executeScript({
    target: { tabId },
    files: ["content-script.js"]
  });
}

async function requestExtractionPayload(tabId) {
  let response;
  try {
    response = await ext.tabs.sendMessage(tabId, { type: EXTRACTION_MESSAGE });
  } catch (error) {
    throw new Error(stringifyError(error));
  }

  if (!response || !response.ok) {
    throw new Error(response?.error || "No extraction response from tab.");
  }
  return response.payload;
}

function stringifyError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Unknown error");
}

function registerDownloadObjectUrl(downloadId, objectUrl) {
  if (!Number.isFinite(downloadId) || !objectUrl) {
    URL.revokeObjectURL(objectUrl);
    return;
  }

  objectUrlsByDownloadId.set(downloadId, objectUrl);
  const previousTimer = objectUrlCleanupTimersByDownloadId.get(downloadId);
  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  const timer = setTimeout(() => {
    cleanupDownloadObjectUrl(downloadId);
  }, 5 * 60 * 1000);
  objectUrlCleanupTimersByDownloadId.set(downloadId, timer);
}

function cleanupDownloadObjectUrl(downloadId) {
  const url = objectUrlsByDownloadId.get(downloadId);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrlsByDownloadId.delete(downloadId);
  }

  const timer = objectUrlCleanupTimersByDownloadId.get(downloadId);
  if (timer) {
    clearTimeout(timer);
    objectUrlCleanupTimersByDownloadId.delete(downloadId);
  }
}

function isRestrictedUrl(value) {
  const url = String(value || "").trim().toLowerCase();
  if (!url) {
    return true;
  }
  return BLOCKED_PROTOCOLS.some((protocol) => url.startsWith(protocol));
}

function normalizeMarkdownFilename(inputName, mode) {
  const normalizedMode = mode === "skill" ? "skill" : "design";
  const fallback = normalizedMode === "skill" ? "SKILL.md" : "DESIGN.md";
  const raw = String(inputName || "").trim();

  if (!raw) {
    return fallback;
  }

  const name = raw.replace(/[\\/]/g, "").trim();
  if (!name) {
    return fallback;
  }

  if (normalizedMode === "skill") {
    if (/^skill(\.md)?$/i.test(name)) {
      return "SKILL.md";
    }
    return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
  }

  if (/^design(\.md)?$/i.test(name)) {
    return "DESIGN.md";
  }
  return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}
