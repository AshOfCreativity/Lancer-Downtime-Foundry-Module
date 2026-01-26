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
  updateCharacterDowntimeData
} from "./main.mjs";

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

  async _onExecuteAction(event) {
    event.preventDefault();
    event.stopPropagation();

    const actionId = event.currentTarget.dataset.actionId;

    if (!this.selectedCharacterId) {
      ui.notifications.warn("Select a character first");
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
    const content = `
      <form class="execute-action-form">
        <p><strong>${action.name}</strong></p>
        <p>${action.description}</p>
        <hr/>
        ${action.requiresRoll ? `
        <div class="form-group">
          <label>Roll Result:</label>
          <select name="rollResult">
            <option value="">No roll</option>
            <option value="triumph">Triumph</option>
            <option value="success">Success</option>
            <option value="conflict">Conflict</option>
            <option value="disaster">Disaster</option>
          </select>
        </div>
        ` : ''}
        <div class="form-group">
          <label>Notes:</label>
          <textarea name="notes" rows="2"></textarea>
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
            const rollResult = html.find('[name="rollResult"]').val() || null;
            const notes = html.find('[name="notes"]').val() || "";

            await this._recordAction(character, action, { rollResult, notes });
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

  async _recordAction(character, action, result) {
    const historyEntry = createHistoryEntry(null, action, {
      success: result.rollResult === "triumph" || result.rollResult === "success",
      rollResult: result.rollResult,
      description: result.notes
    });

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

    ui.notifications.info(`${character.name}: ${action.name}`);
    this.render(false);
  }
}
