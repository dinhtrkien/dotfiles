// Pi Calm - gapless built-in tool-shell presentation adapter.
//
// Adapted from the Firstmate project's Calm implementation.
// Copyright (c) 2026 Kun Chen. MIT License - see the LICENSE file in this directory.
//
// Verified against Pi 0.82.0 and 0.84.4.
//
// Fix vs. the original 0.82 adapter: the previous version only hid a row when
// Pi handed ToolExecutionComponent both a toolName in the hidden set *and* a
// defined `toolDefinition` that it had previously seen flow through
// AgentSession.getToolDefinition (recorded in a WeakSet). On Pi 0.84.4 that is
// no longer reliable: rows restored from session history (session resume,
// /reload) are constructed with `toolDefinition === undefined` because
// InteractiveMode.getRegisteredToolDefinition() returns nothing for a tool that
// is not in the *current* registry, so `state.toolDefinition !== undefined`
// was false and every restored row rendered at full height. Live rows still
// hid, which is why the breakage looked intermittent.
//
// This adapter now keys off `state.toolName` alone, so live and restored rows
// both collapse. Presentation only: execution, results, session storage, and
// export data are untouched; image results stay visible without their shell.
import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { calmHidesTranscriptChrome } from "./visibility.ts";

const CALM_BUILT_IN_TOOL_NAMES = new Set([
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  // Added by Pi 0.84.3 for Windows; kept hidden like the other built-ins.
  "powershell",
]);

// pi-web-access registers these as custom tools, so they need an explicit
// allowlist entry instead of relying on a source === "builtin" lookup.
const CALM_WEB_TOOL_NAMES = new Set([
  "web_search",
  "source_check",
  "fetch_content",
  "get_search_content",
]);

const CALM_HIDDEN_TOOL_NAMES = new Set([
  ...CALM_BUILT_IN_TOOL_NAMES,
  ...CALM_WEB_TOOL_NAMES,
]);

type ToolRowPresentationState = {
  toolName: string;
  imageComponents?: Component[];
  imageSpacers?: Component[];
};

type CalmBuiltInToolShellPatch = {
  hidesShell: () => boolean;
};

// Keep the introduction-version symbol stable so a compatible upgrade cannot
// double-patch a live process.
const CALM_BUILT_IN_TOOL_SHELL_PATCH = Symbol.for(
  "pi-calm:built-in-tool-shell-layout:pi-0.82.0",
);

export function installCalmBuiltInToolShellLayout(): void {
  const registry = globalThis as typeof globalThis & {
    [key: symbol]: CalmBuiltInToolShellPatch | undefined;
  };
  const hidesShell = (): boolean => calmHidesTranscriptChrome();
  const installed = registry[CALM_BUILT_IN_TOOL_SHELL_PATCH];
  if (installed) {
    installed.hidesShell = hidesShell;
    return;
  }

  if (typeof ToolExecutionComponent !== "function") {
    throw new Error("Pi Calm requires Pi ToolExecutionComponent");
  }
  const originalRender = ToolExecutionComponent.prototype.render;
  if (typeof originalRender !== "function") {
    throw new Error("Pi Calm requires Pi ToolExecutionComponent.render");
  }

  const patch: CalmBuiltInToolShellPatch = { hidesShell };
  ToolExecutionComponent.prototype.render = function (
    width: number,
  ): string[] {
    const state = this as unknown as ToolRowPresentationState;
    // Key off the tool name only. Requiring a captured toolDefinition dropped
    // every row restored from session history on Pi 0.84+ (see file header).
    if (!CALM_HIDDEN_TOOL_NAMES.has(state.toolName) || !patch.hidesShell()) {
      return originalRender.call(this, width);
    }

    // Keep image results visible without their call/result shell.
    const lines: string[] = [];
    const spacers = state.imageSpacers ?? [];
    const images = state.imageComponents ?? [];
    for (let index = 0; index < images.length; index += 1) {
      const spacer = spacers[index];
      if (spacer) lines.push(...spacer.render(width));
      const image = images[index];
      if (image) lines.push(...image.render(width));
    }
    return lines;
  };

  registry[CALM_BUILT_IN_TOOL_SHELL_PATCH] = patch;
}
