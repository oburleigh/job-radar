export type StartDiscoveryRunCommand = {
  readonly profileId: number;
  readonly providerName: string;
};

export type DiscoveryRunExecution = StartDiscoveryRunCommand & {
  readonly runId: number;
};

export type DiscoveryRunFailure = {
  readonly runId: number;
  readonly message: string;
  readonly finishedAt: Date;
};
