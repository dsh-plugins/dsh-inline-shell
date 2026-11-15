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

agent 在它的下一步收到同一份片段，因此追问结果只需要一次输入——运行本身不消耗模型轮次，也不消耗 token。

Chat 会把“没有 step 的轮次”折叠成一个分组，记录行因此在该分组的展开层里。把插件行 `config` 的 `turn` 设为
`model` 可以保留这一轮：agent 在同一步读到条目、行也直接显示，代价是每条命令一次模型请求。

## 预期行为

- 命令通过当前 profile 的 shell 执行器在会话工作目录中运行，并且默认**绕过沙箱**：你键入的命令就是这条对话的完全访问
  入口，因此权限预设既不会收窄它，也不会阻止它。把 `sandbox` 设为 `session` 则改为遵守该预设。
- 没有审批提示：命令就是你键入的这条消息。
- 输出有界：stdout 最多捕获 256 KiB，渲染最多 12,000 字符并附 `[output truncated]`，超过 120 秒会报告
  `Exit code: -1` 与 `command timed out`。
- 只发送 `!` 会记录一条用法提示，不执行任何命令。
- 带附件的消息会原样送达模型，因为只有单个文本块才被当作命令。

## 限制

- Web 输入框没有针对 `!` 行的提交钩子，因此前缀在消息发出后才被处理。记录条目就是这次运行的对话记录，你键入的原始
  `!` 行不会被保留。
- 命令运行期间没有流式输出；命令结算后才出现该行。
- 记录行隶属于该消息开启的轮次；当这次运行不消耗模型请求时，Chat 会把它折叠进一个分组里。
