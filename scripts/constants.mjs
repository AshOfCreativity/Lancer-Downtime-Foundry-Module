/**
 * Module constants
 */

export const MODULE_ID = "Lancer-Downtime-Foundry-Module-main";

export const SETTINGS = {
  customActionSets: "customActionSets",
  activeActionSets: "activeActionSets",
  markers: "markers",
  activeMarkerId: "activeMarkerId",
  journalSyncConfig: "journalSyncConfig"
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
export function createHistoryEntry(sessionId, action, result, markerId = null) {
  return {
    id: foundry.utils.randomID(),
    actionId: action.id,
    actionName: action.name,
    actionSetId: action.actionSetId || null,
    markerId: markerId,
    timestamp: new Date().toISOString(),
    result: {
      success: result.success ?? true,
      rollResult: result.rollResult ?? null,
      description: result.description || "",
      rollData: result.rollData || null
    }
  };
}

/**
 * Create a marker entry
 */
export function createMarker(title, description, downtimeAllowed, restrictions, order = 0, characterIds = []) {
  return {
    id: foundry.utils.randomID(),
    title: title,
    description: description,
    downtimeAllowed: downtimeAllowed,
    restrictions: restrictions,
    order: order,
    characterIds: characterIds,
    timestamp: new Date().toISOString()
  };
}
