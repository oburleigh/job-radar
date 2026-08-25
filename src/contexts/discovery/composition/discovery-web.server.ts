import { createSaveAtsIntegration } from "@/contexts/discovery/application/ats-integrations/save/use-case";
import { createDiagnoseKnownRole } from "@/contexts/discovery/application/discovery-runs/diagnose-known-role/use-case";
import { createChangeJobListingState } from "@/contexts/discovery/application/job-listings/change-state/use-case";
import { createSaveRuntimeSettings } from "@/contexts/discovery/application/runtime-settings/save/use-case";
import type { RuntimeSettings } from "@/contexts/discovery/application/runtime-settings/settings";
import { createDeleteSearchProfile } from "@/contexts/discovery/application/search-profiles/delete/use-case";
import { createSaveSearchProfile } from "@/contexts/discovery/application/search-profiles/save/use-case";
import { createAddJobSource } from "@/contexts/discovery/application/source-coverage/add/use-case";
import { createSetSourceCoverageEnabled } from "@/contexts/discovery/application/source-coverage/set-enabled/use-case";
import { createSyncSourceCoverage } from "@/contexts/discovery/application/source-coverage/sync/use-case";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { isBuiltInAtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { getAtsLabels } from "@/contexts/discovery/infrastructure/job-sources/catalog";
import { createJobSourceRegistrar } from "@/contexts/discovery/infrastructure/job-sources/job-source-registrar";
import { getSearchProviderOptions } from "@/contexts/discovery/infrastructure/search/web-search-provider";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { getDashboardData } from "@/contexts/discovery/infrastructure/sqlite/read-models/dashboard";
import { getProfiles } from "@/contexts/discovery/infrastructure/sqlite/read-models/profiles";
import {
  getRunDetail,
  getRunsData,
} from "@/contexts/discovery/infrastructure/sqlite/read-models/runs";
import { getSettingsData } from "@/contexts/discovery/infrastructure/sqlite/read-models/settings";
import { getSourcesData } from "@/contexts/discovery/infrastructure/sqlite/read-models/sources";
import { createSqliteSearchProfileRepository } from "@/contexts/discovery/infrastructure/sqlite/search-profile-repository";
import { createSqliteAtsIntegrationRegistry } from "@/contexts/discovery/infrastructure/sqlite/sqlite-ats-integration-registry";
import { sqliteBoardSynchronizer } from "@/contexts/discovery/infrastructure/sqlite/sqlite-board-synchronizer";
import { createSqliteJobListingStateStore } from "@/contexts/discovery/infrastructure/sqlite/sqlite-job-listing-state-store";
import { createSqliteKnownRoleDiagnostics } from "@/contexts/discovery/infrastructure/sqlite/sqlite-known-role-diagnostics";
import { createSqliteRuntimeSettingsStore } from "@/contexts/discovery/infrastructure/sqlite/sqlite-runtime-settings-store";
import { createSqliteSearchProfileCatalog } from "@/contexts/discovery/infrastructure/sqlite/sqlite-search-profile-catalog";
import { createSqliteSourceCoverageStore } from "@/contexts/discovery/infrastructure/sqlite/sqlite-source-coverage-store";

const changeJobListingState = createChangeJobListingState({
  states: createSqliteJobListingStateStore(db),
  now: () => new Date(),
});
const saveRuntimeSettings = createSaveRuntimeSettings({
  settings: createSqliteRuntimeSettingsStore(db),
  now: () => new Date(),
});
const saveSearchProfile = createSaveSearchProfile({
  profiles: createSqliteSearchProfileRepository(db),
  now: () => new Date(),
});
const deleteSearchProfile = createDeleteSearchProfile({
  profiles: createSqliteSearchProfileCatalog(db),
});
const saveAtsIntegration = createSaveAtsIntegration({
  integrations: createSqliteAtsIntegrationRegistry(db),
  now: () => new Date(),
});
const setSourceCoverageEnabled = createSetSourceCoverageEnabled({
  coverage: createSqliteSourceCoverageStore(db),
});
const syncSourceCoverage = createSyncSourceCoverage({ boards: sqliteBoardSynchronizer });
const addJobSource = createAddJobSource({
  sources: createJobSourceRegistrar(db),
  now: () => new Date(),
});
const diagnoseKnownRole = createDiagnoseKnownRole({
  diagnostics: createSqliteKnownRoleDiagnostics(db),
});

export const discoveryWeb = {
  addJobSource,
  changeJobListingState,
  diagnoseKnownRole,
  canConfigureBoardSync: isBuiltInAtsType,
  getAtsLabels,
  getDashboardData: (filters: Parameters<typeof getDashboardData>[0]) =>
    getDashboardData(filters, db),
  getProfiles: () => getProfiles(db),
  getRunDetail,
  getRunsData,
  getSearchProviderOptions,
  getSettingsData,
  getSourcesData,
  getRuntimeSettings(): RuntimeSettings {
    const {
      network,
      discovery,
      matching,
      ui,
      searchProviders,
      integrationPolicy,
      profileDefaults,
    } = getJobRadarConfig();
    return {
      network,
      discovery,
      matching,
      ui,
      searchProviders,
      integrationPolicy,
      profileDefaults,
    };
  },
  getUiSettings() {
    return getJobRadarConfig().ui;
  },
  deleteSearchProfile,
  saveSearchProfile,
  saveAtsIntegration,
  saveRuntimeSettings,
  setSourceCoverageEnabled,
  syncSourceCoverage,
};
