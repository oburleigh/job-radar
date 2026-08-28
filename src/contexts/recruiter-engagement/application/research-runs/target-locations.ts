export type TargetLocationOption = {
  readonly key: string;
  readonly label: string;
};

export function areCatalogueTargetLocations(
  values: readonly string[],
  options: readonly TargetLocationOption[],
): boolean {
  const catalogueLabels = new Set(options.map((option) => option.label.toLocaleLowerCase()));
  return (
    values.length > 0 && values.every((value) => catalogueLabels.has(value.toLocaleLowerCase()))
  );
}
