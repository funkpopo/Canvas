#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const scanRoots = ["app", "components"];
const baselinePath = path.resolve(__dirname, "baselines/a11y-buttons-baseline.json");
const shouldUpdateBaseline = process.argv.includes("--update");

async function walkFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      await walkFiles(fullPath, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    out.push(fullPath);
  }
  return out;
}

function getTagName(tagName) {
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return "";
}

function hasAccessibleAttr(openingElement) {
  return openingElement.attributes.properties.some((attr) => {
    if (!ts.isJsxAttribute(attr)) return false;
    const name = attr.name.text;
    return name === "aria-label" || name === "aria-labelledby" || name === "title";
  });
}

function expressionContainsText(node) {
  if (!node) return false;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.trim().length > 0;
  }
  if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)) {
    return true;
  }
  if (ts.isTemplateExpression(node)) {
    return node.getText().replace(/[`${}]/g, "").trim().length > 0;
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    return nodeContainsText(node);
  }
  if (ts.isParenthesizedExpression(node)) {
    return expressionContainsText(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return expressionContainsText(node.whenTrue) || expressionContainsText(node.whenFalse);
  }
  if (ts.isBinaryExpression(node)) {
    return expressionContainsText(node.left) || expressionContainsText(node.right);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => expressionContainsText(element));
  }
  if (
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isCallExpression(node)
  ) {
    // Dynamic expression (e.g. t("..."), label variable) likely renders readable text.
    return true;
  }
  return false;
}

function nodeContainsText(node) {
  if (ts.isJsxText(node)) return node.getText().trim().length > 0;
  if (ts.isJsxExpression(node)) return expressionContainsText(node.expression);
  if (ts.isJsxElement(node)) return node.children.some((child) => nodeContainsText(child));
  if (ts.isJsxFragment(node)) return node.children.some((child) => nodeContainsText(child));
  return false;
}

function getLineAndCol(sourceFile, node) {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: pos.line + 1, col: pos.character + 1 };
}

function collectViolations(sourceFile, relPath) {
  const violations = [];

  function visit(node) {
    if (ts.isJsxElement(node)) {
      const tagName = getTagName(node.openingElement.tagName);
      if (tagName === "Button") {
        const hasAttr = hasAccessibleAttr(node.openingElement);
        const hasText = node.children.some((child) => nodeContainsText(child));
        if (!hasAttr && !hasText) {
          const { line, col } = getLineAndCol(sourceFile, node.openingElement);
          violations.push({
            id: `${relPath}:${line}:${col}`,
            path: relPath,
            line,
            col,
          });
        }
      }
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagName(node.tagName);
      if (tagName === "Button" && !hasAccessibleAttr(node)) {
        const { line, col } = getLineAndCol(sourceFile, node);
        violations.push({
          id: `${relPath}:${line}:${col}`,
          path: relPath,
          line,
          col,
        });
      }
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
      files.push(...(await walkFiles(abs)));
    } catch {
      // ignore missing directories
    }
  }

  const violations = [];
  for (const filePath of files) {
    const relPath = path.relative(projectRoot, filePath).replaceAll("\\", "/");
    const sourceText = await fs.readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    violations.push(...collectViolations(sourceFile, relPath));
  }

  const allIds = new Set(violations.map((item) => item.id));
  if (shouldUpdateBaseline) {
    await writeBaseline(allIds);
    console.log(`Updated a11y button baseline: ${allIds.size} entries`);
    return;
  }

  const baseline = await loadBaseline();
  const newViolations = violations.filter((item) => !baseline.has(item.id));

  if (newViolations.length > 0) {
    console.error("a11y check failed. Icon-only Button without accessible name:");
    for (const item of newViolations) {
      console.error(`- ${item.path}:${item.line}:${item.col}`);
    }
    console.error("\nAdd aria-label/title or visible text, or run: npm run a11y:baseline");
    process.exit(1);
  }

  console.log(`a11y check passed (${allIds.size} tracked icon-only button cases, no new violations).`);
}

main().catch((err) => {
  console.error("a11y check failed with unexpected error:", err);
  process.exit(1);
});
