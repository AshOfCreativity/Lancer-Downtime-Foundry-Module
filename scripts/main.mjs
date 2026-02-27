/**
 * LANCER Downtime Tracker - Main Entry Point
 */

import { MODULE_ID, SETTINGS, getDefaultCharacterDowntimeData, createMarker } from "./constants.mjs";
import { DowntimeTrackerApp } from "./DowntimeTrackerApp.mjs";
import { getBuiltInActionSets } from "./downtime-actions.mjs";
import {
  showRollDialog,
  executePilotCheck,
  executeDicePool,
  postRollToChat,
  ROLL_TYPES,
  CONDITIONAL_STATUS
} from "./roll-handler.mjs";

let downtimeApp = null;

/**
 * Register module settings
 */
function registerSettings() {
  // Custom action sets (from LCP imports)
  game.settings.register(MODULE_ID, SETTINGS.customActionSets, {
    name: "Custom Action Sets",
    hint: "Action sets imported from LCP files",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Which action sets are enabled
  game.settings.register(MODULE_ID, SETTINGS.activeActionSets, {
    name: "Active Action Sets",
    hint: "Which action sets are available for use",
    scope: "world",
    config: false,
    type: Array,
    default: ["lancer-core", "far-field"]
  });

  // Markers list
  game.settings.register(MODULE_ID, SETTINGS.markers, {
    name: "Markers",
    hint: "Downtime period markers",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Active marker ID
  game.settings.register(MODULE_ID, SETTINGS.activeMarkerId, {
    name: "Active Marker ID",
    hint: "Currently active marker",
    scope: "world",
    config: false,
    type: String,
    default: null
  });

  // Journal sync configuration
  game.settings.register(MODULE_ID, SETTINGS.journalSyncConfig, {
    name: "Journal Sync Config",
    hint: "Configuration for syncing downtime data to a journal entry",
    scope: "world",
    config: false,
    type: Object,
    default: {
      journalId: null,
      includeMarkerSummaries: true,
      includeActionHistory: true,
      includeRollResults: true,
      includedMarkerIds: []
    }
  });
}

/**
 * Add scene control button
 */
function addSceneControlButton(controls) {
  const notesControl = controls.find(c => c.name === "notes");
  if (notesControl) {
    notesControl.tools.push({
      name: "downtime-tracker",
      title: game.i18n.localize("DOWNTIME.Title"),
      icon: "fas fa-moon",
      button: true,
      onClick: () => openDowntimeTracker()
    });
  }
}

/**
 * Open the downtime tracker
 */
function openDowntimeTracker() {
  if (!downtimeApp) {
    downtimeApp = new DowntimeTrackerApp();
  }
  downtimeApp.render(true);
}

/**
 * Get character downtime data from actor flags
 */
export function getCharacterDowntimeData(actor) {
  const data = actor.getFlag(MODULE_ID, "data");
  return data || getDefaultCharacterDowntimeData();
}

/**
 * Update character downtime data
 */
export async function updateCharacterDowntimeData(actor, data) {
  const currentData = getCharacterDowntimeData(actor);
  const newData = foundry.utils.mergeObject(currentData, data, { inplace: false });
  return actor.setFlag(MODULE_ID, "data", newData);
}

/**
 * Get all action sets (built-in + custom)
 */
export function getAllActionSets() {
  const builtIn = getBuiltInActionSets();
  const custom = game.settings.get(MODULE_ID, SETTINGS.customActionSets) || [];
  return [...builtIn, ...custom];
}

/**
 * Get all markers
 */
export function getMarkers() {
  return game.settings.get(MODULE_ID, SETTINGS.markers) || [];
}

/**
 * Get the active marker
 */
export function getActiveMarker() {
  const activeId = game.settings.get(MODULE_ID, SETTINGS.activeMarkerId);
  if (!activeId) return null;
  const markers = getMarkers();
  return markers.find(m => m.id === activeId) || null;
}

/**
 * Add a new marker and set it as active
 */
export async function addMarker(title, description, downtimeAllowed, restrictions, characterIds = []) {
  const markers = getMarkers();
  const maxOrder = markers.reduce((max, m) => Math.max(max, m.order ?? 0), -1);
  const marker = createMarker(title, description, downtimeAllowed, restrictions, maxOrder + 1, characterIds);
  markers.push(marker);
  await game.settings.set(MODULE_ID, SETTINGS.markers, markers);
  await game.settings.set(MODULE_ID, SETTINGS.activeMarkerId, marker.id);
  return marker;
}

/**
 * Set the active marker by ID
 */
export async function setActiveMarker(markerId) {
  await game.settings.set(MODULE_ID, SETTINGS.activeMarkerId, markerId);
}

/**
 * Update an existing marker by ID
 */
export async function updateMarker(markerId, updates) {
  const markers = getMarkers();
  const index = markers.findIndex(m => m.id === markerId);
  if (index === -1) return null;
  markers[index] = foundry.utils.mergeObject(markers[index], updates, { inplace: false });
  await game.settings.set(MODULE_ID, SETTINGS.markers, markers);
  return markers[index];
}

/**
 * Delete a marker by ID
 */
export async function deleteMarker(markerId) {
  let markers = getMarkers();
  markers = markers.filter(m => m.id !== markerId);
  await game.settings.set(MODULE_ID, SETTINGS.markers, markers);
  // If deleted marker was active, fall back to last marker or null
  const activeId = game.settings.get(MODULE_ID, SETTINGS.activeMarkerId);
  if (activeId === markerId) {
    const fallback = markers.length > 0 ? markers[markers.length - 1].id : null;
    await game.settings.set(MODULE_ID, SETTINGS.activeMarkerId, fallback);
  }
}

/**
 * Reorder markers by accepting an array of {id, order} updates
 */
export async function reorderMarkers(orderUpdates) {
  const markers = getMarkers();
  const orderMap = new Map(orderUpdates.map(u => [u.id, u.order]));
  for (const marker of markers) {
    if (orderMap.has(marker.id)) {
      marker.order = orderMap.get(marker.id);
    }
  }
  await game.settings.set(MODULE_ID, SETTINGS.markers, markers);
}

/**
 * Get journal sync configuration
 */
export function getJournalSyncConfig() {
  return game.settings.get(MODULE_ID, SETTINGS.journalSyncConfig) || {
    journalId: null,
    includeMarkerSummaries: true,
    includeActionHistory: true,
    includeRollResults: true,
    includedMarkerIds: []
  };
}

/**
 * Set journal sync configuration
 */
export async function setJournalSyncConfig(config) {
  await game.settings.set(MODULE_ID, SETTINGS.journalSyncConfig, config);
}

/**
 * Get available pilots/characters
 */
export function getAvailableCharacters() {
  return game.actors.filter(a =>
    a.type === "pilot" && (a.isOwner || game.user.isGM)
  ).map(a => ({
    id: a.id,
    name: a.name,
    img: a.img,
    actor: a,
    downtimeData: getCharacterDowntimeData(a),
    hasFarFieldData: !!a.getFlag("Far-Field-Foundry-Module-main", "character")
  }));
}

// Hooks
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
  registerSettings();

  game.modules.get(MODULE_ID).api = {
    openTracker: openDowntimeTracker,
    getCharacterDowntimeData,
    updateCharacterDowntimeData,
    getAllActionSets,
    getAvailableCharacters,
    // Marker functions
    getMarkers,
    getActiveMarker,
    addMarker,
    setActiveMarker,
    updateMarker,
    deleteMarker,
    reorderMarkers,
    // Journal sync functions
    getJournalSyncConfig,
    setJournalSyncConfig,
    // Roll functions for external use
    roll: {
      showDialog: showRollDialog,
      pilotCheck: executePilotCheck,
      dicePool: executeDicePool,
      postToChat: postRollToChat,
      TYPES: ROLL_TYPES,
      CONDITIONAL_STATUS
    }
  };
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | Ready`);

  // Migrate markers (GM only)
  if (game.user.isGM) {
    const markers = getMarkers();
    let migrated = false;

    // Migrate: add order field if missing
    const needsOrderMigration = markers.some(m => m.order === undefined || m.order === null);
    if (needsOrderMigration) {
      console.log(`${MODULE_ID} | Migrating markers to add order field`);
      const sorted = [...markers].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      sorted.forEach((m, i) => { m.order = i; });
      migrated = true;
    }

    // Migrate: add characterIds field if missing
    const needsCharacterIdsMigration = markers.some(m => !Array.isArray(m.characterIds));
    if (needsCharacterIdsMigration) {
      console.log(`${MODULE_ID} | Migrating markers to add characterIds field`);
      markers.forEach(m => {
        if (!Array.isArray(m.characterIds)) m.characterIds = [];
      });
      migrated = true;
    }

    if (migrated) {
      await game.settings.set(MODULE_ID, SETTINGS.markers, markers);
    }
  }
});

Hooks.on("getSceneControlButtons", addSceneControlButton);

Hooks.on("renderActorDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  const button = $(`
    <button class="downtime-tracker-btn" title="${game.i18n.localize("DOWNTIME.Title")}">
      <i class="fas fa-moon"></i> Downtime
    </button>
  `);

  button.click(() => openDowntimeTracker());
  html.find(".directory-header .action-buttons").append(button);
});
