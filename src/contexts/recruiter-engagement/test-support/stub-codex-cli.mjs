#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const argumentValue = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

if (process.env.STUB_CODEX_ARGS_FILE) {
  writeFileSync(process.env.STUB_CODEX_ARGS_FILE, JSON.stringify(args));
}

if (process.env.STUB_CODEX_BEHAVIOUR === "hang") {
  setTimeout(() => {}, 60_000);
} else if (process.env.STUB_CODEX_BEHAVIOUR === "fail") {
  process.stderr.write("stub codex refused the request\n");
  process.exit(3);
} else if (process.env.STUB_CODEX_BEHAVIOUR === "silent") {
  process.exit(0);
} else {
  writeFileSync(argumentValue("-o"), process.env.STUB_CODEX_REPLY ?? "{}");
  process.exit(0);
}
