/**
 * Downtime Tracker Application
 *
 * A standalone Application window for tracking downtime activities.
 */

import { MODULE_ID, SETTINGS, CATEGORIES, createHistoryEntry } from "./constants.mjs";
import { getBuiltInActionSets, getActionsFromSets } from "./downtime-actions.mjs";
import {
  getAvailableCharacters,
  getAllActionSets,
  getCharacterDowntimeData,
  updateCharacterDowntimeData,
  getMarkers,
  getActiveMarker,
  addMarker
} from "./main.mjs";
import {
  showRollDialog,
  postRollToChat,
  determineRollType,
  getBasePoolSize,
  getBaseAccuracy,
  ROLL_TYPES
} from "./roll-handler.mjs";

export class DowntimeTrackerApp extends Application {

  constructor(options = {}) {
    super(options);
    this.selectedCharacterId = null;
    this.filterCategory = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "Lancer-Downtime-Foundry-Module-main",
      title: game.i18n?.localize("DOWNTIME.Title") || "Downtime Tracker",
      template: `modules/${MODULE_ID}/templates/downtime-app.hbs`,
      classes: ["lancer", "downtime-tracker-app"],
      width: 800,
      height: 600,
      resizable: true,
      minimizable: true
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    // Get all characters
    context.characters = getAvailableCharacters().map(char => ({
      ...char,
      selected: char.id === this.selectedCharacterId
    }));

    // Selected character
    context.selectedCharacter = context.characters.find(c => c.id === this.selectedCharacterId);

    // Get active action set IDs from settings
    const activeSetIds = game.settings.get(MODULE_ID, SETTINGS.activeActionSets) || ["lancer-core", "far-field"];

    // Get all actions from active sets
    let actions = getActionsFromSets(activeSetIds);

    // Filter by category if set
    if (this.filterCategory) {
      actions = actions.filter(a => a.category === this.filterCategory);
    }

    // Group actions by action set
    const actionsBySet = {};
    for (const action of actions) {
      const setId = action.actionSetId;
      if (!actionsBySet[setId]) {
        actionsBySet[setId] = {
          id: setId,
          name: action.actionSetName,
          actions: []
        };
      }
      actionsBySet[setId].actions.push(action);
    }
    context.actionSets = Object.values(actionsBySet);

    context.availableActions = actions;
    context.filterCategory = this.filterCategory;

    // Categories for filter buttons
    context.categories = Object.entries(CATEGORIES).map(([key, value]) => ({
      id: value,
      name: value.charAt(0).toUpperCase() + value.slice(1),
      active: this.filterCategory === value
    }));

    // History for selected character
    if (context.selectedCharacter) {
      context.characterHistory = context.selectedCharacter.downtimeData?.history || [];
    } else {
      context.characterHistory = [];
    }

    context.isGM = game.user.isGM;

    // Markers
    context.markers = getMarkers();
    context.activeMarker = getActiveMarker();

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Character selection
    html.find(".character-item").click(this._onSelectCharacter.bind(this));

    // Category filter
    html.find(".filter-btn").click(this._onFilterCategory.bind(this));

    // Execute action
    html.find(".execute-action").click(this._onExecuteAction.bind(this));

    // Marker controls (GM only)
    html.find(".create-marker").click(this._onCreateMarker.bind(this));
  }

  _onSelectCharacter(event) {
    event.preventDefault();
    const actorId = event.currentTarget.dataset.actorId;
    this.selectedCharacterId = actorId;
    this.render(false);
  }

  _onFilterCategory(event) {
    event.preventDefault();
    const category = event.currentTarget.dataset.category;
    this.filterCategory = category === "all" ? null : category;
    this.render(false);
  }

  async _onCreateMarker(event) {
    event.preventDefault();

    const content = `
      <form class="create-marker-form">
        <div class="form-group">
          <label>Title:</label>
          <input type="text" name="title" placeholder="e.g., After Mission 3"/>
        </div>
        <div class="form-group">
          <label>Description:</label>
          <textarea name="description" rows="2" placeholder="Optional notes about this period"></textarea>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="downtimeAllowed" checked/>
            Downtime actions allowed
          </label>
        </div>
        <div class="form-group">
          <label>Restrictions:</label>
          <textarea name="restrictions" rows="2" placeholder="Any limitations on actions"></textarea>
        </div>
      </form>
    `;

    new Dialog({
      title: "Create Marker",
      content,
      buttons: {
        create: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Create",
          callback: async (html) => {
            const title = html.find('[name="title"]').val() || "Unnamed Period";
            const description = html.find('[name="description"]').val() || "";
            const downtimeAllowed = html.find('[name="downtimeAllowed"]').is(":checked");
            const restrictions = html.find('[name="restrictions"]').val() || "";
            await addMarker(title, description, downtimeAllowed, restrictions);
            ui.notifications.info(`Marker created: ${title}`);
            this.render(false);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "create"
    }).render(true);
  }

  async _onExecuteAction(event) {
    event.preventDefault();
    event.stopPropagation();

    const actionId = event.currentTarget.dataset.actionId;

    if (!this.selectedCharacterId) {
      ui.notifications.warn("Select a character first");
      return;
    }

    // Check if downtime is allowed
    const activeMarker = getActiveMarker();
    if (activeMarker && !activeMarker.downtimeAllowed) {
      ui.notifications.warn("Downtime actions are not currently allowed");
      return;
    }

    const characters = getAvailableCharacters();
    const character = characters.find(c => c.id === this.selectedCharacterId);
    const activeSetIds = game.settings.get(MODULE_ID, SETTINGS.activeActionSets) || ["lancer-core", "far-field"];
    const actions = getActionsFromSets(activeSetIds);
    const action = actions.find(a => a.id === actionId);

    if (!character || !action) return;

    await this._showExecuteDialog(character, action);
  }

  async _showExecuteDialog(character, action) {
    if (action.requiresRoll) {
      // Use the new roll system
      await this._executeWithRoll(character, action);
    } else {
      // No roll needed - just log with optional notes
      await this._executeWithoutRoll(character, action);
    }
  }

  /**
   * Execute an action that requires a roll
   */
  async _executeWithRoll(character, action) {
    const rollType = determineRollType(action, character);
    const isPilotCheck = rollType === ROLL_TYPES.PILOT_CHECK;

    // Get base values based on character type
    const basePool = getBasePoolSize(character.actor, action);
    const baseAccuracy = getBaseAccuracy(character.actor, action);

    // Show the roll dialog
    const rollResult = await showRollDialog({
      actionName: action.name,
      characterName: character.name,
      rollType,
      basePool,
      baseAccuracy,
      description: action.description
    });

    if (!rollResult) {
      // User cancelled
      return;
    }

    // Post roll to chat
    await postRollToChat(rollResult, {
      characterName: character.name,
      actionName: action.name,
      actor: character.actor
    });

    // Prompt for notes after the roll
    const notes = await this._promptForNotes(character, action, rollResult);

    // Record the action
    await this._recordAction(character, action, {
      rollResult: rollResult.resultCategory,
      notes,
      rollData: rollResult
    });
  }

  /**
   * Execute an action that doesn't require a roll
   */
  async _executeWithoutRoll(character, action) {
    const content = `
      <form class="execute-action-form">
        <p><strong>${action.name}</strong></p>
        <p>${action.description}</p>
        <hr/>
        <div class="form-group">
          <label>Notes:</label>
          <textarea name="notes" rows="3" placeholder="What happened during this action?"></textarea>
        </div>
      </form>
    `;

    new Dialog({
      title: `${character.name}: ${action.name}`,
      content,
      buttons: {
        execute: {
          icon: '<i class="fas fa-check"></i>',
          label: "Log Action",
          callback: async (html) => {
            const notes = html.find('[name="notes"]').val() || "";
            await this._recordAction(character, action, { rollResult: null, notes });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "execute"
    }).render(true);
  }

  /**
   * Prompt for notes after a roll is completed
   */
  async _promptForNotes(character, action, rollResult) {
    return new Promise((resolve) => {
      const resultClass = rollResult.resultCategory;
      const content = `
        <form class="post-roll-notes">
          <div class="roll-summary">
            <span class="result-badge ${resultClass}">${rollResult.resultLabel}</span>
            ${rollResult.reason ? `<p class="reason"><em>${rollResult.reason}</em></p>` : ''}
          </div>
          <hr/>
          <div class="form-group">
            <label>What happened? (optional)</label>
            <textarea name="notes" rows="3" placeholder="Describe the outcome..."></textarea>
          </div>
        </form>
        <style>
          .post-roll-notes .roll-summary { text-align: center; margin-bottom: 0.5rem; }
          .post-roll-notes .result-badge {
            display: inline-block; padding: 0.5rem 1rem; border-radius: 4px;
            font-weight: bold; text-transform: uppercase;
          }
          .post-roll-notes .result-badge.triumph { background: #ffd700; color: #000; }
          .post-roll-notes .result-badge.success { background: #1db954; color: #fff; }
          .post-roll-notes .result-badge.conflict { background: #ff9800; color: #000; }
          .post-roll-notes .result-badge.disaster { background: #e94560; color: #fff; }
          .post-roll-notes .reason { font-size: 0.9rem; color: #888; margin: 0.5rem 0 0 0; }
        </style>
      `;

      new Dialog({
        title: `${action.name} - ${rollResult.resultLabel}`,
        content,
        buttons: {
          save: {
            icon: '<i class="fas fa-check"></i>',
            label: "Save",
            callback: (html) => {
              resolve(html.find('[name="notes"]').val() || "");
            }
          },
          skip: {
            icon: '<i class="fas fa-forward"></i>',
            label: "Skip",
            callback: () => resolve("")
          }
        },
        default: "save"
      }).render(true);
    });
  }

  async _recordAction(character, action, result) {
    const activeMarker = getActiveMarker();
    const historyEntry = createHistoryEntry(null, action, {
      success: result.rollResult === "triumph" || result.rollResult === "success",
      rollResult: result.rollResult,
      description: result.notes,
      rollData: result.rollData || null
    }, activeMarker?.id || null);

    const downtimeData = getCharacterDowntimeData(character.actor);
    const history = [...(downtimeData.history || [])];
    history.unshift(historyEntry);

    await updateCharacterDowntimeData(character.actor, {
      history,
      stats: {
        totalActions: (downtimeData.stats?.totalActions || 0) + 1,
        lastDowntime: new Date().toISOString()
      }
    });

    // Show result notification with color coding
    const resultColors = {
      triumph: "#ffd700",
      success: "#1db954",
      conflict: "#ff9800",
      disaster: "#e94560"
    };

    if (result.rollResult) {
      const color = resultColors[result.rollResult] || "#fff";
      ui.notifications.info(
        `${character.name}: ${action.name} - <span style="color: ${color}; font-weight: bold;">${result.rollResult.toUpperCase()}</span>`
      );
    } else {
      ui.notifications.info(`${character.name}: ${action.name}`);
    }

    this.render(false);
  }
}
