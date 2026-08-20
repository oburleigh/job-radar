export interface SaveAtsIntegrationCommand {
  readonly atsType: string;
  readonly isNew: boolean;
  readonly label: string;
  readonly searchPatterns: readonly string[];
  readonly hostnames: readonly string[];
  readonly hostSuffixes: readonly string[];
  readonly supportsBoardSync: boolean;
  readonly priority: number;
  readonly pageSize: number | null;
  readonly endpoints: Readonly<Record<string, string>>;
}
