import pc from "picocolors";

export function printSuccess(message: string): void {
  console.log(`${pc.green("✓")} ${message}`);
}

export function printWarning(message: string): void {
  console.log(`${pc.yellow("!")} ${message}`);
}

export function printInfo(message: string): void {
  console.log(message);
}

export function printNextSteps(steps: string[]): void {
  if (!steps.length) return;
  console.log("\nNext:");
  for (const step of steps) console.log(`  ${step}`);
}

export function printDocsHint(section: string): void {
  console.log(`\nDocs:\n  README.md#${section}`);
}

export function formatPath(filePath: string): string {
  return filePath;
}
