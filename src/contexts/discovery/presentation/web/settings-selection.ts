export interface SettingsSelection {
  readonly profile: string;
  readonly provider: string;
}

interface ProfileOption {
  readonly id: number;
}

interface ProviderOption {
  readonly name: string;
}

interface SettingsEditor {
  readonly ats?: string;
  readonly create?: boolean;
}

export function resolveSettingsSelection(
  searchParams: URLSearchParams,
  profiles: readonly ProfileOption[],
  providers: readonly ProviderOption[],
): SettingsSelection | null {
  const requestedProfile = Number(searchParams.get("profile"));
  const requestedProvider = searchParams.get("provider");
  if (
    !Number.isInteger(requestedProfile) ||
    requestedProfile <= 0 ||
    !profiles.some((profile) => profile.id === requestedProfile) ||
    !requestedProvider ||
    !providers.some((provider) => provider.name === requestedProvider)
  ) {
    return null;
  }

  return { profile: String(requestedProfile), provider: requestedProvider };
}

export function settingsUrl(
  selection: SettingsSelection | null,
  editor: SettingsEditor = {},
): string {
  const searchParams = new URLSearchParams();
  if (selection) {
    searchParams.set("profile", selection.profile);
    searchParams.set("provider", selection.provider);
  }
  if (editor.ats) {
    searchParams.set("ats", editor.ats);
  }
  if (editor.create) {
    searchParams.set("new", "1");
  }
  const query = searchParams.toString();
  return query ? `/settings?${query}` : "/settings";
}
