import type { RuntimeNumericSetting } from "./constraints";

export type SaveRuntimeSettingsResult =
  | { readonly status: "saved" }
  | {
      readonly status: "rejected";
      readonly reason: "invalid-setting";
      readonly field: RuntimeNumericSetting | "marketVocabulary" | "salaryCurrency" | "userAgent";
    };
