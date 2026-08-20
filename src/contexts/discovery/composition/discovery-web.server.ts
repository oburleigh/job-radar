import { createSaveAtsIntegration } from "../application/ats-integrations/save/use-case";
import { createChangeJobListingState } from "../application/job-listings/change-state/use-case";
import type { RuntimeSettingsCommand } from "../application/runtime-settings/save/command";
import { createSaveRuntimeSettings } from "../application/runtime-settings/save/use-case";
import { createDeleteSearchProfile } from "../application/search-profiles/delete/use-case";
import { createSaveSearchProfile } from "../application/search-profiles/save/use-case";
import { createAddJobSource } from "../application/source-coverage/add/use-case";
import { createSetSourceCoverageEnabled } from "../application/source-coverage/set-enabled/use-case";
import { createSyncSourceCoverage } from "../application/source-coverage/sync/use-case";
import { getJobRadarConfig } from "../infrastructure/configuration/job-radar-config";
import { isBuiltInAtsType } from "../infrastructure/job-sources/ats-integration";
import { getAtsLabels } from "../infrastructure/job-sources/catalog";
import { createJobSourceRegistrar } from "../infrastructure/job-sources/job-source-registrar";
import { getSearchProviderOptions } from "../infrastructure/search/web-search-provider";
import { db } from "../infrastructure/sqlite/database";
import { getDashboardData } from "../infrastructure/sqlite/read-models/dashboard";
import { getProfiles } from "../infrastructure/sqlite/read-models/profiles";
import { getRunDetail, getRunsData } from "../infrastructure/sqlite/read-models/runs";
import { getSettingsData } from "../infrastructure/sqlite/read-models/settings";
import { getSourcesData } from "../infrastructure/sqlite/read-models/sources";
import { createSqliteSearchProfileRepository } from "../infrastructure/sqlite/search-profile-repository";
import { createSqliteAtsIntegrationRegistry } from "../infrastructure/sqlite/sqlite-ats-integration-registry";
import { sqliteBoardSynchronizer } from "../infrastructure/sqlite/sqlite-board-synchronizer";
import { createSqliteJobListingStateStore } from "../infrastructure/sqlite/sqlite-job-listing-state-store";
import { createSqliteRuntimeSettingsStore } from "../infrastructure/sqlite/sqlite-runtime-settings-store";
import { createSqliteSearchProfileCatalog } from "../infrastructure/sqlite/sqlite-search-profile-catalog";
import { createSqliteSourceCoverageStore } from "../infrastructure/sqlite/sqlite-source-coverage-store";

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

export const discoveryWeb = {
  addJobSource,
  changeJobListingState,
  canConfigureBoardSync: isBuiltInAtsType,
  getAtsLabels,
  getDashboardData,
  getProfiles,
  getRunDetail,
  getRunsData,
  getSearchProviderOptions,
  getSettingsData,
  getSourcesData,
  getRuntimeSettings(): RuntimeSettingsCommand {
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
