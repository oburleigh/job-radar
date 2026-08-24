import { createServer, type ServerResponse } from "node:http";
import process from "node:process";

const hostname = "127.0.0.1";
const port = 3200;
let successGate = createGate();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? hostname}`);

  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(204).end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/serper/success") {
    await consumeRequest(request);
    await successGate.promise;
    sendJson(response, 200, {
      organic: [
        {
          title: "Head of Engineering · Acme Fixture",
          snippet: "Lead the platform engineering organisation in Dubai.",
          link: "https://boards.greenhouse.io/acme-fixture/jobs/12345",
        },
      ],
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/control/reset-success") {
    successGate.release();
    successGate = createGate();
    response.writeHead(204).end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/control/release-success") {
    successGate.release();
    response.writeHead(204).end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/serper/failure") {
    await consumeRequest(request);
    sendJson(response, 503, { message: "Deterministic provider failure" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/serper/location-mismatch") {
    await consumeRequest(request);
    sendJson(response, 200, {
      organic: [
        {
          title: "Head of Engineering · Acme Toronto Fixture",
          snippet: "Lead the platform engineering organisation in Toronto.",
          link: "https://boards.greenhouse.io/acme-mismatch/jobs/67890",
        },
      ],
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/serper/web3-lead") {
    await consumeRequest(request);
    sendJson(response, 200, {
      organic: [
        {
          title: "Head of Engineering at Example Labs",
          snippet: "Lead the platform engineering organisation in Dubai.",
          link: "https://web3.career/head-of-engineering-example-labs/153058",
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/greenhouse/acme-fixture/jobs") {
    sendJson(response, 200, {
      jobs: [
        {
          id: 12345,
          internal_job_id: null,
          title: "Head of Engineering",
          company_name: "Acme Fixture",
          absolute_url: "https://boards.greenhouse.io/acme-fixture/jobs/12345",
          location: { name: "Dubai" },
          content: "<p>Lead the platform engineering organisation.</p>",
          departments: [{ name: "Engineering" }],
          first_published: new Date().toISOString(),
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/greenhouse/acme-mismatch/jobs") {
    sendJson(response, 200, {
      jobs: [
        {
          id: 67890,
          internal_job_id: null,
          title: "Head of Engineering",
          company_name: "Acme Toronto Fixture",
          absolute_url: "https://boards.greenhouse.io/acme-mismatch/jobs/67890",
          location: { name: "Toronto" },
          content: "<p>Lead the platform engineering organisation.</p>",
          departments: [{ name: "Engineering" }],
          first_published: new Date().toISOString(),
        },
      ],
    });
    return;
  }

  sendJson(response, 404, { message: "Fixture route not found" });
});

server.listen(port, hostname);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

async function consumeRequest(request: NodeJS.ReadableStream): Promise<void> {
  for await (const _chunk of request) {
    // Consume the request body so the keep-alive connection can be reused.
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function createGate(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
