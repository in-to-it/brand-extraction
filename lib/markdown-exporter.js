/**
 * Markdown Exporter
 *
 * Exports brand extraction results to a concise markdown file in output_markdown/
 */

import { convertColor } from './colors.js';

function normalizeColor(colorString) {
  const converted = convertColor(colorString);
  return converted?.hex || colorString;
}

function isResolvedColor(val) {
  if (!val || typeof val !== 'string') return false;
  return val.startsWith('#') || val.startsWith('rgb') || val.startsWith('rgba');
}

function colorSwatch(hex) {
  if (!hex || hex === '—' || !hex.startsWith('#')) return hex;
  return `<span style="color:${hex}">■</span> \`${hex}\``;
}

/** Score button for primary CTA likelihood: non-gray + bold = primary */
function scorePrimaryCta(btn) {
  const def = btn.states?.default;
  if (!def) return 0;
  const bgHex = isResolvedColor(def.backgroundColor) ? normalizeColor(def.backgroundColor) : '';
  const weight = parseInt(btn.fontWeight, 10) || 400;
  const isBold = weight >= 600;
  const isGray = (hex) => {
    if (!hex || hex.length < 7) return true;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const diff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    return diff < 40;
  };
  let score = 0;
  if (!isGray(bgHex)) score += 2;
  if (isBold) score += 1;
  return score;
}

/** Parse border string "2px solid #fff" or "1px solid #e8e8e1" into { width, style, color } */
function parseBorder(borderStr) {
  if (!borderStr || borderStr === 'none') return null;
  const colorMatch = borderStr.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|rgb\([^)]+\)/);
  const color = colorMatch ? (isResolvedColor(colorMatch[0]) ? normalizeColor(colorMatch[0]) : colorMatch[0]) : null;
  const parts = borderStr.replace(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|rgb\([^)]+\)/g, '').trim().split(/\s+/).filter(Boolean);
  const widthMatch = borderStr.match(/(\d+(?:\.\d+)?(?:px|em|rem)?)\s/);
  const styleMatch = borderStr.match(/\b(solid|dashed|dotted|double|none)\b/);
  return {
    width: widthMatch ? widthMatch[1] : (parts[0] || '—'),
    style: styleMatch ? styleMatch[1] : (parts.find(p => ['solid','dashed','dotted','double','none'].includes(p)) || 'solid'),
    color: color || '—',
  };
}

function toMarkdown(data) {
  const lines = [];
  const domain = new URL(data.url).hostname.replace('www.', '');
  const extractedAt = new Date(data.extractedAt);
  const time = extractedAt.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' EST';

  lines.push('# Brand Extraction');
  lines.push('');
  lines.push('Style guide for applying brand to popup templates, marketing templates, and UI components.');
  lines.push('');
  lines.push(`- **URL:** ${data.url}`);
  lines.push(`- **Extracted:** ${time}`);
  if (data.theme?.theme) {
    lines.push(`- **Theme:** ${data.theme.theme}`);
  }
  lines.push('');

  // Logo
  if (data.logo?.url) {
    lines.push('## Logo');
    lines.push('');
    lines.push(`- [${data.logo.url}](${data.logo.url})`);
    if (data.logo.width && data.logo.height) {
      lines.push(`- ${data.logo.width}×${data.logo.height}px`);
    }
    lines.push('');
  }

  // Favicons
  if (data.favicons?.length > 0) {
    lines.push('## Favicons');
    lines.push('');
    data.favicons.forEach((f) => {
      lines.push(`- ${f.type}: [${f.url}](${f.url})`);
    });
    lines.push('');
  }

  // Colors — hex palette ordered by prominence (primary first)
  if (data.colors) {
    lines.push('## Colors');
    lines.push('');
    lines.push('Brand color palette. Use for backgrounds, text, accents, and borders.');
    lines.push('');

    // Build ordered list: { hex, prominence, usage } — palette has prominence and usage
    const colorEntries = [];
    const seen = new Set();

    if (data.colors.palette) {
      data.colors.palette.forEach((c) => {
        const hex = normalizeColor(c.color);
        if (hex && !seen.has(hex)) {
          seen.add(hex);
          colorEntries.push({
            hex,
            prominence: c.prominence ?? 0,
            usage: c.usage || "accent",
          });
        }
      });
    }
    if (data.colors.semantic) {
      Object.values(data.colors.semantic)
        .filter(Boolean)
        .forEach((c) => {
          const hex = normalizeColor(c);
          if (hex && !seen.has(hex)) {
            seen.add(hex);
            colorEntries.push({ hex, prominence: 5, usage: "semantic" });
          }
        });
    }
    if (data.colors.cssVariables) {
      Object.values(data.colors.cssVariables).forEach((varData) => {
        const val = typeof varData === 'string' ? varData : varData?.value;
        const hex = normalizeColor(val);
        if (hex && !seen.has(hex)) {
          seen.add(hex);
          colorEntries.push({ hex, prominence: 3, usage: "variable" });
        }
      });
    }
    if (data.components?.buttons) {
      data.components.buttons.forEach((b) => {
        const bg = b.states?.default?.backgroundColor;
        if (bg && isResolvedColor(bg)) {
          const hex = normalizeColor(bg);
          if (hex && !seen.has(hex)) {
            seen.add(hex);
            colorEntries.push({ hex, prominence: 4, usage: "button" });
          }
        }
      });
    }
    if (data.components?.inputs?.text) {
      data.components.inputs.text.forEach((i) => {
        const bg = i.states?.default?.backgroundColor;
        if (bg && isResolvedColor(bg)) {
          const hex = normalizeColor(bg);
          if (hex && !seen.has(hex)) {
            seen.add(hex);
            colorEntries.push({ hex, prominence: 4, usage: "input" });
          }
        }
      });
    }

    // Sort by prominence descending
    colorEntries.sort((a, b) => (b.prominence ?? 0) - (a.prominence ?? 0));

    // Group: Primary (top 8), Secondary (next 8), Accent (rest) — with usage context
    const primary = colorEntries.slice(0, 8);
    const secondary = colorEntries.slice(8, 16);
    const accent = colorEntries.slice(16);

    const usageLabel = (entries, fallback) => {
      const usages = entries.map((e) => e.usage).filter(Boolean);
      if (usages.some((u) => u === "background")) return "backgrounds, section blocks";
      if (usages.some((u) => u === "text, icons")) return "text, icons, small accents";
      if (usages.some((u) => u === "accent")) return "small details, borders, labels";
      return fallback;
    };

    const paletteSwatch = (hex) =>
      hex.startsWith('#') ? `<span style="color:${hex}">■</span> ${hex}` : hex;

    if (primary.length > 0) {
      const hint = usageLabel(primary, "dominant backgrounds, key CTAs");
      lines.push(`**Primary** (${hint}): ` + primary.map((e) => paletteSwatch(e.hex)).join(', '));
      lines.push('');
    }
    if (secondary.length > 0) {
      const hint = usageLabel(secondary, "text, icons, small accents");
      lines.push(`**Secondary** (${hint}): ` + secondary.map((e) => paletteSwatch(e.hex)).join(', '));
      lines.push('');
    }
    if (accent.length > 0) {
      const hint = usageLabel(accent, "small details, borders, labels");
      lines.push(`**Accent** (${hint}): ` + accent.map((e) => paletteSwatch(e.hex)).join(', '));
      lines.push('');
    }
    if (primary.length === 0 && secondary.length === 0 && accent.length === 0) {
      lines.push('(No colors extracted)');
      lines.push('');
    }
  }

  // Typography — simplified, one per category with color
  if (data.typography?.styles?.length > 0) {
    lines.push('## Typography');
    lines.push('');

    const styles = data.typography.styles;
    const byContext = { 'heading-1': [], body: [], caption: [], button: [], link: [] };
    styles.forEach((s) => {
      const ctx = s.context || 'heading-1';
      const px = parseFloat(s.size);
      const isBody = ctx === 'heading-1' && px >= 14 && px <= 20;
      if (ctx === 'button' || ctx === 'link') {
        byContext[ctx].push(s);
      } else if (ctx === 'caption' || px <= 14) {
        byContext.caption.push(s);
      } else if (isBody) {
        byContext.body.push(s);
      } else {
        byContext['heading-1'].push(s);
      }
    });

    const contextLabels = { 'heading-1': 'Headline', body: 'Body', caption: 'Caption', button: 'Button text', link: 'Link text' };
    const order = ['heading-1', 'body', 'caption', 'button', 'link'];

    order.forEach((ctx) => {
      const list = byContext[ctx];
      if (!list?.length) return;
      const label = contextLabels[ctx] || ctx;
      const s = list[0];
      const colorHex = s.color && isResolvedColor(s.color) ? normalizeColor(s.color) : null;
      const parts = [
        `**${s.family}**`,
        s.size,
        `weight ${s.weight}`,
        colorHex ? `color ${colorSwatch(colorHex)}` : null,
        s.lineHeight ? `line-height ${s.lineHeight}` : null,
        s.spacing ? `letter-spacing ${s.spacing}` : null,
        s.transform ? `text-transform ${s.transform}` : null,
      ].filter(Boolean);
      lines.push(`- **${label}:** ${parts.join(', ')}`);
    });
    lines.push('');
  }

  // CTAs / Buttons — full style guide for popups, templates, marketing
  if (data.components?.buttons?.length > 0) {
    lines.push('## CTAs');
    lines.push('');
    lines.push('Button style guide. Apply these specs to CTA buttons in popups, forms, and marketing templates.');
    lines.push('');

    const buttons = data.components.buttons
      .filter((b) => b.confidence === 'high')
      .slice(0, 8);

    const primaryIdx = buttons.reduce((best, b, i) =>
      scorePrimaryCta(b) > scorePrimaryCta(buttons[best]) ? i : best, 0);

    // Primary CTA first, then other variants
    const sortedButtons = [
      buttons[primaryIdx],
      ...buttons.slice(0, primaryIdx),
      ...buttons.slice(primaryIdx + 1),
    ].filter(Boolean);

    sortedButtons.forEach((btn, i) => {
      const def = btn.states?.default;
      if (!def) return;

      const bgHex = isResolvedColor(def.backgroundColor)
        ? normalizeColor(def.backgroundColor)
        : '—';
      const textHex = isResolvedColor(def.color) ? normalizeColor(def.color) : '—';
      const border = parseBorder(def.border);
      const shadow = def.boxShadow && def.boxShadow !== 'none' ? def.boxShadow : null;

      const label = i === 0 ? 'Primary CTA' : `CTA variant ${i + 1}`;
      lines.push(`### ${label}`);
      lines.push('');
      lines.push(`- **Background:** ${colorSwatch(bgHex)}`);
      lines.push(`- **Text color:** ${colorSwatch(textHex)}`);
      lines.push(`- **Font:** ${btn.fontFamily || 'inherit'}, ${btn.fontSize || 'inherit'}, weight ${btn.fontWeight || '400'}`);
      if (btn.letterSpacing) lines.push(`- **Letter spacing:** ${btn.letterSpacing}`);
      if (btn.textTransform) lines.push(`- **Text transform:** ${btn.textTransform}`);
      lines.push(`- **Border radius:** ${def.borderRadius || '0'}`);
      const hasBorder = border && border.style !== 'none' && parseFloat(border.width) > 0;
      if (hasBorder) {
        lines.push(`- **Border:** ${border.width} ${border.style} ${border.color}`);
      } else {
        lines.push(`- **Border:** none`);
      }
      lines.push(`- **Padding:** ${def.padding || '—'}`);
      if (shadow) lines.push(`- **Box shadow:** \`${shadow}\``);
      if (btn.states?.hover?.backgroundColor || btn.states?.hover?.color) {
        const h = btn.states.hover;
        const hBg = isResolvedColor(h.backgroundColor) ? normalizeColor(h.backgroundColor) : null;
        const hColor = isResolvedColor(h.color) ? normalizeColor(h.color) : null;
        if (hBg || hColor) lines.push(`- **Hover:** ${hBg ? `bg ${colorSwatch(hBg)}` : ''} ${hColor ? `text ${colorSwatch(hColor)}` : ''}`.trim());
      }
      lines.push('');
    });
  }

  // Inputs — full style guide for form fields
  if (data.components?.inputs?.text?.length > 0) {
    lines.push('## Inputs');
    lines.push('');
    lines.push('Form field style guide for email, text, search inputs in popups and templates.');
    lines.push('');

    data.components.inputs.text.slice(0, 5).forEach((input, i) => {
      const def = input.states?.default;
      if (!def) return;

      const bgHex = isResolvedColor(def.backgroundColor)
        ? normalizeColor(def.backgroundColor)
        : '—';
      const textHex = isResolvedColor(def.color) ? normalizeColor(def.color) : '—';
      const border = parseBorder(def.border);

      lines.push(`### Input variant ${i + 1} (${input.specificType})`);
      lines.push('');
      lines.push(`- **Background:** ${colorSwatch(bgHex)}`);
      lines.push(`- **Text color:** ${colorSwatch(textHex)}`);
      lines.push(`- **Font:** ${def.fontFamily || 'inherit'}, ${def.fontSize || 'inherit'}, weight ${def.fontWeight || '400'}`);
      lines.push(`- **Border radius:** ${def.borderRadius || '0'}`);
      const hasBorder = border && border.style !== 'none' && parseFloat(border.width) > 0;
      if (hasBorder) {
        lines.push(`- **Border:** ${border.width} ${border.style} ${border.color}`);
      } else {
        lines.push(`- **Border:** none`);
      }
      lines.push(`- **Padding:** ${def.padding || '—'}`);
      if (def.boxShadow && def.boxShadow !== 'none') lines.push(`- **Box shadow:** \`${def.boxShadow}\``);
      if (input.states?.focus?.borderColor || input.states?.focus?.border) {
        const f = input.states.focus;
        const fBorder = parseBorder(f.border);
        const fColor = f.borderColor && isResolvedColor(f.borderColor) ? normalizeColor(f.borderColor) : (fBorder?.color);
        if (fBorder || fColor) {
          lines.push(`- **Focus border:** ${fBorder ? `${fBorder.width} ${fBorder.style} ${fBorder.color}` : `color ${fColor}`}`);
        }
      }
      lines.push('');
    });
  }

  // Links — full style guide for text links
  if (data.components?.links?.length > 0) {
    lines.push('## Links');
    lines.push('');
    lines.push('Link style guide for inline links, nav links, and CTAs styled as links.');
    lines.push('');

    data.components.links.slice(0, 6).forEach((link, i) => {
      const defHex = normalizeColor(link.color);
      const hover = link.states?.hover?.color;
      const hoverHex = isResolvedColor(hover) ? normalizeColor(hover) : null;

      lines.push(`### Link variant ${i + 1}`);
      lines.push('');
      lines.push(`- **Color:** ${colorSwatch(defHex)}`);
      lines.push(`- **Hover color:** ${colorSwatch(hoverHex || '—')}`);
      lines.push(`- **Font:** ${link.fontFamily || 'inherit'}, ${link.fontSize || 'inherit'}, weight ${link.fontWeight || '400'}`);
      lines.push(`- **Text decoration:** ${link.textDecoration || 'none'}`);
      if (link.states?.hover?.textDecoration) {
        lines.push(`- **Hover text decoration:** ${link.states.hover.textDecoration}`);
      }
      lines.push('');
    });
  }

  return lines.join('\n');
}

export function exportToMarkdown(data, outputMarkdownDir) {
  return toMarkdown(data);
}
