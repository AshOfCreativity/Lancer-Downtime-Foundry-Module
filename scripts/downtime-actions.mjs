/**
 * Built-in downtime action sets for LANCER Core and Far Field
 */

import { CATEGORIES, PHASES } from "./constants.mjs";

/**
 * LANCER Core Downtime Actions
 * Based on the core rulebook downtime activities
 */
export const LANCER_CORE_ACTIONS = {
  id: "lancer-core",
  name: "LANCER Core",
  system: "lancer-core",
  source: "built-in",
  version: "1.0.0",
  actions: [
    {
      id: "buy_some_time",
      name: "Buy Some Time",
      description: "Keep a volatile situation from exploding. Work to de-escalate a conflict, keep an enemy at bay, or buy time for something else to happen. You can't solve the problem, but you can delay it.",
      category: CATEGORIES.SOCIAL,
      phases: [PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill"
    },
    {
      id: "get_a_damn_drink",
      name: "Get a Damn Drink",
      description: "Blow off steam with your lancemates. Decompress after a mission, share stories, and recover from the stress of combat. Good for morale and mental health.",
      category: CATEGORIES.PERSONAL,
      phases: [PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: false
    },
    {
      id: "get_connected",
      name: "Get Connected",
      description: "Try to make connections, call in favors, or drum up support for a particular course of action. Reach out to contacts, make new ones, or leverage existing relationships.",
      category: CATEGORIES.SOCIAL,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill"
    },
    {
      id: "get_creative",
      name: "Get Creative",
      description: "Use your talents to create something - art, music, writing, engineering projects, or other creative works. Express yourself and potentially create something valuable.",
      category: CATEGORIES.DEVELOPMENT,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill"
    },
    {
      id: "get_focused",
      name: "Get Focused",
      description: "Train, study, or otherwise focus on self-improvement. Practice your skills, study tactics, work out, or meditate. Prepare yourself for challenges ahead.",
      category: CATEGORIES.DEVELOPMENT,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill"
    },
    {
      id: "get_organized",
      name: "Get Organized",
      description: "Start, run, or organize a group, business, or other organization. Rally people to a cause, establish a network, or build infrastructure for future operations.",
      category: CATEGORIES.SOCIAL,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill"
    },
    {
      id: "power_at_a_cost",
      name: "Power at a Cost",
      description: "Gain significant power, influence, or resources - but at a cost. Make a devil's bargain, accept a dangerous mission, or take on debt to get what you need now.",
      category: CATEGORIES.ACQUISITION,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      hasCost: true
    },
    {
      id: "scrounge_and_barter",
      name: "Scrounge and Barter",
      description: "Try to get your hands on something rare, strange, or useful. Dig through markets, trade favors, chase rumors, or find the right person with the right stuff.",
      category: CATEGORIES.ACQUISITION,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill"
    }
  ]
};

/**
 * Far Field Downtime Actions
 * Based on the Far Field playtest rules
 */
export const FAR_FIELD_ACTIONS = {
  id: "far-field",
  name: "Far Field",
  system: "far-field",
  source: "built-in",
  version: "1.0.0",
  actions: [
    {
      id: "recovery",
      name: "Recovery",
      description: "Rest and recover from mission stress. Clear all marked (non-burned) boxes on Aspects and Resources. You may also roll to clear burned boxes: Triumph = 3 boxes, Conflict = 2 boxes, Disaster = 1 box.",
      category: CATEGORIES.REST,
      phases: [PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "recovery",
      effects: [
        { type: "clearMarks", target: "aspects" },
        { type: "clearMarks", target: "resources" },
        { type: "rollToClearBurn", target: "aspects" }
      ]
    },
    {
      id: "take_a_break",
      name: "Take a Break",
      description: "Step back completely. Clear all burned boxes on all Aspects, remove all Burdens, and optionally revise your Drives. No roll required - you simply rest.",
      category: CATEGORIES.REST,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: false,
      effects: [
        { type: "clearAllBurn", target: "aspects" },
        { type: "removeBurdens" },
        { type: "allowDriveRevision" }
      ]
    },
    {
      id: "get_academic",
      name: "Get Academic",
      description: "Process data, perform research, or analyze samples from your missions. On success, gain a temporary Insight Resource that can be used for future rolls.",
      category: CATEGORIES.DEVELOPMENT,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "gainResource", resourceType: "insight" }
      ]
    },
    {
      id: "get_creative",
      name: "Get Creative",
      description: "Work on projects, create artistic works, or build something new. Creates a new Resource that persists into future missions.",
      category: CATEGORIES.DEVELOPMENT,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "gainResource", resourceType: "creation" }
      ]
    },
    {
      id: "gather_information",
      name: "Gather Information",
      description: "Investigate, gather rumors, or follow up on mysteries. Learn something useful about your current situation, upcoming mission, or the wider galaxy.",
      category: CATEGORIES.SOCIAL,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "gainInformation" }
      ]
    },
    {
      id: "get_connected",
      name: "Get Connected",
      description: "Make friends, call in favors, or establish new contacts. Gain a Connection Resource representing a person or organization willing to help you.",
      category: CATEGORIES.SOCIAL,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "gainResource", resourceType: "connection" }
      ]
    },
    {
      id: "scrounge_and_barter",
      name: "Scrounge and Barter",
      description: "Dig through junk, trade resources, or chase rumors of useful equipment. Find rare items, replacement parts, or useful supplies.",
      category: CATEGORIES.ACQUISITION,
      phases: [PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "gainResource", resourceType: "equipment" }
      ]
    },
    {
      id: "repair_equipment",
      name: "Repair Equipment",
      description: "Fix damaged gear and replenish consumables. Clear marks from Equipment and Consumable type Resources and Aspects.",
      category: CATEGORIES.MAINTENANCE,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: false,
      effects: [
        { type: "clearMarks", target: "resources", filter: "equipment" },
        { type: "clearMarks", target: "resources", filter: "consumable" }
      ]
    },
    {
      id: "personal_project",
      name: "Personal Project",
      description: "Work on a long-term personal goal. Progress a project track by 1 (or more on exceptional success). Projects can represent research, relationships, or personal goals.",
      category: CATEGORIES.DEVELOPMENT,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS, PHASES.SHORE_LEAVE],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "progressProject" }
      ],
      requiresInput: {
        projectName: { type: "select", label: "Project", source: "projects" }
      }
    },
    {
      id: "training",
      name: "Training",
      description: "Practice skills or learn from crewmates. Work toward improving your capabilities for future missions.",
      category: CATEGORIES.DEVELOPMENT,
      phases: [PHASES.TRANSIT, PHASES.BETWEEN_MISSIONS],
      requiresRoll: true,
      rollType: "skill",
      effects: [
        { type: "progressSkill" }
      ]
    }
  ]
};

/**
 * Get all built-in action sets
 */
export function getBuiltInActionSets() {
  return [LANCER_CORE_ACTIONS, FAR_FIELD_ACTIONS];
}

/**
 * Get a specific action set by ID
 */
export function getActionSetById(id) {
  const builtIn = getBuiltInActionSets();
  return builtIn.find(set => set.id === id) || null;
}

/**
 * Get all actions from multiple action sets
 */
export function getActionsFromSets(setIds) {
  const actions = [];
  const builtIn = getBuiltInActionSets();

  for (const setId of setIds) {
    const set = builtIn.find(s => s.id === setId);
    if (set) {
      actions.push(...set.actions.map(action => ({
        ...action,
        actionSetId: set.id,
        actionSetName: set.name
      })));
    }
  }

  return actions;
}

/**
 * Group actions by category
 */
export function groupActionsByCategory(actions) {
  const grouped = {};

  for (const action of actions) {
    const category = action.category || "other";
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(action);
  }

  return grouped;
}

/**
 * Filter actions by phase
 */
export function filterActionsByPhase(actions, phase) {
  if (!phase) return actions;
  return actions.filter(action =>
    !action.phases || action.phases.length === 0 || action.phases.includes(phase)
  );
}
