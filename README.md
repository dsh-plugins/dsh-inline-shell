# Inline shell (!)

English | [中文](README.zh.md)

## Summary

Type a message that starts with `!` in any conversation and the rest of it runs as a shell command instead of
going to the model. The command and its output become a durable conversation entry, so you and the agent read the
same record: the transcript grows an `inline-shell` context row (`You ran echo hello · exit 0`) that expands to the
exact text the model received, and that text enters the next model request in the same step.

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

- The collapsed row names the run the way the Codex CLI's cell does: `You ran echo hello · exit 0`.
- Expanding the row shows the model-facing fragment with the exit code, duration, and output.
- **No model turn is started by default.** The command costs no request and no tokens; the agent reads the recorded
  entry at its next step, and answers then if the conversation calls for it.

A bare `!` records a usage note instead of running anything.

### Choosing whether the run starts a turn

Chat folds a turn that took no step into a collapsed group, so the recorded row sits behind that group's
disclosure. Set `turn: model` to keep the turn instead: the agent reads the entry in that same step, comments on the
result, and the row renders inline — at the cost of one model request per command.

```yaml
- id: inline-shell
  name: '@dsh-plugin/dsh-inline-shell'
  config:
    turn: model
```

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
   is matched and the command is executed once per message identity.

3. When the batch carries nothing else for the model, the plugin records the entry itself as a `user/message` and
   rejects the step. Rejection is the one decision every other pre-step listener passes through unchanged, and the
   loop closes the turn without a step and without a request, so the command never reaches the provider.
   `turn: model` skips the rejection and enters the step with the entry appended instead.

4. The recorded message carries `source: { kind: 'inline-shell', form: 'notice', summary }`. Chat renders any
   non-`user` source as an injected-context row, so the entry appears with a one-line summary and an expandable
   body; the fragment inside it is what the model reads at its next step.

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

- `!echo inline-shell-ok` produces the `inline-shell` context row with `You ran echo inline-shell-ok · exit 0`;
  expanding it shows the `<user_shell_command>` fragment with `Exit code: 0`, `Duration: 0.7100 seconds`, and
  `inline-shell-ok`.
- The run starts no model turn: the chat gains no assistant message, and Trajectory shows Turn 1 with context
  entries only and an empty Model lane.
- The recorded row is reachable under the turn's collapsed group and reads `You ran echo … · exit 0`.
- The next prompt still sees the run: asking "What did the last shell command print?" answers with the recorded
  output, so the entry reaches the model at its next step.
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

The command's own message is not kept: the recorded entry replaces it, so the transcript holds one row per run
rather than a `!` line plus a result.

### Token effect

No request is made for the command itself. Its fragment (at most roughly 12,000 output characters) enters the
model's history once, at the next step the agent takes, and later turns reread it from the Session log rather than
re-running the command.

### KV Cache effect

The entry joins the request prefix at the model's next step, not while the command runs. The command does not run
again on retry: the same message identity reuses the settled entry.

## Known Limitations and Deferred Work

- **The prefix cannot be claimed in the composer.** The client submit machine only adjudicates `/` lines and the
  trigger pipeline accepts `/` and `@`, so `!` is handled after the human sends it; the run therefore costs a
  `turn/start`/`turn/end` pair, but no step and no provider request.
- **The quiet mode hides the row one disclosure deep.** A turn with no step is folded into a collapsed group, so the
  recorded entry sits under it; `turn: model` renders the row inline for one request per command.
- **No immediate comment.** In the default mode the agent says nothing about the result until its next step; a
  reader who wants an explanation asks in the next prompt.
- **Session titles are a separate call.** The profile's session-title generator may still make its own small
  request for the session's first prompt; that is not an agent turn and can be disabled in the profile.
- **One command per message.** A message is a command only when it is a single text block starting with `!`; an
  attachment-carrying message is delivered unchanged.
- **Session sandbox, not the Codex full-access escape hatch.** Codex runs `!` commands with sandboxing disabled;
  this plugin inherits the profile's policy, because a plugin that silently widened its own authority would be
  lying about the conversation's sandbox.
- **No streaming.** The row appears when the command settles; a long command shows nothing until it finishes.
