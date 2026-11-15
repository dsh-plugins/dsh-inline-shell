# Inline shell (!)

English | [中文](README.zh.md)

## Summary

Type a message that starts with `!` in any conversation and the rest of it runs as a shell command instead of
going to the model. The command and its output become a durable conversation entry, so you and the agent read the
same record: the transcript grows an `inline-shell` context row (`echo hello → exit 0`) that expands to the exact
text the model received, and that text enters the next model request in the same step.

The behavior follows the OpenAI Codex CLI's `!` shell escape: the same `<user_shell_command>` fragment shape, the
same "run where the conversation runs" rule, and the same idea that a command the human typed is conversation
material rather than a tool call.

## Table of Contents

- [Use this package](#use-this-package)
- [How it works](#how-it-works)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Install the bundle (Plugins > Add plugin with this directory, or `dsh plugin --profile <name> add <dir>`), then
open any conversation and send:

```text
!echo hello
```

The composer submits it like any other message. The Host runs `echo hello` in the Session working directory, then
records the run as a conversation entry:

- The collapsed row shows the command and its outcome: `echo hello → exit 0`.
- Expanding the row shows the model-facing fragment with the exit code, duration, and output.
- The agent receives that fragment in the same step, so it can answer about the result immediately.

A bare `!` records a usage note instead of running anything.

### What the command runs under

The command runs through the profile's shell executor (`ctx.shell`) in the Session working directory, under the
same sandbox policy as a command the agent issues. A profile whose default preset is `danger-full-access` runs
commands unconfined, which is what the Desktop app does; a sandboxed profile keeps its confinement, and a sandbox
backend that cannot start refuses the command rather than silently running it unconfined.

There is no approval prompt: the human typed the command, and the command is the message.

-----

<a id="how-it-works"></a>
## How it works

1. The Web composer submits `!echo hello` as an ordinary prompt; the client has no submission hook for a `!` line
   (its command plane only adjudicates lines that start with `/`).

2. The plugin listens on the agent's `agent/pre-step` waterfall. A message whose single text block starts with `!`
   is matched, the command is executed once per message identity, and a second user-role message is appended to
   the step batch.

3. That appended message carries `source: { kind: 'inline-shell', form: 'notice', summary }`. Chat renders any
   non-`user` source as an injected-context row, so the entry appears beside the human's own `!` line with a
   one-line summary and an expandable body.

4. The loop commits both messages as `user/message` events before the request is built, so the entry is durable,
   replayable, and model-visible in the same step.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

| File | Role |
|---|---|
| `src/index.ts` | Plugin entry: exports `name`, `inject`, `apply`. |
| `src/intercept.ts` | Per-agent `agent/pre-step` listener, `!` parsing, append and once-per-message cache. |
| `src/execute.ts` | Runs one command through `ctx.shell` in the Session directory. |
| `src/format.ts` | Renders the `<user_shell_command>` fragment and the collapsed row summary. |
| `src/shared.ts` | Package identity, prefix, source form, and output limits. |
| `src/types.ts` | Minimal structural types for the Host services the plugin reads. |

The plugin has no Client half and declares no runtime dependency on Harness packages: it reads `ctx.shell` and
`ctx.workingDirectory` and builds the message objects itself.

Output is bounded: stdout is capped at 256 KiB at the executor, the rendered output is capped at 12,000 characters
with `[output truncated]`, and a command that exceeds 120 seconds is killed and reported as `Exit code: -1` with
`command timed out`.

## Verification

The delivered bundle was exercised in a live Web UI launched with an isolated `DSH_HOME` (`dsh --profile inline-e2e
web`), a profile that mounted the bundle from this checkout, and Playwright/Chromium driving the page. Verified:

- `!echo inline-shell-ok` produces the `inline-shell` context row with `echo inline-shell-ok → exit 0`; expanding it
  shows the `<user_shell_command>` fragment with `Exit code: 0`, `Duration: 0.7100 seconds`, and `inline-shell-ok`.
- The agent answers about that result in the same turn without another prompt.
- A bare `!` records the usage entry and runs nothing; a message without the prefix adds no entry and reaches the
  model as ordinary input.
- Plugins shows the bundle as `Inline shell (!)` with its description and icon, and its detail page renders
  `docs/DETAIL.md`.

Not verified: the display in a second locale, and the attachment path (a message carrying attachments is delivered
unchanged by design).

-----

<a id="model-experience"></a>
## Model Experience

### What the model sees

Every `!` command adds one user-role message in the shape the Codex CLI uses:

```text
<user_shell_command>
<command>
echo hello
</command>
<result>
Exit code: 0
Duration: 0.7100 seconds
Output:
hello
</result>
</user_shell_command>
```

Stderr follows stdout under a `[stderr]` label. A run cut short reports `Exit code: -1` and names the reason
(`command aborted`, `command timed out`, `killed by <signal>`). A command the executor could not start reports
`command failed to run: <reason>`.

The model also sees the human's original `!echo hello` line, because the composer message is preserved.

### Token effect

One command adds its fragment (at most roughly 12,000 output characters) once. The entry is durable, so later
steps and later turns reread it from the Session log rather than re-running the command.

### KV Cache effect

The appended message changes the request prefix from the step it enters onward. The command does not run again on
retry: the same message identity reuses the settled entry.

## Known Limitations and Deferred Work

- **The prefix cannot be claimed in the composer.** The client submit machine only adjudicates `/` lines and the
  trigger pipeline accepts `/` and `@`, so `!` is handled after the human sends it. The consequence is that the
  human's raw `!` line stays in the transcript and in model history next to the recorded result.
- **One command per message.** A message is a command only when it is a single text block starting with `!`; an
  attachment-carrying message is delivered unchanged.
- **Session sandbox, not the Codex full-access escape hatch.** Codex runs `!` commands with sandboxing disabled;
  this plugin inherits the profile's policy, because a plugin that silently widened its own authority would be
  lying about the conversation's sandbox.
- **No streaming.** The row appears when the command settles; a long command shows nothing until it finishes.
