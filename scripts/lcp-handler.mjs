/**
 * LCP Handler for importing custom downtime actions
 *
 * Processes LCP files that contain downtime_actions.json
 */

import { MODULE_ID, SETTINGS, CATEGORIES, PHASES } from "./constants.mjs";

/**
 * Process an LCP file for downtime actions
 * @param {File} file - The LCP file to process
 * @returns {Object} The imported action set
 */
export async function processDowntimeLCP(file) {
  // Load JSZip from CDN if not available
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip is required for LCP import. Please ensure it is loaded.");
  }

  const zip = new JSZip();
  const contents = await zip.loadAsync(file);

  // Look for downtime_actions.json
  const actionsFile = contents.file("downtime_actions.json");
  if (!actionsFile) {
    throw new Error("LCP does not contain downtime_actions.json");
  }

  const actionsText = await actionsFile.async("text");
  const actionsData = JSON.parse(actionsText);

  // Validate the data
  validateActionSet(actionsData);

  // Add metadata
  const actionSet = {
    ...actionsData,
    source: "lcp",
    importedAt: new Date().toISOString(),
    filename: file.name
  };

  // Store the action set
  await storeActionSet(actionSet);

  return actionSet;
}

/**
 * Validate an action set
 */
function validateActionSet(data) {
  if (!data.id || typeof data.id !== "string") {
    throw new Error("Action set must have a valid 'id' string");
  }
  if (!data.name || typeof data.name !== "string") {
    throw new Error("Action set must have a valid 'name' string");
  }
  if (!Array.isArray(data.actions)) {
    throw new Error("Action set must have an 'actions' array");
  }

  for (const action of data.actions) {
    if (!action.id || typeof action.id !== "string") {
      throw new Error(`Action must have a valid 'id' string`);
    }
    if (!action.name || typeof action.name !== "string") {
      throw new Error(`Action '${action.id}' must have a valid 'name' string`);
    }
    if (!action.description || typeof action.description !== "string") {
      throw new Error(`Action '${action.id}' must have a valid 'description' string`);
    }

    // Validate category if provided
    if (action.category && !Object.values(CATEGORIES).includes(action.category)) {
      console.warn(`Action '${action.id}' has unknown category '${action.category}'`);
    }

    // Validate phases if provided
    if (action.phases) {
      if (!Array.isArray(action.phases)) {
        throw new Error(`Action '${action.id}' phases must be an array`);
      }
      for (const phase of action.phases) {
        if (!Object.values(PHASES).includes(phase)) {
          console.warn(`Action '${action.id}' has unknown phase '${phase}'`);
        }
      }
    }
  }
}

/**
 * Store an action set in world settings
 */
async function storeActionSet(actionSet) {
  const existing = game.settings.get(MODULE_ID, SETTINGS.customActionSets) || [];

  // Remove existing set with same ID
  const updated = existing.filter(s => s.id !== actionSet.id);
  updated.push(actionSet);

  await game.settings.set(MODULE_ID, SETTINGS.customActionSets, updated);

  // Also add to active action sets
  const activeIds = game.settings.get(MODULE_ID, SETTINGS.activeActionSets) || [];
  if (!activeIds.includes(actionSet.id)) {
    await game.settings.set(MODULE_ID, SETTINGS.activeActionSets, [...activeIds, actionSet.id]);
  }
}

/**
 * Remove a custom action set
 */
export async function removeActionSet(setId) {
  const existing = game.settings.get(MODULE_ID, SETTINGS.customActionSets) || [];
  const updated = existing.filter(s => s.id !== setId);
  await game.settings.set(MODULE_ID, SETTINGS.customActionSets, updated);

  // Also remove from active sets
  const activeIds = game.settings.get(MODULE_ID, SETTINGS.activeActionSets) || [];
  await game.settings.set(MODULE_ID, SETTINGS.activeActionSets, activeIds.filter(id => id !== setId));
}

/**
 * Get all custom action sets
 */
export function getCustomActionSets() {
  return game.settings.get(MODULE_ID, SETTINGS.customActionSets) || [];
}

/**
 * Show the LCP import dialog
 */
export function showImportDialog() {
  const content = `
    <form class="import-lcp-form">
      <div class="form-group">
        <label>${game.i18n.localize("DOWNTIME.Dialogs.ImportLCP.SelectFile")}:</label>
        <input type="file" name="lcpFile" accept=".lcp,.zip" />
      </div>
      <p class="hint">LCP file must contain a downtime_actions.json file with action definitions.</p>
    </form>
  `;

  new Dialog({
    title: game.i18n.localize("DOWNTIME.Dialogs.ImportLCP.Title"),
    content,
    buttons: {
      import: {
        icon: '<i class="fas fa-file-import"></i>',
        label: game.i18n.localize("DOWNTIME.Dialogs.ImportLCP.Import"),
        callback: async (html) => {
          const fileInput = html.find('[name="lcpFile"]')[0];
          if (!fileInput.files.length) {
            ui.notifications.warn("Please select a file");
            return;
          }

          try {
            const actionSet = await processDowntimeLCP(fileInput.files[0]);
            ui.notifications.info(
              game.i18n.format("DOWNTIME.Dialogs.ImportLCP.Success", {
                count: actionSet.actions.length
              })
            );
          } catch (err) {
            console.error("LCP import failed:", err);
            ui.notifications.error(
              game.i18n.format("DOWNTIME.Dialogs.ImportLCP.Error", {
                error: err.message
              })
            );
          }
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("DOWNTIME.Dialogs.ImportLCP.Cancel")
      }
    },
    default: "import"
  }).render(true);
}

/**
 * Example LCP downtime_actions.json structure for documentation
 */
export const EXAMPLE_LCP_STRUCTURE = {
  id: "my-custom-actions",
  name: "My Custom Actions",
  system: "custom",
  version: "1.0.0",
  actions: [
    {
      id: "custom_action",
      name: "Custom Action",
      description: "Description of what this action does.",
      category: "development",
      phases: ["shore-leave"],
      requiresRoll: true,
      effects: []
    }
  ]
};
