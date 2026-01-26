/**
 * Module constants
 */

export const MODULE_ID = "Lancer-Downtime-Foundry-Module-main";

export const SETTINGS = {
  customActionSets: "customActionSets",
  activeActionSets: "activeActionSets"
};

export const PHASES = {
  TRANSIT: "transit",
  BETWEEN_MISSIONS: "between-missions",
  SHORE_LEAVE: "shore-leave"
};

export const CATEGORIES = {
  REST: "rest",
  MAINTENANCE: "maintenance",
  DEVELOPMENT: "development",
  SOCIAL: "social",
  LOGISTICS: "logistics",
  PERSONAL: "personal",
  ACQUISITION: "acquisition"
};

/**
 * Default character downtime data (stored in actor flags)
 */
export function getDefaultCharacterDowntimeData() {
  return {
    history: [],
    projects: [],
    stats: {
      totalActions: 0,
      lastDowntime: null
    }
  };
}

/**
 * Create a history entry
 */
export function createHistoryEntry(sessionId, action, result) {
  return {
    id: foundry.utils.randomID(),
    actionId: action.id,
    actionName: action.name,
    timestamp: new Date().toISOString(),
    result: {
      success: result.success ?? true,
      rollResult: result.rollResult ?? null,
      description: result.description || ""
    }
  };
}
