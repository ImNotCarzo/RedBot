"use strict";
/**
 * templates.js — re-exports the static template factories from ComponentsV2Builder
 * as standalone named functions for convenient direct imports.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoleMenu = exports.createPlanSelector = exports.createTicketMenu = exports.createConfirm = void 0;

const ComponentsV2Builder_js_1 = require("../ComponentsV2Builder.js");

/**
 * Create a Confirm / Cancel button container.
 */
function createConfirm(confirmId, cancelId) {
  return ComponentsV2Builder_js_1.ComponentsV2Builder.createConfirm(confirmId, cancelId);
}
exports.createConfirm = createConfirm;

/**
 * Create a ticket category select menu container.
 */
function createTicketMenu(customId) {
  return ComponentsV2Builder_js_1.ComponentsV2Builder.createTicketMenu(customId);
}
exports.createTicketMenu = createTicketMenu;

/**
 * Create a plan selector container.
 */
function createPlanSelector(customId) {
  return ComponentsV2Builder_js_1.ComponentsV2Builder.createPlanSelector(customId);
}
exports.createPlanSelector = createPlanSelector;

/**
 * Create a role selector menu container.
 */
function createRoleMenu(customId) {
  return ComponentsV2Builder_js_1.ComponentsV2Builder.createRoleMenu(customId);
}
exports.createRoleMenu = createRoleMenu;
