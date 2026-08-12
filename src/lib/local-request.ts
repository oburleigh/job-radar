export function assertLocalHost(hostValue: string): void {
  if (process.env.ALLOW_REMOTE_UI === "1") {
    return;
  }

  const host = hostValue.toLowerCase();
  const isLocal =
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host.startsWith("127.0.0.1:") ||
    host === "[::1]" ||
    host.startsWith("[::1]:");
  if (!isLocal) {
    throw new Error("Mutations are restricted to localhost. Set ALLOW_REMOTE_UI=1 to override.");
  }
}
