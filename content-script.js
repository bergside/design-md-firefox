(function installExtractor() {
  const MESSAGE_TYPE = "TYPEUI_EXTRACT_STYLES";
  const ext = globalThis.browser ?? globalThis.chrome;

  if (window.__typeuiStyleExtractorInstalled) {
    return;
  }

  window.__typeuiStyleExtractorInstalled = true;

  ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE) {
      return;
    }

    try {
      const payload = extractStylesFromPage();
      sendResponse({ ok: true, payload });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unknown extraction error";
      sendResponse({ ok: false, error: text });
    }
  });

  function extractStylesFromPage() {
    const sampledElements = collectSampledElements(280);
    const typography = [];
    const colors = [];
    const spacing = [];
    const radius = [];
    const shadows = [];
    const motion = [];

    for (const el of sampledElements) {
      const style = window.getComputedStyle(el);
      typography.push({
        fontFamily: normalizeWhitespace(style.fontFamily),
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing
      });

      colors.push({
        textColor: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        outlineColor: style.outlineColor
      });

      spacing.push({
        marginTop: style.marginTop,
        marginRight: style.marginRight,
        marginBottom: style.marginBottom,
        marginLeft: style.marginLeft,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft
      });

      radius.push(style.borderRadius);
      shadows.push(style.boxShadow);
      motion.push({
        transitionDuration: style.transitionDuration,
        transitionTimingFunction: style.transitionTimingFunction,
        animationDuration: style.animationDuration,
        animationTimingFunction: style.animationTimingFunction
      });
    }

    return {
      source: {
        url: window.location.href,
        title: document.title || "Untitled page"
      },
      sampledAt: new Date().toISOString(),
      totalElements: document.querySelectorAll("*").length,
      sampledElements: sampledElements.length,
      typography,
      colors,
      spacing,
      radius,
      shadows,
      motion,
      components: collectComponentCounts(),
      siteSignals: collectSiteSignals()
    };
  }

  function collectSampledElements(limit) {
    const selectors = [
      "body",
      "h1,h2,h3,h4,h5,h6",
      "p",
      "a",
      "button",
      "input,textarea,select",
      "label",
      "nav,header,footer,main,section,article,aside",
      "ul li,ol li",
      "table,th,td",
      "[role='button']",
      "[class*='card']",
      "[class*='btn']",
      "[tabindex]"
    ];

    const seen = new Set();
    const output = [];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        if (seen.has(node)) {
          continue;
        }
        if (!isVisible(node)) {
          continue;
        }
        seen.add(node);
        output.push(node);
        if (output.length >= limit) {
          return output;
        }
      }
    }

    if (output.length === 0 && document.body) {
      output.push(document.body);
    }

    return output;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    return true;
  }

  function collectComponentCounts() {
    const map = {
      buttons: "button, [role='button'], .btn, [class*='button']",
      links: "a[href]",
      inputs: "input, textarea, select",
      cards: ".card, [class*='card'], article",
      navigation: "nav, header",
      lists: "ul, ol",
      tables: "table"
    };

    return Object.entries(map).map(([type, selector]) => ({
      type,
      count: document.querySelectorAll(selector).length
    }));
  }

  function collectSiteSignals() {
    const title = document.title || "";
    const description = getMetaContent("description");
    const keywords = getMetaContent("keywords");
    const ogType = getMetaContent("og:type", true);
    const ogSiteName = getMetaContent("og:site_name", true);
    const appName = getMetaContent("application-name");

    const headings = collectTexts("h1, h2", 10, 120);
    const navTexts = collectTexts("nav a, nav button, header a, header button", 24, 50);
    const ctaTexts = collectTexts(
      "button, [role='button'], a[class*='button'], a[class*='btn'], input[type='submit']",
      24,
      40
    );

    const bodyText = normalizeWhitespace((document.body?.innerText || "").slice(0, 14000));

    return {
      title,
      description,
      keywords,
      ogType,
      ogSiteName,
      appName,
      pathname: window.location.pathname || "/",
      hostname: window.location.hostname || "",
      headings,
      navTexts,
      ctaTexts,
      textSample: bodyText,
      elementCounts: {
        forms: document.querySelectorAll("form").length,
        inputs: document.querySelectorAll("input, textarea, select").length,
        tables: document.querySelectorAll("table").length,
        codeBlocks: document.querySelectorAll("pre, code").length,
        articles: document.querySelectorAll("article").length,
        pricingSections: countNodesByText("section, div, article", ["pricing", "plans"]),
        productMarkers: document.querySelectorAll(
          "[itemtype*='Product'], [class*='product'], [id*='product'], [data-product]"
        ).length,
        authMarkers: countNodesByText("a, button, label, span", [
          "sign in",
          "log in",
          "login",
          "register",
          "dashboard",
          "workspace"
        ]),
        checkoutMarkers: countNodesByText("a, button, span", [
          "add to cart",
          "checkout",
          "buy now",
          "cart"
        ])
      }
    };
  }

  function getMetaContent(name, property = false) {
    const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
    const value = document.querySelector(selector)?.getAttribute("content");
    return normalizeWhitespace(value || "");
  }

  function collectTexts(selector, limit, maxLength) {
    const seen = new Set();
    const output = [];
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const text = normalizeWhitespace(node.innerText || node.textContent || "");
      if (!text || text.length > maxLength) {
        continue;
      }
      if (seen.has(text)) {
        continue;
      }
      seen.add(text);
      output.push(text);
      if (output.length >= limit) {
        break;
      }
    }
    return output;
  }

  function countNodesByText(selector, keywords) {
    const nodes = document.querySelectorAll(selector);
    let count = 0;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const text = normalizeWhitespace((node.innerText || node.textContent || "").toLowerCase());
      if (!text) {
        continue;
      }
      if (keywords.some((keyword) => text.includes(keyword))) {
        count += 1;
      }
    }
    return count;
  }

  function normalizeWhitespace(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }
})();
