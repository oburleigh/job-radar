import process from "node:process";

import {
  type ProductionPerformanceServer,
  startProductionPerformanceServer,
} from "./production-performance-server";

let productionServer: ProductionPerformanceServer | undefined;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stop(0);
  });
}

try {
  productionServer = await startProductionPerformanceServer();
  console.log(`Lighthouse server ready at ${productionServer.url}`);
  void productionServer.exited.then((exitCode) => stop(exitCode));
} catch (error) {
  console.error(error);
  await stop(1);
}

async function stop(exitCode: number): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;

  await productionServer?.stop();
  process.exitCode = exitCode;
}
