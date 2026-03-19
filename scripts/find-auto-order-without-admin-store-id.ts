import fs from "fs";
import path from "path";

type ModelMatch = {
  name: string;
  startLine: number;
};

const schemaArg = process.argv[2] ?? "prisma/schema.prisma";
const fromArg = Number(process.argv[3] ?? 1518);
const toArg = Number(process.argv[4] ?? 1592);

const schemaPath = path.isAbsolute(schemaArg)
  ? schemaArg
  : path.resolve(process.cwd(), schemaArg);

if (!Number.isFinite(fromArg) || !Number.isFinite(toArg) || fromArg <= 0 || toArg < fromArg) {
  console.error("Invalid line range. Usage: ts-node scripts/find-auto-order-without-admin-store-id.ts [schemaPath] [fromLine] [toLine]");
  process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
  console.error(`Schema file not found: ${schemaPath}`);
  process.exit(1);
}

const content = fs.readFileSync(schemaPath, "utf8");
const allLines = content.split(/\r?\n/);
const scopedLines = allLines.slice(fromArg - 1, toArg);
const scopedText = scopedLines.join("\n");

const modelRegex = /model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\n\}/g;
const matches: ModelMatch[] = [];

let modelMatch: RegExpExecArray | null = null;
while ((modelMatch = modelRegex.exec(scopedText)) !== null) {
  const fullModelText = modelMatch[0];
  const modelName = modelMatch[1];
  const hasAutoOrderTrue =
    /(?:^|\n)\s*auto_order\b[^\n]*\btrue\b/i.test(fullModelText) ||
    /\bauto_order\s*=\s*true\b/i.test(fullModelText);
  const hasAdminStoreId = /\badminStoreId\b/.test(fullModelText);

  if (hasAutoOrderTrue && !hasAdminStoreId) {
    const startOffset = modelMatch.index;
    const beforeMatch = scopedText.slice(0, startOffset);
    const startLine = fromArg + beforeMatch.split("\n").length - 1;
    matches.push({ name: modelName, startLine });
  }
}

console.log(`Scanning: ${schemaPath}`);
console.log(`Line range: ${fromArg}-${toArg}`);
console.log("");

if (matches.length === 0) {
  console.log("No matching models found.");
} else {
  console.log("Matching models (in schema order):");
  matches.forEach((entry, index) => {
    console.log(`${index + 1}. ${entry.name} (starts at line ${entry.startLine})`);
  });
}

console.log("");
console.log(`Total count: ${matches.length}`);
