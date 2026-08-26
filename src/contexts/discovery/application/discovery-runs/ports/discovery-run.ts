export type StartDiscoveryRunCommand = {
  readonly profileId: number;
  readonly providerName: string | null;
};

export type DiscoveryRunExecution = StartDiscoveryRunCommand & {
  readonly runId: number;
  readonly signal?: AbortSignal;
};

export type DiscoveryRunFailure = {
  readonly runId: number;
  readonly message: string;
  readonly finishedAt: Date;
};
