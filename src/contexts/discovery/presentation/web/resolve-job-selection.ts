interface ProviderOption {
  readonly name: string;
  readonly configured: boolean;
}

interface ResolvedJobSelection {
  readonly profileId?: number;
  readonly provider?: string;
  readonly redirectTo?: string;
}

export function resolveJobSelection(
  url: URL,
  profileId: number | undefined,
  providers: readonly ProviderOption[],
): ResolvedJobSelection {
  if (!profileId) {
    return {};
  }

  const requestedProvider = url.searchParams.get("provider");
  const provider =
    providers.find((item) => item.name === requestedProvider)?.name ??
    providers.find((item) => item.configured)?.name ??
    providers[0]?.name;

  const profileMatches = url.searchParams.get("profile") === String(profileId);
  const providerMatches = provider === undefined || requestedProvider === provider;
  if (profileMatches && providerMatches) {
    return { profileId, ...(provider ? { provider } : {}) };
  }

  url.searchParams.set("profile", String(profileId));
  if (provider) {
    url.searchParams.set("provider", provider);
  } else {
    url.searchParams.delete("provider");
  }

  return {
    profileId,
    ...(provider ? { provider } : {}),
    redirectTo: `${url.pathname}?${url.searchParams.toString()}`,
  };
}
