/**
 * Dembrandt Programmatic API
 *
 * Use this module to extract brand tokens from websites in your own projects.
 * Requires Node.js 18+ and Playwright browsers (run `npx playwright install` if needed).
 *
 * @example
 * import { extractBrand } from 'dembrandt/api';
 * const brand = await extractBrand('https://example.com', { slow: true });
 * console.log(brand.colors, brand.typography, brand.logo);
 */

import { chromium, firefox } from "playwright-core";
import { extractBranding } from "./lib/extractors.js";

/**
 * Silent spinner for programmatic use — no stdout
 */
const silentSpinner = {
  text: "",
  start() {
    return this;
  },
  stop() {},
  warn() {},
  fail() {},
};

/**
 * Extract design tokens and brand assets from a website.
 *
 * @param {string} url - Target URL (e.g. "https://example.com" or "example.com")
 * @param {Object} [options] - Extraction options
 * @param {boolean} [options.darkMode=false] - Extract colors from dark mode variant
 * @param {boolean} [options.mobile=false] - Use mobile viewport (390x844)
 * @param {boolean} [options.explore=true] - Explore product/category pages (Shopify, etc.)
 * @param {boolean} [options.slow=false] - 3x longer timeouts for slow sites
 * @param {string} [options.browser='chromium'] - Browser to use: 'chromium' | 'firefox'
 * @param {boolean} [options.noSandbox=false] - Disable browser sandbox (Docker/CI)
 * @param {boolean} [options.includeWordPressPresets=false] - Include WordPress --wp--preset CSS variables (block themes)
 * @returns {Promise<Object>} Brand extraction result (colors, typography, logo, etc.)
 *
 * @example
 * const brand = await extractBrand('https://myshop.com', { slow: true, explore: true });
 */
export async function extractBrand(url, options = {}) {
  let normalizedUrl = url;
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = "https://" + normalizedUrl;
  }

  const {
    darkMode = false,
    mobile = false,
    explore = true,
    slow = false,
    browser: browserType = "chromium",
    noSandbox = false,
    includeWordPressPresets = false,
  } = options;

  const browserEngine = browserType === "firefox" ? firefox : chromium;
  const launchArgs =
    browserType === "firefox" ? [] : ["--disable-blink-features=AutomationControlled"];
  if (noSandbox && browserType === "chromium") {
    launchArgs.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  let browser = null;
  let useHeaded = false;

  while (true) {
    browser = await browserEngine.launch({
      headless: !useHeaded,
      args: launchArgs,
    });

    try {
      const result = await extractBranding(normalizedUrl, silentSpinner, browser, {
        navigationTimeout: 90000,
        darkMode,
        mobile,
        explore,
        slow,
        includeWordPressPresets,
      });
      await browser.close();
      return result;
    } catch (err) {
      await browser.close();
      browser = null;

      if (useHeaded) throw err;

      if (
        err.message.includes("Timeout") ||
        err.message.includes("net::ERR_")
      ) {
        useHeaded = true;
        continue;
      }
      throw err;
    }
  }
}
