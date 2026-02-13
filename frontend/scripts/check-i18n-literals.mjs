#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const scanRoots = ["app", "components"];
const baselinePath = path.resolve(__dirname, "baselines/i18n-literals-baseline.json");
const shouldUpdateBaseline = process.argv.includes("--update");

const CJK_REGEX = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

async function walkFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      await walkFiles(fullPath, out);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    out.push(fullPath);
  }
  return out;
}

function normalizeText(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

function getLineAndCol(sourceFile, node) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: pos.line + 1, col: pos.character + 1 };
}

function isToastLiteral(node) {
  if (!ts.isCallExpression(node.parent)) return false;
  const callee = node.parent.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  return ts.isIdentifier(callee.expression) && callee.expression.text === "toast";
}

function collectViolations(sourceFile, relPath) {
  const violations = [];

  function pushViolation(node, text) {
    const normalized = normalizeText(text);
    if (!normalized || !CJK_REGEX.test(normalized)) return;
    const { line, col } = getLineAndCol(sourceFile, node);
    violations.push({
      id: `${relPath}:${line}:${col}:${normalized}`,
      path: relPath,
      line,
      col,
      text: normalized,
    });
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      pushViolation(node, node.getText(sourceFile));
    }

    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      pushViolation(node.initializer, node.initializer.text);
    }

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isToastLiteral(node)) {
      pushViolation(node, node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

async function loadBaseline() {
  try {
    const content = await fs.readFile(baselinePath, "utf8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

async function writeBaseline(ids) {
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  await fs.writeFile(baselinePath, JSON.stringify([...ids].sort(), null, 2) + "\n", "utf8");
}

async function main() {
  const files = [];
  for (const root of scanRoots) {
    const abs = path.resolve(projectRoot, root);
    try {
      const rootFiles = await walkFiles(abs);
      files.push(...rootFiles);
    } catch {
      // ignore missing directories
    }
  }

  const allViolations = [];
  for (const absPath of files) {
    const relPath = path.relative(projectRoot, absPath).replaceAll("\\", "/");
    const sourceText = await fs.readFile(absPath, "utf8");
    const sourceFile = ts.createSourceFile(absPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    allViolations.push(...collectViolations(sourceFile, relPath));
  }

  const allIds = new Set(allViolations.map((item) => item.id));
  if (shouldUpdateBaseline) {
    await writeBaseline(allIds);
    console.log(`Updated i18n literal baseline: ${allIds.size} entries`);
    return;
  }

  const baseline = await loadBaseline();
  const newViolations = allViolations.filter((item) => !baseline.has(item.id));

  if (newViolations.length > 0) {
    console.error("i18n literal check failed. New hardcoded localized literals detected:");
    for (const item of newViolations) {
      console.error(`- ${item.path}:${item.line}:${item.col} -> ${item.text}`);
    }
    console.error("\nIf these are intentional, run: npm run i18n:literals:baseline");
    process.exit(1);
  }

  console.log(`i18n literal check passed (${allIds.size} tracked literals, no new violations).`);
}

main().catch((err) => {
  console.error("i18n literal check failed with unexpected error:", err);
  process.exit(1);
});

