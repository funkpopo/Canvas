#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.resolve(__dirname, "../messages");

const locales = [
  { code: "en", file: "en.json" },
  { code: "zh", file: "zh.json" },
];

function flattenKeys(obj, prefix = "", out = new Map()) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out.set(prefix, obj);
    return out;
  }

  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenKeys(value, next, out);
    } else {
      out.set(next, value);
    }
  }

  return out;
}

function unique(values) {
  return [...new Set(values)];
}

async function loadLocale(fileName) {
  const filePath = path.join(messagesDir, fileName);
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function main() {
  const loaded = {};
  for (const locale of locales) {
    loaded[locale.code] = await loadLocale(locale.file);
  }

  const flattened = Object.fromEntries(
    locales.map((locale) => [locale.code, flattenKeys(loaded[locale.code])])
  );

  const allKeys = unique(locales.flatMap((locale) => [...flattened[locale.code].keys()])).sort();
  const errors = [];

  for (const locale of locales) {
    const localeKeys = flattened[locale.code];
    for (const key of allKeys) {
      if (!localeKeys.has(key)) {
        errors.push(`[${locale.code}] missing key: ${key}`);
      }
    }
  }

  for (const locale of locales) {
    const localeKeys = flattened[locale.code];
    for (const key of allKeys) {
      if (!localeKeys.has(key)) continue;
      const value = localeKeys.get(key);
      if (typeof value !== "string") {
        errors.push(`[${locale.code}] non-string value: ${key}`);
      } else if (value.trim() === "") {
        errors.push(`[${locale.code}] empty translation: ${key}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error("i18n check failed:");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`i18n check passed (${allKeys.length} keys, locales: ${locales.map((l) => l.code).join(", ")})`);
}

main().catch((err) => {
  console.error("i18n check failed with unexpected error:", err);
  process.exit(1);
});
