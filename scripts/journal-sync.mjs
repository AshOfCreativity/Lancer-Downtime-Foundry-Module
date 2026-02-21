/**
 * Journal Sync Module
 * Handles syncing downtime data to a Foundry JournalEntry
 */

import { MODULE_ID } from "./constants.mjs";
import {
  getMarkers,
  getAvailableCharacters,
  getCharacterDowntimeData,
  getJournalSyncConfig,
  setJournalSyncConfig
} from "./main.mjs";

/**
 * Show the journal sync configuration dialog
 */
export async function showJournalSyncDialog(app) {
  const config = getJournalSyncConfig();
  const markers = getMarkers().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Build journal options from existing journals
  const journals = game.journal.contents.map(j => ({
    id: j.id,
    name: j.name
  }));

  const journalOptions = journals.map(j =>
    `<option value="${j.id}" ${j.id === config.journalId ? "selected" : ""}>${j.name}</option>`
  ).join("");

  const markerCheckboxes = markers.map(m => {
    const checked = config.includedMarkerIds.length === 0 || config.includedMarkerIds.includes(m.id);
    return `
      <label class="journal-sync-marker-option">
        <input type="checkbox" name="includedMarker" value="${m.id}" ${checked ? "checked" : ""}/>
        ${m.title}
      </label>
    `;
  }).join("");

  const content = `
    <form class="journal-sync-form">
      <div class="form-group">
        <label>${game.i18n.localize("DOWNTIME.Journal.SelectJournal")}:</label>
        <div class="journal-select-row" style="display: flex; gap: 0.5rem; align-items: center;">
          <select name="journalId" style="flex: 1;">
            <option value="">${game.i18n.localize("DOWNTIME.Journal.SelectPrompt")}</option>
            ${journalOptions}
          </select>
          <button type="button" class="journal-sync-new-btn" style="white-space: nowrap;">
            <i class="fas fa-plus"></i> ${game.i18n.localize("DOWNTIME.Journal.NewJournal")}
          </button>
        </div>
      </div>
      <hr/>
      <div class="form-group">
        <label><strong>${game.i18n.localize("DOWNTIME.Journal.DataToInclude")}:</strong></label>
        <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem;">
          <label>
            <input type="checkbox" name="includeMarkerSummaries" ${config.includeMarkerSummaries ? "checked" : ""}/>
            ${game.i18n.localize("DOWNTIME.Journal.IncludeMarkerSummaries")}
          </label>
          <label>
            <input type="checkbox" name="includeActionHistory" ${config.includeActionHistory ? "checked" : ""}/>
            ${game.i18n.localize("DOWNTIME.Journal.IncludeActionHistory")}
          </label>
          <label>
            <input type="checkbox" name="includeRollResults" ${config.includeRollResults ? "checked" : ""}/>
            ${game.i18n.localize("DOWNTIME.Journal.IncludeRollResults")}
          </label>
        </div>
      </div>
      ${markers.length > 0 ? `
        <hr/>
        <div class="form-group">
          <label><strong>${game.i18n.localize("DOWNTIME.Journal.FilterByMarker")}:</strong></label>
          <p style="font-size: 0.8rem; color: #888; margin: 0.25rem 0;">${game.i18n.localize("DOWNTIME.Journal.FilterHint")}</p>
          <div style="display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.25rem;">
            ${markerCheckboxes}
          </div>
        </div>
      ` : ""}
    </form>
  `;

  const dialog = new Dialog({
    title: game.i18n.localize("DOWNTIME.Journal.SyncTitle"),
    content,
    buttons: {
      sync: {
        icon: '<i class="fas fa-sync"></i>',
        label: game.i18n.localize("DOWNTIME.Journal.SyncNow"),
        callback: async (html) => {
          const newConfig = _extractConfigFromHtml(html);
          await setJournalSyncConfig(newConfig);
          await executeSyncToJournal(newConfig);
          ui.notifications.info(game.i18n.localize("DOWNTIME.Journal.SyncComplete"));
          if (app) app.render(false);
        }
      },
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: game.i18n.localize("DOWNTIME.Journal.SaveConfig"),
        callback: async (html) => {
          const newConfig = _extractConfigFromHtml(html);
          await setJournalSyncConfig(newConfig);
          ui.notifications.info(game.i18n.localize("DOWNTIME.Journal.ConfigSaved"));
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("DOWNTIME.Journal.Cancel")
      }
    },
    default: "sync",
    render: (html) => {
      // Handle "New" journal button
      html.find(".journal-sync-new-btn").click(async (e) => {
        e.preventDefault();
        const journal = await JournalEntry.create({
          name: game.i18n.localize("DOWNTIME.Journal.DefaultName")
        });
        if (journal) {
          const select = html.find('[name="journalId"]');
          select.append(`<option value="${journal.id}" selected>${journal.name}</option>`);
          ui.notifications.info(`${game.i18n.localize("DOWNTIME.Journal.Created")}: ${journal.name}`);
        }
      });
    }
  });

  dialog.render(true);
}

/**
 * Extract config from the dialog HTML
 */
function _extractConfigFromHtml(html) {
  const journalId = html.find('[name="journalId"]').val() || null;
  const includeMarkerSummaries = html.find('[name="includeMarkerSummaries"]').is(":checked");
  const includeActionHistory = html.find('[name="includeActionHistory"]').is(":checked");
  const includeRollResults = html.find('[name="includeRollResults"]').is(":checked");

  const includedMarkerIds = [];
  html.find('[name="includedMarker"]:checked').each((_, el) => {
    includedMarkerIds.push(el.value);
  });

  return {
    journalId,
    includeMarkerSummaries,
    includeActionHistory,
    includeRollResults,
    includedMarkerIds
  };
}

/**
 * Execute the sync to a journal entry
 */
async function executeSyncToJournal(config) {
  if (!config.journalId) {
    ui.notifications.warn(game.i18n.localize("DOWNTIME.Journal.NoJournalSelected"));
    return;
  }

  const journal = game.journal.get(config.journalId);
  if (!journal) {
    ui.notifications.error(game.i18n.localize("DOWNTIME.Journal.JournalNotFound"));
    return;
  }

  const content = buildJournalContent(config);

  // Find or create the "Downtime Log" page
  const pageName = game.i18n.localize("DOWNTIME.Journal.PageName");
  let page = journal.pages.find(p => p.name === pageName);

  if (page) {
    await page.update({ "text.content": content });
  } else {
    await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: pageName,
      type: "text",
      text: { content }
    }]);
  }
}

/**
 * Build the HTML content for the journal page
 */
function buildJournalContent(config) {
  const markers = getMarkers().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const characters = getAvailableCharacters();
  const timestamp = new Date().toLocaleString();

  // Filter markers if specific ones are selected
  const filteredMarkers = config.includedMarkerIds.length > 0
    ? markers.filter(m => config.includedMarkerIds.includes(m.id))
    : markers;

  const filteredMarkerIds = new Set(filteredMarkers.map(m => m.id));

  let html = `<h1>Downtime Log</h1>`;
  html += `<p><em>Last synced: ${timestamp}</em></p>`;

  // Marker Summaries
  if (config.includeMarkerSummaries && filteredMarkers.length > 0) {
    html += `<h2>Downtime Periods</h2>`;
    html += `<table><thead><tr>`;
    html += `<th>Title</th><th>Status</th><th>Description</th><th>Restrictions</th>`;
    html += `</tr></thead><tbody>`;

    for (const marker of filteredMarkers) {
      const status = marker.downtimeAllowed ? "Active" : "Inactive";
      html += `<tr>`;
      html += `<td>${marker.title}</td>`;
      html += `<td>${status}</td>`;
      html += `<td>${marker.description || "-"}</td>`;
      html += `<td>${marker.restrictions || "-"}</td>`;
      html += `</tr>`;
    }

    html += `</tbody></table>`;
  }

  // Action History per character
  if (config.includeActionHistory && characters.length > 0) {
    html += `<h2>Action History</h2>`;

    for (const character of characters) {
      const downtimeData = getCharacterDowntimeData(character.actor);
      let history = downtimeData.history || [];

      // Filter history by marker if needed
      if (config.includedMarkerIds.length > 0) {
        history = history.filter(h => !h.markerId || filteredMarkerIds.has(h.markerId));
      }

      if (history.length === 0) continue;

      html += `<h3>${character.name}</h3>`;
      html += `<table><thead><tr>`;
      html += `<th>Action</th><th>Result</th>`;
      if (config.includeRollResults) {
        html += `<th>Roll</th>`;
      }
      html += `<th>Notes</th><th>Date</th>`;
      html += `</tr></thead><tbody>`;

      for (const entry of history) {
        html += `<tr>`;
        html += `<td>${entry.actionName}</td>`;
        html += `<td>${entry.result?.rollResult ? entry.result.rollResult.charAt(0).toUpperCase() + entry.result.rollResult.slice(1) : "-"}</td>`;
        if (config.includeRollResults) {
          let rollDetail = "-";
          if (entry.result?.rollData) {
            const rd = entry.result.rollData;
            if (rd.formula) {
              rollDetail = `${rd.formula} = ${rd.total ?? ""}`;
            } else if (rd.successes !== undefined) {
              rollDetail = `${rd.successes} success${rd.successes !== 1 ? "es" : ""}`;
            }
          }
          html += `<td>${rollDetail}</td>`;
        }
        html += `<td>${entry.result?.description || "-"}</td>`;
        html += `<td>${entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : "-"}</td>`;
        html += `</tr>`;
      }

      html += `</tbody></table>`;
    }
  }

  return html;
}
