const state = {
  markdown: "",
  filename: "",
  mode: "design",
  busy: false,
  lastResult: null
};
const ext = globalThis.browser ?? globalThis.chrome;

const QUICK_INSTALL_PROVIDERS = {
  claude: {
    label: "Claude Code",
    targetDir: ".claude/skills/design-system"
  },
  codex: {
    label: "Codex",
    targetDir: ".agents/skills/design-system"
  },
  cursor: {
    label: "Cursor",
    targetDir: ".cursor/skills/design-system"
  }
};

const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
const refreshBtn = document.getElementById("refreshBtn");
const downloadBtn = document.getElementById("downloadBtn");
const copyBtn = document.getElementById("copyBtn");
const quickInstallButtons = Array.from(document.querySelectorAll(".quick-install-btn"));
const quickInstallResultEl = document.getElementById("quickInstallResult");
const helpBtn = document.getElementById("helpBtn");
const helpPanel = document.getElementById("helpPanel");
const helpContentEl = document.getElementById("helpContent");
const closeHelpBtn = document.getElementById("closeHelpBtn");
const previewEl = document.getElementById("preview");
const statusEl = document.getElementById("status");
const issuesEl = document.getElementById("issues");

refreshBtn.addEventListener("click", () => {
  runExtraction().catch((error) => setStatus(toErrorText(error), true));
});

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    if (!mode || mode === state.mode) {
      return;
    }
    state.mode = mode;
    syncModeUi();
    runExtraction().catch((error) => setStatus(toErrorText(error), true));
  });
}

for (const button of quickInstallButtons) {
  button.addEventListener("click", () => {
    const providerId = button.dataset.provider;
    installQuick(providerId).catch((error) => {
      setQuickInstallResult(`Quick install failed: ${toErrorText(error)}`, true);
    });
  });
}

downloadBtn.addEventListener("click", () => {
  downloadCurrent().catch((error) => setStatus(toErrorText(error), true));
});

helpBtn.addEventListener("click", () => {
  const shouldOpen = helpPanel.hidden;
  helpPanel.hidden = !shouldOpen;
  if (shouldOpen) {
    renderGenerationExplanation();
  }
});

closeHelpBtn.addEventListener("click", () => {
  helpPanel.hidden = true;
});

copyBtn.addEventListener("click", async () => {
  try {
    if (!state.markdown) {
      setStatus("Nothing to copy yet.", true);
      return;
    }
    await navigator.clipboard.writeText(state.markdown);
    
    copyBtn.classList.add("copied");
    const copyIcon = copyBtn.querySelector(".icon-copy");
    const successIcon = copyBtn.querySelector(".icon-success");
    if (copyIcon && successIcon) {
      copyIcon.style.display = "none";
      successIcon.style.display = "block";
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyIcon.style.display = "block";
        successIcon.style.display = "none";
      }, 2000);
    }
  } catch (error) {
    setStatus(`Copy failed: ${toErrorText(error)}`, true);
  }
});

init().catch((error) => setStatus(`Init failed: ${toErrorText(error)}`, true));

async function init() {
  const data = await ext.storage.local.get(["outputMode"]);
  state.mode = data.outputMode === "skill" ? "skill" : "design";
  syncModeUi();
  updateQuickInstallUi();
  await runExtraction();
}

async function runExtraction() {
  if (state.busy) {
    return;
  }
  setBusy(true);
  clearStatus();
  issuesEl.innerHTML = "";

  try {
    const response = await ext.runtime.sendMessage({
      type: "RUN_EXTRACTION",
      mode: state.mode
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Extraction request failed.");
    }

    state.markdown = response.markdown;
    state.filename = response.filename;
    state.lastResult = response;

    previewEl.value = response.markdown;
    downloadBtn.disabled = false;
    copyBtn.disabled = false;

    renderValidationIssues(response.validation);
    clearStatus();
    clearQuickInstallResult();
    updateQuickInstallUi();
    if (!helpPanel.hidden) {
      renderGenerationExplanation();
    }
  } finally {
    setBusy(false);
  }
}

async function downloadCurrent() {
  if (!state.markdown || !state.filename) {
    setStatus("Nothing to download yet.", true);
    return;
  }

  const response = await ext.runtime.sendMessage({
    type: "DOWNLOAD_MARKDOWN",
    mode: state.mode,
    filename: state.filename,
    markdown: state.markdown
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "Download failed.");
  }
  clearStatus();
}

function setBusy(isBusy) {
  state.busy = isBusy;
  refreshBtn.disabled = isBusy;
  for (const button of modeButtons) {
    button.disabled = isBusy;
  }
  updateQuickInstallUi();
}

function renderValidationIssues(validation) {
  issuesEl.innerHTML = "";
  if (!validation) {
    issuesEl.hidden = true;
    return;
  }

  const issues = [
    ...(validation.errors || []),
    ...(validation.warnings || [])
  ];

  if (issues.length === 0) {
    issuesEl.hidden = true;
    return;
  }

  issuesEl.hidden = false;
  for (const issue of issues) {
    const item = document.createElement("li");
    item.textContent = issue;
    issuesEl.appendChild(item);
  }
}

function setStatus(text, isError = false) {
  const value = String(text || "").trim();
  if (!value) {
    clearStatus();
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = value;
  statusEl.style.color = isError ? "#b91c1c" : "#1f1f1f";
}

function toErrorText(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "Unknown error");
}

function syncModeUi() {
  for (const button of modeButtons) {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", isActive);
  }
  clearQuickInstallResult();
  updateQuickInstallUi();
  if (!helpPanel.hidden) {
    renderGenerationExplanation();
  }
}

function renderGenerationExplanation() {
  const modeLabel = state.mode === "skill" ? "SKILL.md" : "DESIGN.md";
  const result = state.lastResult;
  helpContentEl.replaceChildren();

  if (!result) {
    appendParagraph(helpContentEl, "No extraction result is loaded yet.");
    appendParagraph(helpContentEl, "Run extraction and open this panel again for a full breakdown.");
    appendLinkParagraph(
      helpContentEl,
      "The format is based on the TypeUI DESIGN.md configuration:",
      "https://www.typeui.sh/design-md"
    );
    return;
  }

  const normalized = result.normalized || {};
  const siteProfile = normalized.siteProfile || {};
  const checks = result.validation?.checks || [];
  const passedChecks = checks.filter((item) => item.ok).length;

  const summary = {
    sampledElements: normalized.sampledElements ?? "n/a",
    totalElements: normalized.totalElements ?? "n/a",
    typographyTokens: (normalized.typographyScale || []).length,
    colorTokens: (normalized.colorPalette || []).length,
    spacingTokens: (normalized.spacingScale || []).length,
    radiusTokens: (normalized.radiusTokens || []).length,
    shadowTokens: (normalized.shadowTokens || []).length,
    motionTokens: (normalized.motionDurationTokens || []).length + (normalized.motionEasingTokens || []).length
  };

  const componentHints = (normalized.componentHints || [])
    .slice(0, 5)
    .map((item) => `${item.type}: ${item.count}`)
    .join(", ");

  const inferenceEvidence = (siteProfile.evidence || []).slice(0, 5).join("; ");
  const inferenceText = siteProfile.audience || siteProfile.productSurface
    ? `Audience "${siteProfile.audience || "n/a"}" and surface "${siteProfile.productSurface || "n/a"}" inferred with ${siteProfile.confidence || "unknown"} confidence.`
    : "Audience and product surface fallback values were used because evidence confidence was low.";

  const intro = document.createElement("p");
  const label = document.createElement("strong");
  label.textContent = modeLabel;
  intro.append(label, " is generated automatically through a multi-step pipeline:");
  helpContentEl.appendChild(intro);

  const steps = [
    `Style extraction. The extension scans visible page elements and captures computed typography, colors, spacing, radius, shadows, and motion values. Current run: ${summary.sampledElements} sampled elements from ${summary.totalElements} total nodes.`,
    `Token normalization. Raw values are deduplicated and grouped into semantic-like token sets to create reusable foundations. Current token coverage: typography ${summary.typographyTokens}, color ${summary.colorTokens}, spacing ${summary.spacingTokens}, radius ${summary.radiusTokens}, shadow ${summary.shadowTokens}, motion ${summary.motionTokens}.`,
    `Website profiling. The generator uses URL/path patterns, metadata, headings, navigation labels, CTA text, and structural signals (forms, tables, code blocks, pricing/product markers) to infer brand context. ${inferenceText}${inferenceEvidence ? ` Evidence: ${inferenceEvidence}.` : ""}`,
    `Blueprint assembly. The content is assembled into required sections for ${modeLabel}, including mission, brand, style foundations, accessibility, rule sets, workflow, and quality gates, while preserving required state coverage.`,
    `Conformance checks. The generated file is validated against required headings, frontmatter/managed markers (for SKILL), accessibility target wording, and state references. Current run passed ${passedChecks}/${checks.length} checks.`
  ];

  const list = document.createElement("ol");
  for (const step of steps) {
    const item = document.createElement("li");
    item.textContent = step;
    list.appendChild(item);
  }
  helpContentEl.appendChild(list);

  appendParagraph(
    helpContentEl,
    "This generation flow is based on the TypeUI DESIGN.md configuration and structure guidelines:"
  );
  appendLinkParagraph(helpContentEl, "", "https://www.typeui.sh/design-md");
  appendParagraph(
    helpContentEl,
    componentHints
      ? `Detected component density signals: ${componentHints}.`
      : "No strong component density signals were detected for this page."
  );
}

function appendParagraph(parent, text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  parent.appendChild(paragraph);
}

function appendLinkParagraph(parent, prefix, href) {
  const paragraph = document.createElement("p");
  if (prefix) {
    paragraph.append(`${prefix} `);
  }
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = href;
  paragraph.appendChild(anchor);
  parent.appendChild(paragraph);
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.hidden = true;
}

async function installQuick(providerId) {
  const provider = QUICK_INSTALL_PROVIDERS[providerId];
  if (!provider) {
    setQuickInstallResult("Unknown provider.", true);
    return;
  }
  if (state.busy) {
    return;
  }
  clearQuickInstallResult();
  clearStatus();

  const relativePath = `${provider.targetDir}/SKILL.md`;
  setBusy(true);

  try {
    const skillMarkdown = await fetchSkillMarkdownForInstall();

    if (typeof window.showDirectoryPicker !== "function") {
      await fallbackQuickInstall(provider, relativePath, skillMarkdown);
      return;
    }

    try {
      const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      await writeFileToProject(rootHandle, relativePath, skillMarkdown);
      setQuickInstallResult(`Installed for ${provider.label} at ${provider.targetDir}/`);
    } catch (error) {
      if (isAbortError(error)) {
        setQuickInstallResult("Quick install cancelled.");
        return;
      }
      await fallbackQuickInstall(provider, relativePath, skillMarkdown, error);
    }
  } finally {
    setBusy(false);
  }
}

async function fetchSkillMarkdownForInstall() {
  const response = await ext.runtime.sendMessage({
    type: "RUN_EXTRACTION",
    mode: "skill",
    persistOutputMode: false
  });

  if (!response || !response.ok || !response.markdown) {
    throw new Error(response?.error || "Could not generate SKILL.md for quick install.");
  }
  return response.markdown;
}

async function writeFileToProject(rootHandle, relativePath, content) {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error("Invalid target path.");
  }

  let currentDir = rootHandle;
  for (const segment of parts) {
    currentDir = await currentDir.getDirectoryHandle(segment, { create: true });
  }

  const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function fallbackQuickInstall(provider, relativePath, skillMarkdown, originalError) {
  let copied = false;
  let downloaded = false;

  try {
    await navigator.clipboard.writeText(skillMarkdown);
    copied = true;
  } catch (_) {
    copied = false;
  }

  try {
    const response = await ext.runtime.sendMessage({
      type: "DOWNLOAD_MARKDOWN",
      mode: "skill",
      filename: "SKILL.md",
      markdown: skillMarkdown
    });
    downloaded = Boolean(response?.ok);
  } catch (_) {
    downloaded = false;
  }

  if (copied || downloaded) {
    setQuickInstallResult(
      `${copied ? "Copied content." : "Could not copy."} ${downloaded ? "Downloaded SKILL.md." : "Could not auto-download."} Move it to <project>/${relativePath} for ${provider.label}.`,
      false
    );
    return;
  }

  const reason = originalError ? ` (${toErrorText(originalError)})` : "";
  setQuickInstallResult(`Quick install failed${reason}.`, true);
}

function updateQuickInstallUi() {
  const enabled = !state.busy;

  for (const button of quickInstallButtons) {
    button.disabled = !enabled;
  }
}

function setQuickInstallResult(text, isError = false) {
  const value = String(text || "").trim();
  if (!value) {
    clearQuickInstallResult();
    return;
  }

  quickInstallResultEl.hidden = false;
  quickInstallResultEl.textContent = value;
  quickInstallResultEl.classList.toggle("error", Boolean(isError));
}

function clearQuickInstallResult() {
  quickInstallResultEl.hidden = true;
  quickInstallResultEl.textContent = "";
  quickInstallResultEl.classList.remove("error");
}

function isAbortError(error) {
  return error && typeof error === "object" && error.name === "AbortError";
}
