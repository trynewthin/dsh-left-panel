# dsh-left-panel

DeepSeek Harness（DSH）Web 侧边栏的 git 多工作树（worktree）增强：把左侧边栏的工作区列表重组为**项目（git 仓库，仅分组）→ worktree（真实工作区，可开会话）**的两层结构，并自动跟随 `git worktree` 的增删注册/注销工作区。

![dsh-left-panel 界面演示](https://raw.githubusercontent.com/trynewthin/dsh-left-panel/main/docs/ui-demo.png)

当前版本 `0.2.12` 面向 **DSH `0.2.2-rc.2` / Cordis `4.1.0`**。`engines.dsh` 使用范围 `>=0.2.2-rc.1 <0.3.0`，因此同系列补丁版本（含 `rc.2`）可直接加载，不再被精确版本锁拒绝。

- **底层语义不变**：每个 worktree 就是一个真实的 DSH Workspace（会话 cwd = worktree 目录），会话、日志、归档行为与原生完全一致；本插件只做注册/注销与展示分组。
- **自动同步是唯一行为**：向某个 git 仓库的任意工作树添加工作区后，插件扫描 `git worktree list`，把该仓库其余 worktree 自动注册为工作区（以分支名命名，detached 用短 hash）；worktree 被移除后自动注销（5 秒宽限，避免抖动）。主工作树永不自动注销。没有"自动/手动"开关，也不需要手动注册。
- **安全移除**：普通工作区和 linked worktree 可删除注册记录（主工作树的删除入口置灰、宿主侧拒绝）；项目菜单的“移除项目”一次移除其全部工作区。目录、Git 分支和会话日志均保留。已移除的工作树记录保存为墓碑，不会被自动重建；项目仍存在时可从“已移除的工作区”恢复，也可用“添加工作区”重新加入指定目录，仅清除该目录的墓碑。
- **新建 worktree**：项目菜单的「新建 worktree」打开对话框：分支栏可输入新分支名（`git worktree add -b`，基于主工作树 HEAD），也可下拉选择尚未检出的本地分支（`git worktree add` 直接检出）；位置栏默认预填「主工作树同级 + 仓库名-分支名」，可改，也可从下拉切换到其他 worktree 所在的同级目录。创建后由既有自动同步注册，墓碑自动清除，无需手动添加。
- **界面克制**：仓库行只显示项目名（不显示数量、不显示同步状态、主工作树不加标记）；仓库行仅在 git 扫描失败时出现一个 `!`；菜单提供重命名、新建 worktree、刷新、移除项目及恢复已移除工作区。分组、单列表和搜索列表均不渲染底部渐变遮罩。
- **项目与工作树都能重命名**：worktree 标题仍写入 DSH Workspace，但重名只在所属项目内校验，因此不同项目都能使用 `main`；仓库节点不是工作区记录，所以项目名存在插件自身状态里（`repoNames`），菜单里「重命名」改它、清空即恢复默认（主工作树目录名）。
- **显示名与分支名解耦**：worktree 菜单分「重命名显示名称」与「重命名分支名称」两条。前者只改 DSH Workspace 标题，输入框右侧有重置按钮可一键恢复为当前分支名；后者执行 `git branch -m` 真实改名。显示名一经写入（派生或手改）即与分支独立，之后任何分支改名（插件内或外部 `git checkout`/`branch -m`）都不会再动标题。
- **删除可连带分支**：删除 worktree 工作区时可勾选「同时删除分支」，勾选后执行 `git worktree remove` + `git branch -d`，不留墓碑；目录有未提交改动或分支未合并时先拦截并在对话框内二次确认（`git worktree remove --force` + `git branch -D`）。主工作树的删除入口直接置灰且宿主侧拒绝。
- **复制分支路径**：项目下每个 worktree（含主工作树）的操作菜单提供“复制绝对路径”，复制该工作区的完整绝对目录，不缩写为 `~`，也不替换成项目主目录；普通工作区和会话菜单不受影响。
- **项目分区**：可创建多个界面分区，把完整项目拖入分区；分区支持独立折叠，也可拖动分区标题调整整组顺序。悬停后的操作菜单可重命名或解散。解散只移除界面分区，项目、工作区和会话都不会删除；未分区项目留在底部「项目」区。
- **刷新**：仓库菜单的「刷新」立即重扫该仓库的 worktree 并回读最新快照；日常无需手动——启动、工作区变动、git 文件系统事件与 30 秒轮询都会自动对齐。
- **新会话选择器**：新会话页的工作区菜单同样按「项目 → worktree」分组；项目可独立展开/收起，默认只展开当前工作区所属项目。普通工作区保持单行，添加工作区入口固定在底部。
- **拖动排序**：项目节点、普通工作区行与项目内 worktree 子行都能拖动。项目节点拖动其名下整组工作区；worktree 子行只允许在所属项目内移动。两层顺序都复用 DSH 的同一条持久 Workspace 顺序，卸载插件后仍然成立。
- **最近更新排序**：视图菜单的「最近更新」把排序贯穿三个层级——分区内的项目、项目内的分支、分支内的会话，各按组内最近会话的 `updatedAt` 降序；无会话活动的组沉底。该模式下会冲突的手动排序拖拽自动禁用（跨分区移动、分区排序、会话拖拽仍可用）。
- **分支状态点**：分支行右侧聚合显示组内会话状态，优先级与会话行一致——有待交互（审批/计划评审）> 有会话在跑（含子代理）> 有完成未读 > 不显示。折叠的分组照常显示，用来定位“哪个分支在聊天”。
- **既有会话迁移**：注册某个 worktree 时，cwd 指向该目录的既有会话会被自动挂入这个新工作区（走官方 `attachSession`，cwd 校验由官方保证无法挂错）。因此你过去在没有该工作区时于 worktree 目录里创建、一直躺在"未分组"里的会话，安装后会直接出现在对应的 worktree 下——会话日志不动，只是归属到正确分组。
- **保留既有交互**：客户端最初派生自官方 `@deepseek-ai/dsh-client-ui-workspace` 0.1.6-alpha.2（MIT），现已适配 0.2.2-rc.2 的图标、Remote、定时任务目标和会话导航接口；保留展开/折叠、搜索、会话打开、重命名/删除、fork、归档、拖拽排序、单列表模式。新版官方新增的行操作不会自动进入本插件的替换界面。
- **会话菜单一致**：分组、单列表和搜索结果都提供右侧操作菜单。未发送消息的空白会话可重命名、归档，但不提供无内容可分叉的 fork；命名后的空白会话在切换会话后仍保留显示并可搜索。菜单支持悬停和键盘聚焦。

## 实现方式（遮蔽说明）

本插件以更低优先级（-1）**遮蔽（shadow）**官方 `sidebar.workspaces` 与 `conversation.hero.workspace` 槽位。官方 `ui-workspace` 插件仍正常加载，插件复用它的 `uiWorkspace` 服务和 `useWorkspaces` 数据钩子，只替换左侧栏浏览区和新会话工作区选择器。升级 DSH 后若官方行为变化，需要同步派生新版本。

## 安装 / 卸载对既有数据的影响

安装（`dsh plugin --profile web add …` 或 `--patch` 加载）前，插件只调用官方 `workspaceRegistry.create(path, title)`、`Workspace.attachSession/ setTitle`、`workspaceRegistry.delete(id)` 与 `insertBefore`，不写会话日志、不改会话 cwd、不动归档集合。具体影响：

| 动作 | 对既有数据的影响 |
| --- | --- |
| 安装 | 新增 worktree 工作区记录；既有工作区与会话原样保留。新记录插到各自仓库主工作区之后，其它工作区的相对顺序不变（绝对位置可能后移）。 |
| 迁移 | cwd 指向新注册 worktree 的既有会话被挂入该工作区（原先显示在"未分组"）。会话 id、日志、cwd 都不变。 |
| 改名 | 显示名与分支名完全独立：分支改名后标题保持原样，手动标题也永不被覆盖；「重命名分支名称」只动 git 分支，「重命名显示名称」只动 DSH Workspace 标题。 |
| 删除 | 自动同步只注销已消失的 linked worktree，主工作树永不自动注销；用户明确删除可移除任何工作区（主工作树除外）或整个项目的注册记录，不删除目录或会话日志；勾选「同时删除分支」才会真实移除目录并删除分支。 |
| 卸载 | 插件从 boot graph 移除、RPC 路由 404；所有工作区、会话日志、归属账本全部保留。自动注册的 worktree 工作区成为普通平铺条目（不自动删除，需自行清理或保留）。`~/.dsh/storages/dsh-left-panel.json`（墓碑、项目显示名、worktree 关联）与浏览器里的插件视图状态（分区、折叠状态）残留但完全惰性，可安全删除。工作区顺序不会回滚。 |

**唯一的有损路径**：worktree 目录临时不可见（如外置卷未挂载）超过 5 秒宽限，会被当作"已删除"注销；重新可见时按新工作区注册，其旧会话落回"未分组"且不会自动回来（官方限制：重新添加路径不恢复旧会话分组）。主工作树与普通工作区不受影响。需要更保守时可以把宽限调大或改为"仅 git 枚举不再列出时才注销"。

以上行为在隔离 `DSH_HOME` 中用真实宿主实测过三阶段：装插件前在 worktree 目录建会话（落在未分组）→ 装插件后该会话被挂入 worktree 工作区 → 卸载后工作区、账本、会话日志全部保留。

## 已验证（0.2.2-rc.2，真实宿主）

1. `pnpm typecheck`、`pnpm build`、`pnpm test` 全部通过，73 个测试覆盖同步、普通/主工作树/整项目移除与重新添加、命名空白会话的可见性和搜索、定时任务目录快照的异步生命周期。
2. 依赖与锁文件只解析 `0.2.2-rc.2` / Cordis `4.1.0`，不再残留旧版传递版本；插件管理器按 `engines.dsh` 范围接受当前补丁版本。
3. 隔离 `DSH_HOME` 启动本机 0.2.2-rc.2：插件成功加载，注册主目录自动发现并注册 linked worktree；普通非 git 工作区保持独立。
4. 真实 `git worktree add` / `remove` 后主动同步；新增工作区出现，删除工作树经 5 秒宽限后注销。
5. 仓库/工作树重命名、删除墓碑、恢复注册均通过真实 RPC 验证；worktree 目录保留，注册前创建的会话已进入工作区账本。
6. 插件 RPC 带 cookie 返回 200，无 cookie 返回 401，继续复用官方 `/api` 鉴权。
7. 真实浏览器验证项目 → worktree 左侧分组、分支菜单（含“复制绝对路径”）正常渲染；分组、单列表和搜索列表均无底部遮罩节点。
8. `node demo/dsh.mjs` 自动发现新版 Desktop 启动器，成功启动含两个仓库、五个 worktree 的隔离演示；`Ctrl+C` 后退出码为 0，临时数据已删除。

新版定时任务标记按官方语义读取 Host 的 `schedule/catalog`：只有 `active` 且目标为现有/预留 Session 的任务才标记对应会话，`new` 目标不标记列表行，`paused`、`ended` 也不标记。目录跟随 `schedule/changed` 刷新，切换连接时清空旧 Host 标记。此轮验证了真实 catalog 读取与异步生命周期测试，未创建会实际执行的提醒。

## 安装

```sh
# 本地路径（需要 pnpm）
dsh plugin --profile web add /abs/path/to/left-panel

# 未全局安装 dsh CLI 时
npx @deepseek-ai/dsh@0.2.2-rc.2 plugin --profile web add /abs/path/to/left-panel
```

Desktop 使用 `--profile desktop`。安装或首次加入 bundle 图后重启对应 DSH 实例；client 更新后浏览器硬刷新。没有全局 `dsh` 时，macOS 可使用 Desktop 自带命令：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add /abs/path/to/left-panel --ignore-scripts
```

使用 `--ignore-scripts` 前先在插件目录运行 `pnpm install && pnpm build`。

## 本地开发

```sh
pnpm install
pnpm typecheck && pnpm build && pnpm test
```

启动一套使用临时 `DSH_HOME` 的真实隔离 DSH，并自动创建两个虚构 Git 仓库和 5 个 worktree：

```sh
pnpm demo
```

终端会输出带一次性本地 token 的访问地址。演示使用真实 DSH、真实插件和真实 Git worktree；按 `Ctrl+C` 后会停止服务并删除全部临时数据。macOS 自动发现 `/Applications` 或 `~/Applications` 下 DeepSeek Harness 的 `runtime/cli/bin/dsh` 启动器；其他位置或环境可通过 `DSH_BIN=/path/to/dsh pnpm demo` 指定。`DEMO_PORT` 可指定固定端口。

演示自带一个内置的 mock OpenAI 兼容端点（默认 `127.0.0.1:9701`，`DEMO_MOCK_PORT` 可改）：profile 启动时自动配好 `mock-1k` 模型，会话发出后固定流式返回约 1k 文本、持续数秒——不需要真实 API key 就能看到运行中与完成未读的分支状态点。

`demo/serve.mjs` 是一个稳定 URL 代理：它捕获 dsh 每次启动的一次性 token，cookie-less 访问先 302 到 `?token=`，落 cookie 后 30 天内直达；Host/Origin/Referer 统一改写（含 WebSocket），上游拒绝失效 cookie 时自动重走 token 流程。适合挂在进程后面给演示提供一个不变的入口：`PORT=47010 node demo/serve.mjs`（dsh 上游自动占用 `PORT+1`）。

`--patch` 覆盖层开发（无需安装到 profile）：

```sh
dsh web --patch ./dev.patch.yml
```

`dev.patch.yml` 指向 `lib/index.js`（宿主会读取最近的 package.json 获得两端声明），已加入 `.gitignore`。入口的裸导入由 profile 的 node_modules 解析；若报模块找不到，软链 profile 的包：

```sh
mkdir -p node_modules
ln -s ~/.dsh/profiles/node_modules/@deepseek-ai node_modules/@deepseek-ai
```

## 架构

```
浏览器 client 半                          宿主 host 半
┌─────────────────────────┐   /api RPC    ┌──────────────────────────┐
│ 遮蔽侧栏与新会话选择器     │ ────────────▶ │ WorktreeSyncService       │
│ 项目→worktree→会话 树渲染 │ ◀──────────── │ · git worktree 扫描/监听  │
│ useWorkspaces/useSessions│   全量快照     │ · 同步引擎(注册/注销/改名)  │
└─────────────────────────┘              │ · 墓碑与每仓库开关(持久化)  │
                                         │ workspaceRegistry(官方服务) │
                                         └──────────────────────────┘
```

- **RPC**：宿主在共享 `/api` 通道上注册精确 Fetch 路由（`/api/left-panel/<endpoint>`，Connection RPC 信封），浏览器端继续用 `connection.rpc.call('/api', 'left-panel/<endpoint>')`。鉴权与 Host/Origin 围栏完全复用官方通道，插件零自建鉴权。端点为 `list`、`sync`、`setRepoName`、按项目校验重名的 `setWorkspaceTitle`，以及 worktree 管理的 `branchOptions`、`createWorktree`、`renameBranch` 和带删分支选项的 `deleteWorkspace`。
- **同步引擎**（`src/sync.ts`，纯函数）：决定 create/delete；显示名与分支名解耦，任何改名都不互相覆盖；主工作树不自动删除；移除走 `REMOVAL_GRACE_MS` 宽限防抖。
- **状态**：`~/.dsh/storages/dsh-left-panel.json`（原子写；`DSH_HOME` 可重定位）保存墓碑、项目显示名、已知 worktree 与插件命名记录；项目分区和折叠状态保存在浏览器侧插件视图状态，不修改 DSH Workspace 或 Git。
- **触发**：启动、`domain/changed`（区分插件自删与用户删除）、`fs.watch` 仓库 `.git` 目录（去抖 400ms）、30s 轮询兜底、客户端主动 sync。
- **git 访问**（`src/git.ts`）：固定 argv spawn，环境变量清洗（剔除 `*KEY*/*SECRET*/*TOKEN*/*PASSWORD*`），15s 超时。默认只读；写操作仅 `worktree add`/`remove`、`branch -m`、`branch -d/-D` 四个，全部由用户在对话框里显式触发。

## 边界与限制

- 一个会话仍只属于一个工作区（DSH 领域不变量）；worktree 会话不会计入父仓库工作区，也不会跨 worktree 迁移。
- 官方已知限制：删除工作区注册后重新添加，旧会话不会自动回到该工作区（显示在"未分组"下）。
- 「添加工作区」走宿主原生目录选择器（`uiWorkspace.pickDirectory`）；无选择器环境（远程浏览器访问）降级为手输绝对路径。
- 会话正文搜索（250ms debounce 后的 Host 内容搜索）依赖官方 `session.search` 服务，未起时降级为名称匹配提示。

## 发布前检查表

- [ ] `package.json` 的 `dsh.bundle.patch` 与 `cordis.patch.yml` 一致。
- [ ] `pnpm typecheck && pnpm build && pnpm test` 通过。
- [ ] 真实 `dsh web --patch` 端到端复查：自动注册、双向同步、墓碑、会话创建。
- [ ] 仓库加 topics：`dsh-plugin`、`deepseek-harness`。

## 致谢

客户端浏览器基于 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 `@deepseek-ai/dsh-client-ui-workspace`（MIT，Copyright (c) 2026 DeepSeek）派生，派生文件头部均已标注。
