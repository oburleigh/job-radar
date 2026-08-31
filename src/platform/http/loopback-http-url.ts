export function parseLoopbackHttpUrl(value: string): URL | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const loopbackHosts = new Set(["127.0.0.1", "[::1]", "localhost"]);
  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname.toLowerCase()) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    return null;
  }

  return url;
}
