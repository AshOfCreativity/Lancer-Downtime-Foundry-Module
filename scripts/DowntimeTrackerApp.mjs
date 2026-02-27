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
  addMarker,
  setActiveMarker,
  updateMarker,
  deleteMarker,
  reorderMarkers
} from "./main.mjs";
import { showJournalSyncDialog } from "./journal-sync.mjs";
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
    this.pinnedMarkerId = null;
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

    // Timeline markers sorted by order, with isActive flag
    const activeId = context.activeMarker?.id || null;
    context.timelineMarkers = [...context.markers]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(m => ({
        ...m,
        isActive: m.id === activeId
      }));

    // Assigned characters for active marker
    if (context.activeMarker) {
      const markerCharIds = context.activeMarker.characterIds || [];
      if (markerCharIds.length === 0) {
        // Empty = all characters
        context.assignedCharacters = context.characters;
      } else {
        context.assignedCharacters = context.characters.filter(c => markerCharIds.includes(c.id));
      }

      // Roll history for active marker
      context.markerHistory = this._getMarkerHistory(context.activeMarker.id, context.characters);
    } else {
      context.assignedCharacters = [];
      context.markerHistory = [];
    }

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

    // Timeline node selection
    html.find(".timeline-node").click(this._onSelectMarker.bind(this));

    // Right-click to pin node actions visible
    html.find(".timeline-node").on("contextmenu", this._onNodeContextMenu.bind(this));

    // Click outside timeline nodes to dismiss pinned actions
    html.on("click", (event) => {
      if (!$(event.target).closest(".timeline-node").length) {
        this.pinnedMarkerId = null;
        html.find(".timeline-node.actions-visible").removeClass("actions-visible");
      }
    });

    // Restore pinned state after re-render
    this._applyPinnedActions(html);

    // Timeline marker edit/delete (GM only)
    html.find(".edit-marker").click(this._onEditMarker.bind(this));
    html.find(".delete-marker").click(this._onDeleteMarker.bind(this));

    // Journal sync (GM only)
    html.find(".journal-sync-btn").click(this._onJournalSync.bind(this));

    // Timeline drag-drop (GM only)
    if (game.user.isGM) {
      this._initTimelineDragDrop(html);
    }
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

    const characters = getAvailableCharacters();
    const characterCheckboxes = characters.map(c =>
      `<label class="marker-char-checkbox">
        <input type="checkbox" name="characterId" value="${c.id}" checked/>
        <img src="${c.img}" alt="${c.name}" class="marker-char-img"/>
        ${c.name}
      </label>`
    ).join("");

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
        <div class="form-group">
          <label>${game.i18n.localize("DOWNTIME.Markers.AssignedCharacters")}:</label>
          <p class="hint">${game.i18n.localize("DOWNTIME.Markers.AssignedCharactersHint")}</p>
          <div class="marker-char-list">${characterCheckboxes || '<em>No characters available</em>'}</div>
        </div>
      </form>
      <style>
        .marker-char-list { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem; }
        .marker-char-checkbox { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
        .marker-char-img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
        .hint { font-size: 0.8rem; color: #888; margin: 0.25rem 0; }
      </style>
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
            const checkedIds = html.find('[name="characterId"]:checked').map((_, el) => el.value).get();
            // If all characters are checked, store empty array (= all)
            const characterIds = checkedIds.length === characters.length ? [] : checkedIds;
            await addMarker(title, description, downtimeAllowed, restrictions, characterIds);
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

  async _onSelectMarker(event) {
    event.preventDefault();
    event.stopPropagation();
    const node = event.currentTarget;
    const markerId = node.dataset.markerId;
    if (!markerId) return;

    this.pinnedMarkerId = markerId;
    await setActiveMarker(markerId);
    this.render(false);
  }

  _onNodeContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const markerId = event.currentTarget.dataset.markerId;

    // Toggle: right-click again to dismiss
    this.pinnedMarkerId = (this.pinnedMarkerId === markerId) ? null : markerId;
    this._applyPinnedActions($(this.element));
  }

  async _onEditMarker(event) {
    event.preventDefault();
    event.stopPropagation();
    const markerId = event.currentTarget.dataset.markerId;
    const markers = getMarkers();
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    const characters = getAvailableCharacters();
    const markerCharIds = marker.characterIds || [];
    // Empty array = all characters assigned
    const allAssigned = markerCharIds.length === 0;

    const characterCheckboxes = characters.map(c => {
      const checked = allAssigned || markerCharIds.includes(c.id) ? "checked" : "";
      return `<label class="marker-char-checkbox">
        <input type="checkbox" name="characterId" value="${c.id}" ${checked}/>
        <img src="${c.img}" alt="${c.name}" class="marker-char-img"/>
        ${c.name}
      </label>`;
    }).join("");

    const content = `
      <form class="edit-marker-form">
        <div class="form-group">
          <label>${game.i18n.localize("DOWNTIME.Markers.TitleLabel")}:</label>
          <input type="text" name="title" value="${marker.title}"/>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("DOWNTIME.Markers.DescriptionLabel")}:</label>
          <textarea name="description" rows="2">${marker.description || ""}</textarea>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="downtimeAllowed" ${marker.downtimeAllowed ? "checked" : ""}/>
            ${game.i18n.localize("DOWNTIME.Markers.DowntimeAllowed")}
          </label>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("DOWNTIME.Markers.RestrictionsLabel")}:</label>
          <textarea name="restrictions" rows="2">${marker.restrictions || ""}</textarea>
        </div>
        <div class="form-group">
          <label>${game.i18n.localize("DOWNTIME.Markers.AssignedCharacters")}:</label>
          <p class="hint">${game.i18n.localize("DOWNTIME.Markers.AssignedCharactersHint")}</p>
          <div class="marker-char-list">${characterCheckboxes || '<em>No characters available</em>'}</div>
        </div>
      </form>
      <style>
        .marker-char-list { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem; }
        .marker-char-checkbox { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; }
        .marker-char-img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
        .hint { font-size: 0.8rem; color: #888; margin: 0.25rem 0; }
      </style>
    `;

    new Dialog({
      title: game.i18n.localize("DOWNTIME.Markers.EditTitle"),
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: game.i18n.localize("DOWNTIME.Markers.Save"),
          callback: async (html) => {
            const checkedIds = html.find('[name="characterId"]:checked').map((_, el) => el.value).get();
            const characterIds = checkedIds.length === characters.length ? [] : checkedIds;
            const updates = {
              title: html.find('[name="title"]').val() || marker.title,
              description: html.find('[name="description"]').val() || "",
              downtimeAllowed: html.find('[name="downtimeAllowed"]').is(":checked"),
              restrictions: html.find('[name="restrictions"]').val() || "",
              characterIds
            };
            await updateMarker(markerId, updates);
            ui.notifications.info(`${game.i18n.localize("DOWNTIME.Markers.Updated")}: ${updates.title}`);
            this.render(false);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("DOWNTIME.Markers.Cancel")
        }
      },
      default: "save"
    }).render(true);
  }

  async _onDeleteMarker(event) {
    event.preventDefault();
    event.stopPropagation();
    const markerId = event.currentTarget.dataset.markerId;
    const markers = getMarkers();
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    const confirmed = await Dialog.confirm({
      title: game.i18n.localize("DOWNTIME.Markers.DeleteTitle"),
      content: `<p>${game.i18n.localize("DOWNTIME.Markers.DeleteConfirm")} <strong>${marker.title}</strong>?</p>`
    });

    if (confirmed) {
      await deleteMarker(markerId);
      ui.notifications.info(`${game.i18n.localize("DOWNTIME.Markers.Deleted")}: ${marker.title}`);
      this.render(false);
    }
  }

  _applyPinnedActions(html) {
    html.find(".timeline-node.actions-visible").removeClass("actions-visible");
    if (this.pinnedMarkerId) {
      html.find(`.timeline-node[data-marker-id="${this.pinnedMarkerId}"]`).addClass("actions-visible");
    }
  }

  _initTimelineDragDrop(html) {
    const nodes = html.find(".timeline-node");
    let draggedId = null;

    nodes.each((_, node) => {
      node.addEventListener("dragstart", (e) => {
        draggedId = node.dataset.markerId;
        node.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggedId);
      });

      node.addEventListener("dragend", () => {
        draggedId = null;
        node.classList.remove("dragging");
        nodes.each((_, n) => {
          n.classList.remove("drag-over-left", "drag-over-right");
        });
      });

      node.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (node.dataset.markerId === draggedId) return;
        // Determine left or right side
        const rect = node.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        node.classList.remove("drag-over-left", "drag-over-right");
        if (e.clientX < midX) {
          node.classList.add("drag-over-left");
        } else {
          node.classList.add("drag-over-right");
        }
      });

      node.addEventListener("dragleave", () => {
        node.classList.remove("drag-over-left", "drag-over-right");
      });

      node.addEventListener("drop", async (e) => {
        e.preventDefault();
        const droppedId = e.dataTransfer.getData("text/plain");
        const targetId = node.dataset.markerId;
        if (!droppedId || droppedId === targetId) return;

        // Get current sorted markers
        const markers = getMarkers().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const orderedIds = markers.map(m => m.id);

        // Remove dragged from current position
        const fromIndex = orderedIds.indexOf(droppedId);
        if (fromIndex === -1) return;
        orderedIds.splice(fromIndex, 1);

        // Determine drop position
        const toIndex = orderedIds.indexOf(targetId);
        const rect = node.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertIndex = e.clientX < midX ? toIndex : toIndex + 1;
        orderedIds.splice(insertIndex, 0, droppedId);

        // Build order updates
        const orderUpdates = orderedIds.map((id, i) => ({ id, order: i }));
        await reorderMarkers(orderUpdates);

        nodes.each((_, n) => {
          n.classList.remove("dragging", "drag-over-left", "drag-over-right");
        });

        this.render(false);
      });
    });
  }

  async _onJournalSync(event) {
    event.preventDefault();
    await showJournalSyncDialog(this);
  }

  /**
   * Get roll history entries for a specific marker, aggregated across all characters
   */
  _getMarkerHistory(markerId, characters) {
    const entries = [];
    for (const char of characters) {
      const history = char.downtimeData?.history || [];
      for (const entry of history) {
        if (entry.markerId === markerId) {
          entries.push({
            ...entry,
            characterName: char.name,
            characterImg: char.img
          });
        }
      }
    }
    // Sort by timestamp descending (most recent first)
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return entries;
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
