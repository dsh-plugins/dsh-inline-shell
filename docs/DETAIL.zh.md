# 行内 Shell（!）

以 `!` 开头的消息会在对话所在的工作区中作为 shell 命令执行。命令及其输出会成为一条你和 agent 都能读到的持久对话记录。

## 运行命令

发送一条以 `!` 开头的消息：

```text
!echo hello
```

对话中会出现一行 `inline-shell` 上下文条目，显示 `You ran echo hello · exit 0`。点击该行可展开 agent 实际收到的原文：

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

agent 在同一步收到同一份片段，因此追问结果不需要额外一轮。

## 预期行为

- 命令通过当前 profile 的 shell 执行器在会话工作目录中运行，沙箱策略与 agent 发起的命令相同。默认预设为
  `danger-full-access` 的 profile（Desktop 应用即如此）不受限制地运行；沙箱化 profile 保留其限制，沙箱后端无法
  启动时会拒绝执行命令。
- 没有审批提示：命令就是你键入的这条消息。
- 输出有界：stdout 最多捕获 256 KiB，渲染最多 12,000 字符并附 `[output truncated]`，超过 120 秒会报告
  `Exit code: -1` 与 `command timed out`。
- 只发送 `!` 会记录一条用法提示，不执行任何命令。
- 带附件的消息会原样送达模型，因为只有单个文本块才被当作命令。

## 限制

- Web 输入框没有针对 `!` 行的提交钩子，因此前缀在消息发出后才被处理。你键入的原始 `!` 行会与记录结果一起留在
  对话以及模型历史中。
- 命令运行期间没有流式输出；命令结算后才出现该行。
- 本插件遵循 profile 的沙箱策略，而不像 Codex CLI 那样为其 `!` 转义禁用限制。
