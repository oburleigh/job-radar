import "dotenv/config";

import { syncEnabledBoards } from "../src/infrastructure/discovery/sync";

async function main() {
  const sourceValue = valueAfter(process.argv.slice(2), "--source");
  const source = sourceValue || undefined;
  const results = await syncEnabledBoards(source);

  for (const result of results) {
    const status = result.error ? `error: ${result.error}` : "ok";
    console.log(
      `Board ${result.boardId}: ${result.created} created, ${result.updated} updated, ${status}`,
    );
  }
}

function valueAfter(values: string[], flag: string): string | undefined {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}
void main();
