/**
 * Character Adapters
 *
 * Adapters for different character types (LANCER Core, Far Field)
 * to provide consistent interface for downtime actions.
 */

import { MODULE_ID } from "./constants.mjs";

/**
 * Base character adapter
 */
class BaseCharacterAdapter {
  constructor(actor) {
    this.actor = actor;
  }

  get id() {
    return this.actor.id;
  }

  get name() {
    return this.actor.name;
  }

  get img() {
    return this.actor.img;
  }

  /**
   * Get aspects that can be affected by recovery
   */
  getAspects() {
    return [];
  }

  /**
   * Get resources that can be affected by downtime
   */
  getResources() {
    return [];
  }

  /**
   * Get burdens on the character
   */
  getBurdens() {
    return [];
  }

  /**
   * Clear marks from an aspect
   */
  async clearAspectMarks(aspectId, count = null) {
    // Override in subclass
  }

  /**
   * Clear burned boxes from an aspect
   */
  async clearAspectBurn(aspectId, count = 1) {
    // Override in subclass
  }

  /**
   * Clear marks from a resource
   */
  async clearResourceMarks(resourceId, count = null) {
    // Override in subclass
  }

  /**
   * Remove a burden
   */
  async removeBurden(burdenId) {
    // Override in subclass
  }

  /**
   * Add a resource
   */
  async addResource(name, type, track = 3) {
    // Override in subclass
  }

  /**
   * Get projects
   */
  getProjects() {
    const downtimeData = this.actor.getFlag(MODULE_ID, "data");
    return downtimeData?.projects || [];
  }

  /**
   * Progress a project
   */
  async progressProject(projectId, amount = 1) {
    const downtimeData = this.actor.getFlag(MODULE_ID, "data") || {};
    const projects = [...(downtimeData.projects || [])];
    const project = projects.find(p => p.id === projectId);

    if (project) {
      project.progress = Math.min(project.track, project.progress + amount);

      await this.actor.setFlag(MODULE_ID, "data", {
        ...downtimeData,
        projects
      });
    }
  }
}

/**
 * Adapter for Far Field characters
 */
class FarFieldCharacterAdapter extends BaseCharacterAdapter {

  get characterData() {
    return this.actor.getFlag("Far-Field-Foundry-Module-main", "character") || {};
  }

  getAspects() {
    return this.characterData.aspects || [];
  }

  getResources() {
    return this.characterData.resources || [];
  }

  getBurdens() {
    return this.characterData.burdens || [];
  }

  async clearAspectMarks(aspectId, count = null) {
    const charData = this.characterData;
    const aspects = [...(charData.aspects || [])];
    const aspect = aspects.find(a => a.id === aspectId);

    if (aspect) {
      if (count === null) {
        // Clear all marks (but not burned)
        aspect.marked = aspect.burned || 0;
      } else {
        aspect.marked = Math.max(aspect.burned || 0, aspect.marked - count);
      }

      await this.actor.setFlag("Far-Field-Foundry-Module-main", "character", {
        ...charData,
        aspects
      });
    }
  }

  async clearAspectBurn(aspectId, count = 1) {
    const charData = this.characterData;
    const aspects = [...(charData.aspects || [])];
    const aspect = aspects.find(a => a.id === aspectId);

    if (aspect && aspect.burned > 0) {
      aspect.burned = Math.max(0, aspect.burned - count);
      aspect.marked = Math.max(aspect.marked, aspect.burned);

      await this.actor.setFlag("Far-Field-Foundry-Module-main", "character", {
        ...charData,
        aspects
      });
    }
  }

  async clearResourceMarks(resourceId, count = null) {
    const charData = this.characterData;
    const resources = [...(charData.resources || [])];
    const resource = resources.find(r => r.id === resourceId);

    if (resource) {
      if (count === null) {
        resource.marked = resource.burned || 0;
      } else {
        resource.marked = Math.max(resource.burned || 0, resource.marked - count);
      }

      await this.actor.setFlag("Far-Field-Foundry-Module-main", "character", {
        ...charData,
        resources
      });
    }
  }

  async removeBurden(burdenId) {
    const charData = this.characterData;
    const burdens = (charData.burdens || []).filter(b => b.id !== burdenId);

    await this.actor.setFlag("Far-Field-Foundry-Module-main", "character", {
      ...charData,
      burdens
    });
  }

  async addResource(name, type, track = 3) {
    const charData = this.characterData;
    const resources = [...(charData.resources || [])];

    resources.push({
      id: foundry.utils.randomID(),
      name,
      type,
      track,
      marked: 0,
      burned: 0
    });

    await this.actor.setFlag("Far-Field-Foundry-Module-main", "character", {
      ...charData,
      resources
    });
  }
}

/**
 * Adapter for standard LANCER pilots
 */
class LancerPilotAdapter extends BaseCharacterAdapter {

  /**
   * LANCER Core doesn't have the same aspect/resource system,
   * so we provide limited functionality
   */

  getReserves() {
    // Get pilot reserves from LANCER system data
    return this.actor.items.filter(i => i.type === "reserve") || [];
  }

  async markReserveUsed(reserveId) {
    const reserve = this.actor.items.get(reserveId);
    if (reserve) {
      await reserve.update({ "system.used": true });
    }
  }

  async markReserveAvailable(reserveId) {
    const reserve = this.actor.items.get(reserveId);
    if (reserve) {
      await reserve.update({ "system.used": false });
    }
  }
}

/**
 * Generic adapter for unknown actor types
 */
class GenericActorAdapter extends BaseCharacterAdapter {
  // Uses base class implementations (mostly no-ops)
}

/**
 * Get the appropriate adapter for an actor
 */
export function getCharacterAdapter(actor) {
  // Check for Far Field character data
  const farFieldChar = actor.getFlag("Far-Field-Foundry-Module-main", "character");
  if (farFieldChar) {
    return new FarFieldCharacterAdapter(actor);
  }

  // Check for LANCER pilot
  if (actor.type === "pilot") {
    return new LancerPilotAdapter(actor);
  }

  // Default generic adapter
  return new GenericActorAdapter(actor);
}

/**
 * Apply recovery effects to a character
 */
export async function applyRecoveryEffects(actor, rollResult) {
  const adapter = getCharacterAdapter(actor);

  // Clear all marks from aspects and resources
  for (const aspect of adapter.getAspects()) {
    await adapter.clearAspectMarks(aspect.id);
  }
  for (const resource of adapter.getResources()) {
    await adapter.clearResourceMarks(resource.id);
  }

  // Based on roll result, clear burned boxes
  let burnCleared = 0;
  switch (rollResult) {
    case "triumph":
      burnCleared = 3;
      break;
    case "success":
      burnCleared = 2;
      break;
    case "conflict":
      burnCleared = 2;
      break;
    case "disaster":
      burnCleared = 1;
      break;
  }

  // Let player choose which aspect to clear burn from
  // For now, just return the count - UI should handle selection
  return {
    marksCleared: true,
    burnToClear: burnCleared
  };
}

/**
 * Apply "Take a Break" effects to a character
 */
export async function applyTakeABreakEffects(actor) {
  const adapter = getCharacterAdapter(actor);

  // Clear ALL burned boxes from ALL aspects
  for (const aspect of adapter.getAspects()) {
    await adapter.clearAspectMarks(aspect.id);
    // Clear all burn
    while (aspect.burned > 0) {
      await adapter.clearAspectBurn(aspect.id, aspect.burned);
    }
  }

  // Remove all burdens
  for (const burden of adapter.getBurdens()) {
    await adapter.removeBurden(burden.id);
  }

  return { success: true };
}
