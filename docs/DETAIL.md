# Inline shell (!)

A message that starts with `!` runs as a shell command in the conversation's workspace. The command and its output
become one durable conversation entry that you and the agent both read.

## Run a command

Send a message that begins with `!`:

```text
!echo hello
```

The conversation gains an `inline-shell` context row that reads `You ran echo hello · exit 0`. Select the row to
expand the exact text the agent received:

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

The agent receives the same fragment at its next step, so asking about the result needs one prompt — the run itself
costs no model turn and no tokens.

Chat folds a turn that took no step into a collapsed group, so the recorded row sits under that group's disclosure.
Set `turn: model` in the plugin row's `config` to keep the turn instead: the agent reads the entry in that same step
and the row renders inline, at the cost of one model request per command.

## What to expect

- The command runs in the Session working directory through the profile's shell executor, with confinement bypassed
  by default: your typed command is the conversation's full-access escape hatch, so the permission selector neither
  narrows nor blocks it. `sandbox: session` makes it obey the preset instead.
- There is no approval prompt: the command is the message you typed.
- Output is bounded: 256 KiB captured from stdout, 12,000 characters rendered with `[output truncated]`, and a
  120-second deadline that reports `Exit code: -1` with `command timed out`.
- A bare `!` records a usage note and runs nothing.
- A message with attachments is delivered to the model unchanged, because only a single text block is treated as a
  command.

## Limits

- The Web composer has no submission hook for a `!` line, so the prefix is handled after the message is sent. The
  recorded entry is the transcript record of the run; your raw `!` line is not kept.
- Nothing streams while the command runs; the row appears when the command settles.
- The row is recorded under the turn that the message opened, which Chat folds into a collapsed group when the run
  spends no model request.
