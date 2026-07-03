# claude-codex-sync

[English](README.md) | **中文**

**把 Claude Code 的上下文桥接进 OpenAI Codex —— 将 Claude 的全局指令、rules 和项目 memory 转换成 Codex 可读的 Markdown，全程不碰 Claude 状态，也不写 Codex 原生 memory 数据库。**

> ⚠️ **免责声明。** 这是面向个人本机的迁移辅助工具，由 AI agent 构建。它只在显式 apply 命令后写入 Markdown bridge、报告、manifest 和备份。执行前请先阅读 plan 输出——尤其当 Claude memory 中包含私有项目上下文时。请从只读命令（`scan`、`plan`）开始，风险自担。

> 📖 **第一次使用？** 先读 **[docs/HOW-IT-WORKS.zh-CN.md](docs/HOW-IT-WORKS.zh-CN.md)**：设计思路、安全模型，以及逐文件解释它如何工作、为何这样做。

> 🗺️ **更喜欢看图？** 直接打开 **[交互式知识图谱](https://runtianlee.github.io/claude-codex-sync/knowledge-graph.html)**——本仓库的可视化地图（架构分层、import/调用关系边、12 步导览，页内一键中英切换），由 [understand-anything](https://github.com/Egonex-AI/Understand-Anything) 生成的知识图谱数据渲染而成，零依赖单文件；源文件见 [docs/knowledge-graph.html](docs/knowledge-graph.html)。

## 能做什么

| 命令 | 作用 |
|---|---|
| `claude-codex-sync scan` | **发现。** 找到 Claude 全局指令、rules、memory 目录和只报告配置。**不写任何文件。** |
| `claude-codex-sync plan` | **预览（全局）。** 打印将要写入的 Codex Markdown bridge 文件清单。**不写任何文件。** |
| `claude-codex-sync apply --yes` | **应用（全局）。** 把同步写入 `~/.codex`。修改前备份，内容不变时跳过。 |
| `claude-codex-sync project <path>` | **预览（项目，dry-run）。** 打印项目级写入计划。**不写任何文件。** |
| `claude-codex-sync project <path> --apply` | **应用（项目）。** 在目标项目下写入本地上下文文件；如果目标是 Git 仓库，会补 `.gitignore`。 |
| `claude-codex-sync report` | **看报告。** 打印最近一次全局同步报告。 |
| `claude-codex-sync report --project <path>` | **看报告（项目）。** 打印最近一次项目同步报告。 |
| `claude-codex-sync restore [--project <path>]` | **预览撤销（dry-run）。** 列出哪些文件可以回滚到最新备份。**不写任何文件。** |
| `claude-codex-sync restore [--project <path>] --yes` | **撤销。** 把每个被同步的文件回滚到最新备份。备份文件保留。 |
| `claude-codex-sync clean [--project <path>]` | **预览移除（dry-run）。** 列出同步产生的所有可移除内容。**不写任何文件。** |
| `claude-codex-sync clean [--project <path>] --yes` | **移除。** 移除同步内容：托管区块（手写内容保留）、生成文件、工具加的 gitignore 条目。加 `--purge-backups` 连备份一起删。 |

`install.sh` 会构建 CLI 并把 `claude-codex-sync` 启动器安装到 `~/.local/bin`。它绝不修改你的 shell 配置文件。

> **注意：** `scan` 和 `plan` 永远只读。全局 `apply` 必须带 `--yes`；项目模式默认 dry-run，加 `--apply` 才写。你不要求，它就不写。

## 同步范围

| Claude 来源 | 变成 |
|---|---|
| `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` 中的托管区块 |
| `~/.claude/rules/**/*.md` | 镜像到 `~/.codex/claude-rules/` 的 Markdown |
| `~/.claude/projects/<project>/memory/` | 只读索引 `~/.codex/claude-memory-index/projects/<project>.md` |
| 项目 Claude 指令 | 本地 `AGENTS.override.md` |
| 匹配到的项目 memory | 本地 `.codex/claude-memory/index.md` |

settings、MCP、hooks、permissions、skills、plugins **只扫描和报告**——从不迁移。Codex 对 skill 和 plugin 有自己的原生安装/导入机制，请走那些流程，而不是复制 Claude 的 skill/plugin 状态。

## 效果展示：在 Codex 里验证

以下是一次真实会话的脱敏节选：运行 `apply --yes` 之后，直接在 Codex 里询问迁移的记忆是否生效。项目名和私有细节已替换为占位符，结构和结论未改动。

> **Q：本机当前的长期记忆包含哪些？**
>
> 我在本机只读 memory index 里看到 4 组长期记忆，位置是 `~/.codex/claude-memory-index/projects`：
>
> - **全局偏好** —— 默认中文回复；拼音姓名当普通文本，不当命令。
> - **`<project-a>`** —— 收尾状态：PR 已合并，历史已重写，旧分支可安全删除。
> - **`<project-b>`** —— 部署流程（走 CLI 直传，不是 push 自动部署）；余额查询功能的覆盖范围与待验证项。
> - **`<project-c>`** —— 用户画像、项目主线与真值文档、文档/协作/执行偏好、LLM 验证纪律、发布纪律、经验教训。
>
> 这些是当前 Codex 可见的 Claude memory index，不是我新写入的记忆。

> **Q：这些可以被 Codex 在使用时自动读取吗？**
>
> 可以，但要分两层理解：
>
> - **Codex 原生 Memories** 是独立功能——默认关闭，可在设置或 `~/.codex/config.toml` 里用 `[features] memories = true` 开启，存放在 `~/.codex/memories/`。本工具从不触碰它。
> - **这批 Claude memory index** 位于 `~/.codex/claude-memory-index/`，是从 Claude memory 镜像过来的只读 Markdown。你当前的 AGENTS 指令里已经写了：当任务需要历史偏好、项目背景或长期上下文时，要先读取相关 project memory index。所以在当前配置下，Codex 会按需自动读取这些索引——普通问答不一定读取，但涉及 `<project-b>`、`<project-c>`、协作偏好、文档流程、发布流程时，我应该主动去读对应索引，再执行任务。

## 安全边界

- **从不写 Claude 文件。** 对本工具而言 `~/.claude` 是只读的。
- **从不写 Codex 原生 memory SQLite。** memory 变成只读 Markdown 索引，而不是数据库导入。
- **从不迁移**登录凭证、会话、历史、缓存、用量数据、skills、plugins 及 plugin 状态。
- **改动前先备份**所有可能含手写内容的文件（`AGENTS.md`、`AGENTS.override.md`、镜像 rules、`.gitignore`）。可再生成的输出（报告、manifest、memory 索引）直接覆盖不备份，反复 apply 不会堆积备份文件。
- **内容不变的文件直接跳过**；`~/.claude` 不存在时干净地空跑。
- **大 memory 文件流式解析**而非整体加载：索引记录大小、修改时间、行数、标题，以及有界预览（前 40 行 / 64 KiB——小于该上限的文件预览即全文），截断时附警告。

> **隐私提示。** `~/.codex` 下生成的文件（AGENTS.md、memory 索引）包含你的全局 `CLAUDE.md` 和 memory 预览。如果你把 `~/.codex` 同步到 dotfiles 仓库或任何共享位置，请先检查这些文件——发布它们就等于发布了这些上下文。

## 前置条件

- **Node.js 20+** 和 **npm**。
- Claude Code 数据位于 `~/.claude`。
- Codex 使用 `~/.codex`；如果你的 Codex home 在别处，设置 `CODEX_HOME`。

## 安装

```bash
git clone https://github.com/RuntianLee/claude-codex-sync.git
cd claude-codex-sync
./install.sh
```

脚本会安装依赖、构建 CLI，并把 `claude-codex-sync` 启动器放进 `~/.local/bin`（可用 `CLAUDE_CODEX_SYNC_BIN_DIR` 覆盖）。如果 `~/.local/bin` 不在你的 `PATH` 里，加上并重开终端：

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

想手动来？脚本做的只有：

```bash
npm install
npm run build
# 然后使用：node dist/index.js（或自建 alias）
```

## 使用方法

全局同步——永远先看再写：

```bash
claude-codex-sync scan            # 发现 Claude 来源和只报告配置（不写任何文件）
claude-codex-sync plan            # 打印将落到 ~/.codex 的确切文件清单（不写任何文件）
claude-codex-sync apply --yes     # 应用：AGENTS.md、claude-rules/、memory 索引、报告、manifest
claude-codex-sync report          # 查看最新全局报告
```

如果你的 Codex home 不是 `~/.codex`，每条命令都带上 `CODEX_HOME`：

```bash
CODEX_HOME=/path/to/codex-home claude-codex-sync plan
CODEX_HOME=/path/to/codex-home claude-codex-sync apply --yes
```

全局 apply 之后建议检查：

```bash
less ~/.codex/AGENTS.md
less ~/.codex/claude-sync-report.md
ls ~/.codex/claude-memory-index/projects
```

## 项目模式

为单个仓库创建本地 Codex 上下文。先 dry-run：

```bash
claude-codex-sync project /path/to/repo            # 只打印操作计划（不写任何文件）
claude-codex-sync project /path/to/repo --apply    # 写入项目本地文件；Git 仓库会更新 .gitignore
claude-codex-sync report --project /path/to/repo   # 查看项目报告
```

项目产物设计为留在本地并被 gitignore：

- `AGENTS.override.md`
- `.codex/claude-memory/`
- `.codex/claude-sync-manifest.json`
- `.codex/claude-sync-report.md`

## 撤销与卸载

工具在改动可能含手写内容的既有文件前会创建备份，备份名形如：

```text
AGENTS.md.claude-codex-sync-backup-20260702-123456-789
```

把被同步的文件回滚到同步前的状态（和其他命令一样先 dry-run）：

```bash
claude-codex-sync restore              # 列出可回滚的文件
claude-codex-sync restore --yes        # 回滚到最新备份（备份保留）
claude-codex-sync restore --project /path/to/repo --yes
```

restore 会保留备份文件，因此可以放心重复；重新 `apply` 即重做同步。首次同步新建的文件没有备份——用 `clean` 或手动删除。

卸载工具本体——默认你已同步的上下文全部保留，Codex 继续使用最后一次同步的内容：

```bash
./uninstall.sh
```

这会移除启动器和本仓库目录。若仓库有未提交改动，脚本会拒绝删除，除非加 `--force`。

想要彻底清理？在卸载**之前**执行：

```bash
claude-codex-sync restore --yes                    # 可选：先把文件回滚到同步前状态
claude-codex-sync clean --yes                      # 移除同步产生的全部内容
claude-codex-sync clean --project /path/to/repo --yes
./uninstall.sh
```

`clean` 只移除 `AGENTS.md` / `AGENTS.override.md` 中的托管区块（你的手写内容保留），删除生成的 rules 镜像、memory 索引、报告和 manifest，并清掉工具添加的 `.gitignore` 条目。备份默认保留，加 `--purge-backups` 才删。跳过 `clean` 也没关系——一切照常工作，只是桥接的上下文停留在最后一次同步。

## 工作原理

- **单向桥。** 读取选定的 Claude 文件，渲染成安全的 Markdown，只写 Codex 侧或项目本地的生成文件——从不共享私有数据库。
- **托管区块。** 在 `AGENTS.md` / `AGENTS.override.md` 中，工具只拥有 `<!-- BEGIN CLAUDE_CODEX_SYNC:… -->` 与 `<!-- END … -->` 之间的区域。区块外的手写内容保留；标记缺失或重复时拒绝写入。
- **有界 memory 索引。** memory 被流式渲染成只读索引文件：元数据 + 大小受限的预览，预览用比内部最长反引号串更长的代码围栏包裹——超大或含反引号的 memory 无法破坏格式或撑爆 bridge。

完整讲解——流水线、托管区块规则和安全模型——见 **[docs/HOW-IT-WORKS.zh-CN.md](docs/HOW-IT-WORKS.zh-CN.md)**。

## 相关项目

- **[codex-disk-guard](https://github.com/RuntianLee/codex-disk-guard)** —— 同一作者的另一个开源工具。治理 OpenAI Codex CLI 在 macOS 上的持续磁盘写入：监控写入速率、控制日志数据库体积、清理垃圾文件——全程不碰你的会话和记忆。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
