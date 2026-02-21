/**
 * Roll Handler for Downtime Actions
 *
 * Supports two roll types:
 * 1. LANCER Pilot Checks: 1d20 with accuracy/difficulty (d6 modifiers)
 * 2. Far Field Dice Pools: Xd6, counting successes (5-6)
 *
 * Also supports "conditional modifiers" - bonuses that players propose
 * but need GM approval before being applied.
 */

import { MODULE_ID } from "./constants.mjs";

/**
 * Roll type constants
 */
export const ROLL_TYPES = {
  PILOT_CHECK: "pilot-check",    // LANCER Core: 1d20 + accuracy
  DICE_POOL: "dice-pool"         // Far Field: Xd6 counting successes
};

/**
 * Conditional modifier status
 */
export const CONDITIONAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected"
};

/**
 * Far Field result thresholds
 */
export const POOL_RESULTS = {
  TRIUMPH: { min: 3, label: "Triumph", class: "triumph" },
  SUCCESS: { min: 2, label: "Success", class: "success" },
  CONFLICT: { min: 1, label: "Conflict", class: "conflict" },
  DISASTER: { min: 0, label: "Disaster", class: "disaster" }
};

/**
 * LANCER pilot check thresholds
 */
export const PILOT_RESULTS = {
  TRIUMPH: { min: 20, label: "Triumph", class: "triumph" },
  SUCCESS: { min: 10, label: "Success", class: "success" },
  CONFLICT: { min: 1, label: "Conflict", class: "conflict" },
  DISASTER: { min: -Infinity, label: "Disaster", class: "disaster" }
};

/**
 * Show the roll configuration dialog
 * @param {Object} options - Roll options
 * @param {string} options.actionName - Name of the action being rolled
 * @param {string} options.characterName - Name of the character rolling
 * @param {string} options.rollType - ROLL_TYPES.PILOT_CHECK or ROLL_TYPES.DICE_POOL
 * @param {number} options.basePool - Base dice pool size (for dice pools)
 * @param {number} options.baseAccuracy - Starting accuracy (for pilot checks)
 * @param {string} options.description - Action description
 * @returns {Promise<Object|null>} Roll result or null if cancelled
 */
export async function showRollDialog(options) {
  const {
    actionName,
    characterName,
    rollType = ROLL_TYPES.PILOT_CHECK,
    basePool = 2,
    baseAccuracy = 0,
    description = ""
  } = options;

  const isPilotCheck = rollType === ROLL_TYPES.PILOT_CHECK;
  const title = `${characterName}: ${actionName}`;

  const content = await renderRollDialogContent({
    actionName,
    characterName,
    description,
    isPilotCheck,
    basePool,
    baseAccuracy
  });

  return new Promise((resolve) => {
    new Dialog({
      title,
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice"></i>',
          label: "Roll",
          callback: async (html) => {
            const result = await executeRollFromDialog(html, rollType, isPilotCheck);
            resolve(result);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "roll",
      render: (html) => {
        // Update preview when modifiers change
        html.find('input[type="number"]').on('change input', () => {
          updateRollPreview(html, isPilotCheck);
        });

        // Add conditional modifier button
        html.find('.add-conditional-btn').on('click', (e) => {
          e.preventDefault();
          addConditionalModifier(html, isPilotCheck);
        });

        // Initialize preview
        updateRollPreview(html, isPilotCheck);
      }
    }).render(true);
  });
}

/**
 * Add a new conditional modifier input row
 */
function addConditionalModifier(html, isPilotCheck) {
  const list = html.find('.conditional-list');
  const index = list.find('.conditional-item').length;

  const modifierType = isPilotCheck ? 'accuracy' : 'dice';
  const placeholder = isPilotCheck
    ? 'e.g., "My contact might help" or "If the weather clears"'
    : 'e.g., "If I can use my Insight resource" or "Crew might assist"';

  const itemHtml = `
    <div class="conditional-item" data-index="${index}">
      <input type="number" name="conditional-value-${index}" value="1" min="1" max="4"
             title="${isPilotCheck ? 'Accuracy' : 'Extra dice'}"/>
      <input type="text" name="conditional-reason-${index}"
             placeholder="${placeholder}" required/>
      <button type="button" class="remove-conditional" title="Remove">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  list.append(itemHtml);

  // Wire up remove button
  list.find(`.conditional-item[data-index="${index}"] .remove-conditional`).on('click', (e) => {
    e.preventDefault();
    $(e.currentTarget).closest('.conditional-item').remove();
    updateRollPreview(html, isPilotCheck);
  });

  // Wire up change handler for preview
  list.find(`.conditional-item[data-index="${index}"] input`).on('change input', () => {
    updateRollPreview(html, isPilotCheck);
  });

  updateRollPreview(html, isPilotCheck);
}

/**
 * Render the roll dialog content
 */
async function renderRollDialogContent(options) {
  const { actionName, characterName, description, isPilotCheck, basePool, baseAccuracy } = options;

  // Common conditional modifiers section
  const conditionalSection = `
    <div class="conditional-section">
      <div class="conditional-header">
        <label>
          <i class="fas fa-question-circle" style="color: #ff9800;"></i>
          Conditional Modifiers
          <span class="hint">(need GM approval)</span>
        </label>
        <button type="button" class="add-conditional-btn" title="Add conditional modifier">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <div class="conditional-list"></div>
      <p class="conditional-hint">
        Add bonuses you <em>might</em> get - GM will decide if they apply after seeing the roll.
      </p>
    </div>
  `;

  // Common styles
  const commonStyles = `
    .downtime-roll-dialog { padding: 0.5rem; }
    .downtime-roll-dialog .action-info h3 { margin: 0 0 0.5rem 0; color: #e94560; }
    .downtime-roll-dialog .description { font-size: 0.9rem; color: #aaa; margin: 0; }
    .downtime-roll-dialog .form-group { margin-bottom: 0.75rem; }
    .downtime-roll-dialog .form-group label { display: block; font-weight: bold; margin-bottom: 0.25rem; }
    .downtime-roll-dialog .hint { font-size: 0.75rem; color: #888; margin: 0.25rem 0 0 0; }
    .downtime-roll-dialog .roll-preview {
      background: #1a1a2e;
      padding: 0.75rem;
      border-radius: 4px;
      text-align: center;
      margin-top: 1rem;
    }
    .downtime-roll-dialog .preview-formula {
      font-family: monospace;
      font-size: 1.1rem;
      color: #fff;
      margin-left: 0.5rem;
    }
    .downtime-roll-dialog .preview-conditional {
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px dashed #444;
      color: #ff9800;
      font-size: 0.9rem;
    }
    .downtime-roll-dialog .preview-conditional .preview-formula {
      color: #ff9800;
    }

    /* Conditional modifiers */
    .downtime-roll-dialog .conditional-section {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #333;
    }
    .downtime-roll-dialog .conditional-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .downtime-roll-dialog .conditional-header label {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .downtime-roll-dialog .conditional-header .hint {
      font-weight: normal;
      font-size: 0.8rem;
    }
    .downtime-roll-dialog .add-conditional-btn {
      background: #533483;
      border: none;
      color: #fff;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
    }
    .downtime-roll-dialog .add-conditional-btn:hover { background: #7b4db5; }
    .downtime-roll-dialog .conditional-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .downtime-roll-dialog .conditional-item {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      background: rgba(255, 152, 0, 0.1);
      padding: 0.5rem;
      border-radius: 4px;
      border: 1px dashed #ff9800;
    }
    .downtime-roll-dialog .conditional-item input[type="number"] {
      width: 50px;
      text-align: center;
    }
    .downtime-roll-dialog .conditional-item input[type="text"] {
      flex: 1;
      min-width: 0;
    }
    .downtime-roll-dialog .conditional-item .remove-conditional {
      background: transparent;
      border: none;
      color: #e94560;
      cursor: pointer;
      padding: 0.25rem;
    }
    .downtime-roll-dialog .conditional-hint {
      font-size: 0.75rem;
      color: #888;
      margin: 0.5rem 0 0 0;
      font-style: italic;
    }
  `;

  if (isPilotCheck) {
    return `
      <form class="downtime-roll-dialog">
        <div class="action-info">
          <h3>${actionName}</h3>
          ${description ? `<p class="description">${description}</p>` : ''}
        </div>
        <hr/>

        <div class="roll-config pilot-check">
          <p class="roll-formula">Base: <strong>1d20</strong></p>

          <div class="form-group">
            <label>
              <i class="fas fa-plus-circle" style="color: #1db954;"></i>
              Accuracy
            </label>
            <input type="number" name="accuracy" value="${baseAccuracy}" min="0" max="6"
                   placeholder="Bonus d6s (take highest)"/>
            <p class="hint">Each accuracy adds a d6; highest is added to roll</p>
          </div>

          <div class="form-group">
            <label>
              <i class="fas fa-minus-circle" style="color: #e94560;"></i>
              Difficulty
            </label>
            <input type="number" name="difficulty" value="0" min="0" max="6"
                   placeholder="Penalty d6s (take lowest)"/>
            <p class="hint">Each difficulty adds a d6; lowest is subtracted from roll</p>
          </div>

          <div class="form-group">
            <label>Reason for modifiers (optional)</label>
            <input type="text" name="reason" placeholder="e.g., Helped by contact, harsh conditions..."/>
          </div>

          ${conditionalSection}

          <div class="roll-preview">
            <div class="preview-confirmed">
              <span class="preview-label">Confirmed:</span>
              <span class="preview-formula">1d20</span>
            </div>
            <div class="preview-conditional" style="display: none;">
              <span class="preview-label">If approved:</span>
              <span class="preview-formula">1d20</span>
            </div>
          </div>
        </div>
      </form>
      <style>
        ${commonStyles}
        .downtime-roll-dialog .form-group input[type="number"] { width: 80px; }
        .downtime-roll-dialog .form-group input[type="text"] { width: 100%; }
      </style>
    `;
  } else {
    // Dice pool dialog
    return `
      <form class="downtime-roll-dialog">
        <div class="action-info">
          <h3>${actionName}</h3>
          ${description ? `<p class="description">${description}</p>` : ''}
        </div>
        <hr/>

        <div class="roll-config dice-pool">
          <div class="form-group">
            <label>
              <i class="fas fa-dice-d6" style="color: #ff9800;"></i>
              Dice Pool
            </label>
            <input type="number" name="poolSize" value="${basePool}" min="1" max="10"/>
            <p class="hint">Base pool from relevant skill/aspect</p>
          </div>

          <div class="form-group">
            <label>
              <i class="fas fa-plus" style="color: #1db954;"></i>
              Additional Dice
            </label>
            <input type="number" name="bonusDice" value="0" min="0" max="6"/>
            <p class="hint">From resources, help, circumstances, etc.</p>
          </div>

          <div class="form-group">
            <label>Reason for extra dice (optional)</label>
            <input type="text" name="reason" placeholder="e.g., Using a resource, crew assistance..."/>
          </div>

          ${conditionalSection}

          <div class="roll-preview">
            <div class="preview-confirmed">
              <span class="preview-label">Confirmed:</span>
              <span class="preview-formula">${basePool}d6</span>
            </div>
            <div class="preview-conditional" style="display: none;">
              <span class="preview-label">If approved:</span>
              <span class="preview-formula">${basePool}d6</span>
            </div>
            <p class="hint" style="margin-top: 0.5rem;">5-6 = Success</p>
          </div>

          <div class="result-thresholds">
            <span class="threshold triumph">3+ = Triumph</span>
            <span class="threshold success">2 = Success</span>
            <span class="threshold conflict">1 = Conflict</span>
            <span class="threshold disaster">0 = Disaster</span>
          </div>
        </div>
      </form>
      <style>
        ${commonStyles}
        .downtime-roll-dialog .form-group input[type="number"] { width: 80px; }
        .downtime-roll-dialog .form-group input[type="text"] { width: 100%; }
        .downtime-roll-dialog .result-thresholds {
          display: flex;
          justify-content: space-around;
          margin-top: 0.75rem;
          font-size: 0.75rem;
        }
        .downtime-roll-dialog .threshold {
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
        }
        .downtime-roll-dialog .threshold.triumph { background: #ffd700; color: #000; }
        .downtime-roll-dialog .threshold.success { background: #1db954; color: #fff; }
        .downtime-roll-dialog .threshold.conflict { background: #ff9800; color: #000; }
        .downtime-roll-dialog .threshold.disaster { background: #e94560; color: #fff; }
      </style>
    `;
  }
}

/**
 * Update the roll preview when modifiers change
 */
function updateRollPreview(html, isPilotCheck) {
  const confirmedEl = html.find('.preview-confirmed .preview-formula');
  const conditionalEl = html.find('.preview-conditional');
  const conditionalFormulaEl = conditionalEl.find('.preview-formula');

  // Calculate total conditional bonus
  let conditionalBonus = 0;
  html.find('.conditional-item').each((i, item) => {
    const value = parseInt($(item).find('input[type="number"]').val()) || 0;
    conditionalBonus += value;
  });

  if (isPilotCheck) {
    const accuracy = parseInt(html.find('[name="accuracy"]').val()) || 0;
    const difficulty = parseInt(html.find('[name="difficulty"]').val()) || 0;
    const net = accuracy - difficulty;

    // Confirmed formula
    let confirmedFormula = "1d20";
    if (net > 0) {
      confirmedFormula += ` + ${net}d6kh1`;
    } else if (net < 0) {
      confirmedFormula += ` - ${Math.abs(net)}d6kh1`;
    }
    confirmedEl.text(confirmedFormula);

    // Conditional formula (with bonus accuracy)
    if (conditionalBonus > 0) {
      const netWithConditional = net + conditionalBonus;
      let conditionalFormula = "1d20";
      if (netWithConditional > 0) {
        conditionalFormula += ` + ${netWithConditional}d6kh1`;
      } else if (netWithConditional < 0) {
        conditionalFormula += ` - ${Math.abs(netWithConditional)}d6kh1`;
      }
      conditionalFormulaEl.text(conditionalFormula);
      conditionalEl.show();
    } else {
      conditionalEl.hide();
    }
  } else {
    const poolSize = parseInt(html.find('[name="poolSize"]').val()) || 2;
    const bonusDice = parseInt(html.find('[name="bonusDice"]').val()) || 0;
    const confirmedTotal = poolSize + bonusDice;

    confirmedEl.text(`${confirmedTotal}d6`);

    // Conditional formula (with bonus dice)
    if (conditionalBonus > 0) {
      const conditionalTotal = confirmedTotal + conditionalBonus;
      conditionalFormulaEl.text(`${conditionalTotal}d6`);
      conditionalEl.show();
    } else {
      conditionalEl.hide();
    }
  }
}

/**
 * Gather conditional modifiers from the dialog
 */
function gatherConditionalModifiers(html) {
  const conditionals = [];
  html.find('.conditional-item').each((i, item) => {
    const $item = $(item);
    const value = parseInt($item.find('input[type="number"]').val()) || 0;
    const reason = $item.find('input[type="text"]').val() || "";

    if (value > 0 && reason.trim()) {
      conditionals.push({
        id: foundry.utils.randomID(),
        value,
        reason: reason.trim(),
        status: CONDITIONAL_STATUS.PENDING
      });
    }
  });
  return conditionals;
}

/**
 * Execute the roll from dialog inputs
 */
async function executeRollFromDialog(html, rollType, isPilotCheck) {
  const reason = html.find('[name="reason"]').val() || "";
  const conditionals = gatherConditionalModifiers(html);

  if (isPilotCheck) {
    const accuracy = parseInt(html.find('[name="accuracy"]').val()) || 0;
    const difficulty = parseInt(html.find('[name="difficulty"]').val()) || 0;
    return executePilotCheck({ accuracy, difficulty, reason, conditionals });
  } else {
    const poolSize = parseInt(html.find('[name="poolSize"]').val()) || 2;
    const bonusDice = parseInt(html.find('[name="bonusDice"]').val()) || 0;
    return executeDicePool({ poolSize: poolSize + bonusDice, reason, conditionals });
  }
}

/**
 * Execute a LANCER-style pilot check
 * @param {Object} options
 * @param {number} options.accuracy - Number of accuracy dice
 * @param {number} options.difficulty - Number of difficulty dice
 * @param {string} options.reason - Reason for modifiers
 * @param {Array} options.conditionals - Conditional modifiers awaiting approval
 * @returns {Promise<Object>} Roll result
 */
export async function executePilotCheck({ accuracy = 0, difficulty = 0, reason = "", conditionals = [] }) {
  const netAccuracy = accuracy - difficulty;
  const conditionalAccuracy = conditionals.reduce((sum, c) => sum + c.value, 0);
  const netWithConditional = netAccuracy + conditionalAccuracy;

  // Roll the d20
  const baseRoll = new Roll("1d20");
  await baseRoll.evaluate();
  const d20Result = baseRoll.total;

  // Roll ALL modifier dice at once (confirmed + conditional) so we can show what would have happened
  const maxModCount = Math.max(Math.abs(netAccuracy), Math.abs(netWithConditional));
  let allModifierDice = [];

  if (maxModCount > 0) {
    const modifierRoll = new Roll(`${maxModCount}d6`);
    await modifierRoll.evaluate();
    allModifierDice = modifierRoll.dice[0].results.map(r => r.result);
  }

  // Calculate CONFIRMED result (using only confirmed modifiers)
  let confirmedModifierValue = 0;
  let confirmedModifierDice = [];
  if (netAccuracy !== 0) {
    confirmedModifierDice = allModifierDice.slice(0, Math.abs(netAccuracy));
    const highestDie = confirmedModifierDice.length > 0 ? Math.max(...confirmedModifierDice) : 0;
    confirmedModifierValue = netAccuracy > 0 ? highestDie : -highestDie;
  }
  const confirmedTotal = d20Result + confirmedModifierValue;
  const confirmedResult = getPilotResultCategory(confirmedTotal);

  // Calculate POTENTIAL result (if all conditionals approved)
  let potentialModifierValue = 0;
  let potentialModifierDice = allModifierDice;
  if (netWithConditional !== 0) {
    const highestDie = potentialModifierDice.length > 0 ? Math.max(...potentialModifierDice) : 0;
    potentialModifierValue = netWithConditional > 0 ? highestDie : -highestDie;
  }
  const potentialTotal = d20Result + potentialModifierValue;
  const potentialResult = getPilotResultCategory(potentialTotal);

  // Create display formulas
  const confirmedFormula = netAccuracy !== 0
    ? `1d20 ${netAccuracy > 0 ? '+' : '-'} ${Math.abs(netAccuracy)}d6kh1`
    : "1d20";

  const potentialFormula = netWithConditional !== 0
    ? `1d20 ${netWithConditional > 0 ? '+' : '-'} ${Math.abs(netWithConditional)}d6kh1`
    : "1d20";

  const rollResult = {
    type: ROLL_TYPES.PILOT_CHECK,
    d20: d20Result,
    accuracy,
    difficulty,
    reason,

    // Confirmed result
    formula: confirmedFormula,
    netAccuracy,
    modifierDice: confirmedModifierDice,
    modifierValue: confirmedModifierValue,
    total: confirmedTotal,
    resultCategory: confirmedResult,
    resultLabel: PILOT_RESULTS[confirmedResult.toUpperCase()]?.label || confirmedResult,

    // Conditional data
    conditionals: conditionals.map(c => ({ ...c })),
    hasConditionals: conditionals.length > 0,

    // Potential result (if conditionals approved)
    potential: conditionals.length > 0 ? {
      formula: potentialFormula,
      netAccuracy: netWithConditional,
      modifierDice: potentialModifierDice,
      modifierValue: potentialModifierValue,
      total: potentialTotal,
      resultCategory: potentialResult,
      resultLabel: PILOT_RESULTS[potentialResult.toUpperCase()]?.label || potentialResult
    } : null
  };

  return rollResult;
}

/**
 * Helper to determine pilot check result category
 */
function getPilotResultCategory(total) {
  if (total >= 20) return "triumph";
  if (total >= 10) return "success";
  if (total >= 1) return "conflict";
  return "disaster";
}

/**
 * Execute a Far Field dice pool roll
 * @param {Object} options
 * @param {number} options.poolSize - Total number of confirmed dice to roll
 * @param {string} options.reason - Reason for bonus dice
 * @param {Array} options.conditionals - Conditional modifiers awaiting approval
 * @returns {Promise<Object>} Roll result
 */
export async function executeDicePool({ poolSize = 2, reason = "", conditionals = [] }) {
  const conditionalDice = conditionals.reduce((sum, c) => sum + c.value, 0);
  const totalPoolSize = poolSize + conditionalDice;

  // Roll ALL dice at once (confirmed + conditional)
  const roll = new Roll(`${totalPoolSize}d6`);
  await roll.evaluate();

  const allDiceResults = roll.dice[0].results.map(r => r.result);

  // Split results: confirmed dice vs conditional dice
  const confirmedDice = allDiceResults.slice(0, poolSize);
  const conditionalDiceResults = allDiceResults.slice(poolSize);

  // Calculate CONFIRMED result
  const confirmedSuccesses = confirmedDice.filter(r => r >= 5).length;
  const confirmedResult = getPoolResultCategory(confirmedSuccesses);

  // Calculate POTENTIAL result (if all conditionals approved)
  const allSuccesses = allDiceResults.filter(r => r >= 5).length;
  const potentialResult = getPoolResultCategory(allSuccesses);

  const rollResult = {
    type: ROLL_TYPES.DICE_POOL,
    reason,

    // Confirmed result
    formula: `${poolSize}d6`,
    poolSize,
    diceResults: confirmedDice,
    successes: confirmedSuccesses,
    resultCategory: confirmedResult,
    resultLabel: POOL_RESULTS[confirmedResult.toUpperCase()]?.label || confirmedResult,

    // Conditional data
    conditionals: conditionals.map(c => ({ ...c })),
    hasConditionals: conditionals.length > 0,

    // Potential result (if conditionals approved)
    potential: conditionals.length > 0 ? {
      formula: `${totalPoolSize}d6`,
      poolSize: totalPoolSize,
      diceResults: allDiceResults,
      conditionalDice: conditionalDiceResults,
      successes: allSuccesses,
      additionalSuccesses: allSuccesses - confirmedSuccesses,
      resultCategory: potentialResult,
      resultLabel: POOL_RESULTS[potentialResult.toUpperCase()]?.label || potentialResult
    } : null
  };

  return rollResult;
}

/**
 * Helper to determine dice pool result category
 */
function getPoolResultCategory(successes) {
  if (successes >= 3) return "triumph";
  if (successes >= 2) return "success";
  if (successes >= 1) return "conflict";
  return "disaster";
}

/**
 * Post a roll result to chat
 * @param {Object} rollResult - Result from executePilotCheck or executeDicePool
 * @param {Object} context - Additional context
 * @param {string} context.characterName - Name of the character
 * @param {string} context.actionName - Name of the action
 * @param {Actor} context.actor - The actor rolling (for speaker)
 */
export async function postRollToChat(rollResult, context) {
  const { characterName, actionName, actor } = context;

  let content;

  if (rollResult.type === ROLL_TYPES.PILOT_CHECK) {
    content = renderPilotCheckChat(rollResult, actionName);
  } else {
    content = renderDicePoolChat(rollResult, actionName);
  }

  const speaker = actor
    ? ChatMessage.getSpeaker({ actor })
    : { alias: characterName };

  await ChatMessage.create({
    speaker,
    content,
    type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    flavor: `<strong>Downtime:</strong> ${actionName}`
  });
}

/**
 * Render pilot check result for chat
 */
function renderPilotCheckChat(result, actionName) {
  const modifierDiceHtml = result.modifierDice.length > 0
    ? `<div class="modifier-dice">
         ${result.netAccuracy > 0 ? 'Accuracy' : 'Difficulty'} dice:
         ${result.modifierDice.map(d => `<span class="die d6 ${d === Math.max(...result.modifierDice) ? 'highest' : ''}">${d}</span>`).join(' ')}
       </div>`
    : '';

  const reasonHtml = result.reason
    ? `<div class="roll-reason"><em>${result.reason}</em></div>`
    : '';

  // Render conditional modifiers section if any exist
  let conditionalsHtml = '';
  if (result.hasConditionals && result.potential) {
    const conditionalsList = result.conditionals.map(c =>
      `<li><strong>+${c.value}</strong> ${c.reason}</li>`
    ).join('');

    const wouldChange = result.resultCategory !== result.potential.resultCategory;
    const changeIndicator = wouldChange
      ? `<span class="would-change">→ ${result.potential.resultLabel}</span>`
      : `<span class="no-change">(same result)</span>`;

    conditionalsHtml = `
      <div class="conditionals-section">
        <div class="conditionals-header">
          <i class="fas fa-question-circle"></i>
          Pending GM Approval:
        </div>
        <ul class="conditionals-list">${conditionalsList}</ul>
        <div class="potential-result">
          If approved: <strong>${result.potential.total}</strong> ${changeIndicator}
        </div>
        <div class="potential-dice">
          Would use: ${result.potential.modifierDice.map(d =>
            `<span class="die d6 mini ${d === Math.max(...result.potential.modifierDice) ? 'highest' : ''}">${d}</span>`
          ).join(' ')}
        </div>
      </div>
    `;
  }

  return `
    <div class="downtime-roll pilot-check">
      <div class="roll-header">
        <span class="roll-formula">${result.formula}</span>
      </div>
      <div class="roll-result">
        <span class="die d20">${result.d20}</span>
        ${result.modifierValue !== 0
          ? `<span class="modifier">${result.modifierValue > 0 ? '+' : ''}${result.modifierValue}</span>`
          : ''}
        <span class="equals">=</span>
        <span class="total">${result.total}</span>
      </div>
      ${modifierDiceHtml}
      ${reasonHtml}
      <div class="result-category ${result.resultCategory}">
        ${result.resultLabel}
      </div>
      ${conditionalsHtml}
    </div>
    <style>
      .downtime-roll { padding: 0.5rem; background: #1a1a2e; border-radius: 4px; }
      .downtime-roll .roll-header { margin-bottom: 0.5rem; font-family: monospace; color: #aaa; }
      .downtime-roll .roll-result { display: flex; align-items: center; gap: 0.5rem; font-size: 1.25rem; }
      .downtime-roll .die {
        display: inline-flex; align-items: center; justify-content: center;
        width: 2rem; height: 2rem; border-radius: 4px; font-weight: bold;
      }
      .downtime-roll .die.d20 { background: #533483; color: #fff; }
      .downtime-roll .die.d6 { background: #16213e; color: #fff; width: 1.5rem; height: 1.5rem; font-size: 0.9rem; }
      .downtime-roll .die.d6.highest { background: #1db954; }
      .downtime-roll .die.d6.mini { width: 1.25rem; height: 1.25rem; font-size: 0.75rem; }
      .downtime-roll .modifier { color: ${result.modifierValue > 0 ? '#1db954' : '#e94560'}; }
      .downtime-roll .total { font-size: 1.5rem; font-weight: bold; color: #fff; }
      .downtime-roll .modifier-dice { margin-top: 0.5rem; font-size: 0.85rem; color: #aaa; }
      .downtime-roll .roll-reason { margin-top: 0.5rem; font-size: 0.85rem; color: #888; }
      .downtime-roll .result-category {
        margin-top: 0.75rem; padding: 0.5rem; border-radius: 4px;
        text-align: center; font-weight: bold; text-transform: uppercase;
      }
      .downtime-roll .result-category.triumph { background: #ffd700; color: #000; }
      .downtime-roll .result-category.success { background: #1db954; color: #fff; }
      .downtime-roll .result-category.conflict { background: #ff9800; color: #000; }
      .downtime-roll .result-category.disaster { background: #e94560; color: #fff; }

      /* Conditionals section */
      .downtime-roll .conditionals-section {
        margin-top: 0.75rem;
        padding: 0.75rem;
        background: rgba(255, 152, 0, 0.1);
        border: 1px dashed #ff9800;
        border-radius: 4px;
      }
      .downtime-roll .conditionals-header {
        color: #ff9800;
        font-weight: bold;
        margin-bottom: 0.5rem;
      }
      .downtime-roll .conditionals-header i { margin-right: 0.5rem; }
      .downtime-roll .conditionals-list {
        margin: 0 0 0.5rem 1rem;
        padding: 0;
        font-size: 0.85rem;
        color: #ddd;
      }
      .downtime-roll .conditionals-list li { margin-bottom: 0.25rem; }
      .downtime-roll .potential-result {
        font-size: 0.9rem;
        color: #aaa;
      }
      .downtime-roll .potential-result strong { color: #fff; }
      .downtime-roll .would-change { color: #ff9800; font-weight: bold; }
      .downtime-roll .no-change { color: #888; font-style: italic; }
      .downtime-roll .potential-dice {
        margin-top: 0.5rem;
        font-size: 0.8rem;
        color: #888;
      }
    </style>
  `;
}

/**
 * Render dice pool result for chat
 */
function renderDicePoolChat(result, actionName) {
  const diceHtml = result.diceResults
    .map(d => `<span class="die d6 ${d >= 5 ? 'success' : ''}">${d}</span>`)
    .join(' ');

  const reasonHtml = result.reason
    ? `<div class="roll-reason"><em>${result.reason}</em></div>`
    : '';

  // Render conditional modifiers section if any exist
  let conditionalsHtml = '';
  if (result.hasConditionals && result.potential) {
    const conditionalsList = result.conditionals.map(c =>
      `<li><strong>+${c.value}d6</strong> ${c.reason}</li>`
    ).join('');

    // Show the conditional dice separately
    const conditionalDiceHtml = result.potential.conditionalDice
      .map(d => `<span class="die d6 conditional ${d >= 5 ? 'success' : ''}">${d}</span>`)
      .join(' ');

    const wouldChange = result.resultCategory !== result.potential.resultCategory;
    const changeIndicator = wouldChange
      ? `<span class="would-change">→ ${result.potential.resultLabel}</span>`
      : `<span class="no-change">(same result)</span>`;

    const additionalSuccessText = result.potential.additionalSuccesses > 0
      ? `(+${result.potential.additionalSuccesses} success${result.potential.additionalSuccesses !== 1 ? 'es' : ''})`
      : '';

    conditionalsHtml = `
      <div class="conditionals-section">
        <div class="conditionals-header">
          <i class="fas fa-question-circle"></i>
          Pending GM Approval:
        </div>
        <ul class="conditionals-list">${conditionalsList}</ul>
        <div class="conditional-dice-row">
          <span class="label">Conditional dice:</span>
          ${conditionalDiceHtml}
          ${additionalSuccessText ? `<span class="additional-successes">${additionalSuccessText}</span>` : ''}
        </div>
        <div class="potential-result">
          If approved: <strong>${result.potential.successes} successes</strong> ${changeIndicator}
        </div>
      </div>
    `;
  }

  return `
    <div class="downtime-roll dice-pool">
      <div class="roll-header">
        <span class="roll-formula">${result.formula}</span>
      </div>
      <div class="dice-results">
        ${diceHtml}
      </div>
      <div class="success-count">
        <span class="count">${result.successes}</span>
        <span class="label">success${result.successes !== 1 ? 'es' : ''}</span>
      </div>
      ${reasonHtml}
      <div class="result-category ${result.resultCategory}">
        ${result.resultLabel}
      </div>
      ${conditionalsHtml}
    </div>
    <style>
      .downtime-roll { padding: 0.5rem; background: #1a1a2e; border-radius: 4px; }
      .downtime-roll .roll-header { margin-bottom: 0.5rem; font-family: monospace; color: #aaa; }
      .downtime-roll .dice-results { display: flex; flex-wrap: wrap; gap: 0.25rem; }
      .downtime-roll .die {
        display: inline-flex; align-items: center; justify-content: center;
        width: 2rem; height: 2rem; border-radius: 4px; font-weight: bold;
        background: #16213e; color: #888;
      }
      .downtime-roll .die.success { background: #1db954; color: #fff; }
      .downtime-roll .die.conditional {
        border: 2px dashed #ff9800;
        background: #16213e;
      }
      .downtime-roll .die.conditional.success {
        background: rgba(29, 185, 84, 0.5);
        color: #fff;
      }
      .downtime-roll .success-count {
        margin-top: 0.5rem; font-size: 1.1rem;
      }
      .downtime-roll .success-count .count { font-size: 1.5rem; font-weight: bold; color: #fff; }
      .downtime-roll .roll-reason { margin-top: 0.5rem; font-size: 0.85rem; color: #888; }
      .downtime-roll .result-category {
        margin-top: 0.75rem; padding: 0.5rem; border-radius: 4px;
        text-align: center; font-weight: bold; text-transform: uppercase;
      }
      .downtime-roll .result-category.triumph { background: #ffd700; color: #000; }
      .downtime-roll .result-category.success { background: #1db954; color: #fff; }
      .downtime-roll .result-category.conflict { background: #ff9800; color: #000; }
      .downtime-roll .result-category.disaster { background: #e94560; color: #fff; }

      /* Conditionals section */
      .downtime-roll .conditionals-section {
        margin-top: 0.75rem;
        padding: 0.75rem;
        background: rgba(255, 152, 0, 0.1);
        border: 1px dashed #ff9800;
        border-radius: 4px;
      }
      .downtime-roll .conditionals-header {
        color: #ff9800;
        font-weight: bold;
        margin-bottom: 0.5rem;
      }
      .downtime-roll .conditionals-header i { margin-right: 0.5rem; }
      .downtime-roll .conditionals-list {
        margin: 0 0 0.5rem 1rem;
        padding: 0;
        font-size: 0.85rem;
        color: #ddd;
      }
      .downtime-roll .conditionals-list li { margin-bottom: 0.25rem; }
      .downtime-roll .conditional-dice-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        flex-wrap: wrap;
      }
      .downtime-roll .conditional-dice-row .label {
        font-size: 0.85rem;
        color: #888;
      }
      .downtime-roll .additional-successes {
        font-size: 0.85rem;
        color: #1db954;
        font-weight: bold;
      }
      .downtime-roll .potential-result {
        font-size: 0.9rem;
        color: #aaa;
      }
      .downtime-roll .potential-result strong { color: #fff; }
      .downtime-roll .would-change { color: #ff9800; font-weight: bold; }
      .downtime-roll .no-change { color: #888; font-style: italic; }
    </style>
  `;
}

/**
 * Determine the appropriate roll type for an action based on context
 * @param {Object} action - The downtime action
 * @param {Object} character - The character performing the action
 * @returns {string} ROLL_TYPES constant
 */
export function determineRollType(action, character) {
  // Explicit dice pool actions always use dice pool
  if (action.rollType === "dice-pool" || action.rollType === "pool" || action.rollType === "recovery") {
    return ROLL_TYPES.DICE_POOL;
  }

  // Explicit pilot check (only when not overridden by character/action context)
  if (action.rollType === "pilot-check") {
    return ROLL_TYPES.PILOT_CHECK;
  }

  // Far Field characters use dice pools for skill-type actions
  if (character?.hasFarFieldData) {
    return ROLL_TYPES.DICE_POOL;
  }

  // Far Field action set uses dice pools
  if (action.actionSetId === "far-field") {
    return ROLL_TYPES.DICE_POOL;
  }

  // "skill" rollType without Far Field context falls back to pilot check
  if (action.rollType === "skill") {
    return ROLL_TYPES.PILOT_CHECK;
  }

  // Default to pilot check for LANCER Core
  return ROLL_TYPES.PILOT_CHECK;
}

/**
 * Get the base pool size for a Far Field character
 * This would typically come from the relevant skill/aspect
 * @param {Actor} actor - The actor
 * @param {Object} action - The action being performed
 * @returns {number} Base pool size
 */
export function getBasePoolSize(actor, action) {
  const ffChar = actor?.getFlag?.("Far-Field-Foundry-Module-main", "character");
  if (!ffChar) return 2;

  const aspects = ffChar.aspects || [];
  if (aspects.length === 0) return 2;

  // Map action categories to the aspect types most relevant to them
  const categoryToAspectType = {
    "development": "Expertise",
    "social": "Expertise",
    "rest": "Expertise",
    "personal": "Expertise",
    "acquisition": "Equipment",
    "logistics": "Equipment",
    "maintenance": "Equipment"
  };

  const preferredType = categoryToAspectType[action.category];

  // Find the best matching aspect: prefer the preferred type, use highest unmarked track
  let bestAspect = null;
  let bestScore = -1;

  for (const aspect of aspects) {
    const available = (aspect.track || 0) - (aspect.marked || 0);
    const typeMatch = aspect.type === preferredType ? 1 : 0;
    const score = typeMatch * 100 + available;
    if (score > bestScore) {
      bestScore = score;
      bestAspect = aspect;
    }
  }

  if (bestAspect) {
    // Pool size = aspect track size (total boxes), minimum 2
    return Math.max(2, bestAspect.track || 2);
  }

  return 2;
}

/**
 * Get base accuracy for a pilot check
 * @param {Actor} actor - The actor
 * @param {Object} action - The action being performed
 * @returns {number} Base accuracy
 */
export function getBaseAccuracy(actor, action) {
  // Could look up pilot skills, gear bonuses, etc.
  // For now, return 0
  return 0;
}
