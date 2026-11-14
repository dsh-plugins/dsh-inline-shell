# Inline shell (!)

A message that starts with `!` runs as a shell command in the conversation's workspace. The command and its output
become one durable conversation entry that you and the agent both read.

## Run a command

Send a message that begins with `!`:

```text
!echo hello
```

The conversation gains an `inline-shell` context row that reads `echo hello → exit 0`. Select the row to expand the
exact text the agent received:

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

The agent receives the same fragment in the same step, so asking about the result needs no second turn.

## What to expect

- The command runs in the Session working directory through the profile's shell executor, under the same sandbox
  policy as an agent-issued command. A profile with the `danger-full-access` default preset (the Desktop app)
  runs them unconfined; a sandboxed profile keeps its confinement and refuses to run the command when its sandbox
  backend cannot start.
- There is no approval prompt: the command is the message you typed.
- Output is bounded: 256 KiB captured from stdout, 12,000 characters rendered with `[output truncated]`, and a
  120-second deadline that reports `Exit code: -1` with `command timed out`.
- A bare `!` records a usage note and runs nothing.
- A message with attachments is delivered to the model unchanged, because only a single text block is treated as a
  command.

## Limits

- The Web composer has no submission hook for a `!` line, so the prefix is handled after the message is sent. Your
  original `!` line stays in the transcript and in model history next to the recorded result.
- Nothing streams while the command runs; the row appears when the command settles.
- The plugin follows the profile's sandbox rather than disabling confinement the way the Codex CLI does for its
  own `!` escape.
