/**
 * LANCER Downtime Tracker - Main Entry Point
 */

import { MODULE_ID, SETTINGS, getDefaultCharacterDowntimeData } from "./constants.mjs";
import { DowntimeTrackerApp } from "./DowntimeTrackerApp.mjs";
import { getBuiltInActionSets } from "./downtime-actions.mjs";

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
    hasFarFieldData: !!a.getFlag("lancer-far-field", "character")
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
    getAvailableCharacters
  };
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);
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
