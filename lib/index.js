// src/intercept.ts
import { randomUUID } from "node:crypto";

// src/shared.ts
var PACKAGE_NAME = "@dsh-plugin/dsh-inline-shell";
var SHELL_PREFIX = "!";
var SOURCE_KIND = "inline-shell";
var SOURCE_FORM = "notice";
var COMMAND_TIMEOUT_MS = 12e4;
var STDOUT_MAX_BYTES = 256 * 1024;
var OUTPUT_MAX_CHARS = 12e3;
var TRUNCATION_NOTICE = "[output truncated]";

// src/format.ts
function seconds(durationMs) {
  return (durationMs / 1e3).toFixed(4);
}
function clip(text) {
  return text.length <= OUTPUT_MAX_CHARS ? text : `${text.slice(0, OUTPUT_MAX_CHARS)}
${TRUNCATION_NOTICE}`;
}
function exitCodeOf(result) {
  return result.exitCode ?? -1;
}
function combinedOutput(result) {
  const parts = [];
  const stdout = result.stdout.text;
  const stderr = result.stderr.text;
  if (stdout !== "") parts.push(stdout);
  if (stderr !== "") parts.push(`[stderr]
${stderr}`);
  if (result.aborted) {
    parts.push("command aborted");
  } else if (result.timedOut) {
    parts.push("command timed out");
  } else if (result.exitCode === null && result.signal !== null) {
    parts.push(`killed by ${result.signal}`);
  }
  return parts.join("\n");
}
function statusOf(result) {
  if (result.aborted) return "aborted";
  if (result.timedOut) return "timed out";
  if (result.exitCode === null && result.signal !== null) return `killed by ${result.signal}`;
  return `exit ${exitCodeOf(result)}`;
}
function summaryOf(command, status) {
  return `You ran ${command} \xB7 ${status}`;
}
function fragment(command, result, durationMs) {
  return [
    "<user_shell_command>",
    "<command>",
    command,
    "</command>",
    "<result>",
    `Exit code: ${exitCodeOf(result)}`,
    `Duration: ${seconds(durationMs)} seconds`,
    "Output:",
    clip(combinedOutput(result)),
    "</result>",
    "</user_shell_command>"
  ].join("\n");
}
function entryOf(command, result, durationMs) {
  return { text: fragment(command, result, durationMs), summary: summaryOf(command, statusOf(result)) };
}
function failureEntry(command, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    text: [
      "<user_shell_command>",
      "<command>",
      command,
      "</command>",
      "<result>",
      "Exit code: -1",
      "Duration: 0.0000 seconds",
      "Output:",
      clip(`command failed to run: ${message}`),
      "</result>",
      "</user_shell_command>"
    ].join("\n"),
    summary: summaryOf(command, "failed")
  };
}
function usageEntry() {
  return {
    text: "Prefix a command with ! to run it locally, for example: !echo hello",
    summary: "Prefix a command with ! to run it locally"
  };
}

// src/execute.ts
async function runInlineShell(ctx, agent, command, signal) {
  const startedAt = Date.now();
  try {
    const workdir = await workingDirectoryOf(ctx, agent, signal);
    const spec = ctx.shell.resolve({
      command,
      ...workdir === void 0 ? {} : { workdir },
      timeoutMs: COMMAND_TIMEOUT_MS,
      stdoutMaxBytes: STDOUT_MAX_BYTES,
      signal
    });
    const execution = await ctx.shell.execute(spec);
    const result = await execution.result();
    return entryOf(command, result, Date.now() - startedAt);
  } catch (error) {
    return failureEntry(command, error);
  }
}
async function workingDirectoryOf(ctx, agent, signal) {
  try {
    const directory = await ctx.workingDirectory.ensure(agent, signal);
    return directory === "" ? void 0 : directory;
  } catch {
    return void 0;
  }
}

// src/intercept.ts
function installInlineShell(ctx) {
  const listeners = /* @__PURE__ */ new Map();
  ctx.on("agent/created", ({ agent }) => {
    const cache = /* @__PURE__ */ new Map();
    const dispose = agent.ctx.effect(
      () => agent.ctx.on("agent/pre-step", createListener(ctx, agent, cache)),
      "inline-shell: pre-step"
    );
    listeners.set(agent, dispose);
  });
  ctx.on("agent/disposed", ({ agent }) => {
    listeners.get(agent)?.();
    listeners.delete(agent);
  });
  ctx.effect(() => () => {
    for (const dispose of listeners.values()) dispose();
    listeners.clear();
  }, "inline-shell: agent listeners");
}
function createListener(ctx, agent, cache) {
  return async (payload, next) => {
    const decision = await next();
    if (decision.kind !== "enter") return decision;
    const messages = [];
    let appended = false;
    for (const message of decision.messages) {
      messages.push(message);
      const command = commandOf(message);
      if (command === void 0) continue;
      messages.push(await entryMessage(ctx, agent, cache, message, command, payload.signal));
      appended = true;
    }
    return appended ? { ...decision, messages } : decision;
  };
}
function commandOf(message) {
  if (message.source.kind !== "user") return void 0;
  const blocks = message.content;
  if (blocks.length !== 1) return void 0;
  const block = blocks[0];
  if (block === void 0 || block.type !== "text" || block.text === void 0) return void 0;
  if (!block.text.startsWith(SHELL_PREFIX)) return void 0;
  return block.text.slice(SHELL_PREFIX.length).trim();
}
async function entryMessage(ctx, agent, cache, message, command, signal) {
  const entry = command === "" ? usageEntry() : await settledEntry(ctx, agent, cache, message.id, command, signal);
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text: entry.text }],
    source: { kind: SOURCE_KIND, form: SOURCE_FORM, summary: entry.summary }
  };
}
function settledEntry(ctx, agent, cache, messageId, command, signal) {
  const cached = cache.get(messageId);
  if (cached !== void 0) return cached;
  const pending = runInlineShell(ctx, agent, command, signal);
  cache.set(messageId, pending);
  return pending;
}

// src/index.ts
var name = PACKAGE_NAME;
var inject = ["shell", "workingDirectory"];
function apply(ctx) {
  installInlineShell(ctx);
}
export {
  apply,
  inject,
  name
};
