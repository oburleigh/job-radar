interface SettingsEditor {
  readonly ats?: string;
  readonly create?: boolean;
}

export function settingsUrl(editor: SettingsEditor = {}): string {
  const searchParams = new URLSearchParams();
  if (editor.ats) {
    searchParams.set("ats", editor.ats);
  }
  if (editor.create) {
    searchParams.set("new", "1");
  }
  const query = searchParams.toString();
  const path = "/settings/adapters/ats-registry";
  return query ? `${path}?${query}` : path;
}
