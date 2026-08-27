export type TargetLocationOption = {
  readonly key: string;
  readonly label: string;
};

export function areConfiguredTargetLocations(
  values: readonly string[],
  options: readonly TargetLocationOption[],
): boolean {
  const configuredLabels = new Set(options.map((option) => option.label.toLocaleLowerCase()));
  return (
    values.length > 0 && values.every((value) => configuredLabels.has(value.toLocaleLowerCase()))
  );
}
