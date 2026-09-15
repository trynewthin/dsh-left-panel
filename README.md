# dsh-left-panel

DeepSeek Harness（DSH）Web 侧边栏的 git 多工作树（worktree）增强：把左侧边栏的工作区列表重组为**项目（git 仓库，仅分组）→ worktree（真实工作区，可开会话）**的两层结构，并自动跟随 `git worktree` 的增删注册/注销工作区。

- **底层语义不变**：每个 worktree 就是一个真实的 DSH Workspace（会话 cwd = worktree 目录），会话、日志、归档行为与原生完全一致；本插件只做注册/注销与展示分组。
- **自动同步**：向某个 git 仓库的任意工作树添加工作区后，插件扫描 `git worktree list`，把该仓库其余 worktree 自动注册为工作区（以分支名命名，detached 用短 hash，主工作树带「主」标记）；worktree 被移除后自动注销（5 秒宽限，避免抖动）。主工作树永不自动注销。
- **墓碑机制**：你手动删除某个 worktree 的工作区 = 明确的"不要这个"，插件不再自动重建；在仓库菜单/未注册行可恢复。
- **既有会话迁移**：注册某个 worktree 时，cwd 指向该目录的既有会话会被自动挂入这个新工作区（走官方 `attachSession`，cwd 校验由官方保证无法挂错）。因此你过去在没有该工作区时于 worktree 目录里创建、一直躺在"未分组"里的会话，安装后会直接出现在对应的 worktree 下——会话日志不动，只是归属到正确分组。
- **每仓库自动化开关**：可关闭某仓库的自动注册，仅列出 worktree 手动逐个注册。
- **保留原生交互**：本插件的整体替换基于官方 `ui-workspace` 浏览器（派生自 `@deepseek-ai/dsh-client-ui-workspace` 0.1.5-rc.2，MIT），展开/折叠、搜索、会话打开、重命名/删除、fork、归档、拖拽排序、单列表模式等全部保留。

## 实现方式（遮蔽说明）

本插件以更低优先级（-1）**遮蔽（shadow）**官方 `sidebar.workspaces` 槽位。官方 `ui-workspace` 插件仍正常加载——它的 `uiWorkspace` 服务、`useWorkspaces` 数据钩子、会话选择器等都由本插件复用，仅左侧栏浏览区由本插件的派生版本渲染。升级 DSH 后若官方浏览器行为变化，需要同步派生新版本。

## 安装 / 卸载对既有数据的影响

安装（`dsh plugin --profile web add …` 或 `--patch` 加载）前，插件只调用官方 `workspaceRegistry.create(path, title)`、`Workspace.attachSession/ setTitle`、`workspaceRegistry.delete(id)` 与 `insertBefore`，不写会话日志、不改会话 cwd、不动归档集合。具体影响：

| 动作 | 对既有数据的影响 |
| --- | --- |
| 安装 | 新增 worktree 工作区记录；既有工作区与会话原样保留。新记录插到各自仓库主工作区之后，其它工作区的相对顺序不变（绝对位置可能后移）。 |
| 迁移 | cwd 指向新注册 worktree 的既有会话被挂入该工作区（原先显示在"未分组"）。会话 id、日志、cwd 都不变。 |
| 改名 | 仅在"该工作区标题仍等于插件当初写入的分支名"且分支确实变了时跟随改名；你手动改过的标题永不被覆盖。 |
| 删除 | 仅注销插件自己注册、且已消失的 worktree 工作区；主工作树永不自动注销。 |
| 卸载 | 插件从 boot graph 移除、RPC 路由 404；所有工作区、会话日志、归属账本全部保留。自动注册的 worktree 工作区成为普通平铺条目（不自动删除，需自行清理或保留）。`~/.dsh/storages/dsh-left-panel.json`（墓碑与每仓库开关）残留但完全惰性，可安全删除。工作区顺序不会回滚。 |

**唯一的有损路径**：worktree 目录临时不可见（如外置卷未挂载）超过 5 秒宽限，会被当作"已删除"注销；重新可见时按新工作区注册，其旧会话落回"未分组"且不会自动回来（官方限制：重新添加路径不恢复旧会话分组）。主工作树与普通工作区不受影响。需要更保守时可以把宽限调大或改为"仅 git 枚举不再列出时才注销"。

以上行为在隔离 `DSH_HOME` 中用真实宿主实测过三阶段：装插件前在 worktree 目录建会话（落在未分组）→ 装插件后该会话被挂入 worktree 工作区 → 卸载后工作区、账本、会话日志全部保留。

## 已验证（0.1.5-rc.2，真实宿主）

1. `pnpm typecheck`、`pnpm build`、`pnpm test`（36 个测试：porcelain 解析、同步决策含宽限期/墓碑/主树保护、状态持久化、真实 git 仓库驱动的服务集成（含既有会话迁移）、客户端层级折叠、构建产物冒烟）全部通过。
2. 隔离 `DSH_HOME` 启动真实 `dsh web`，通过官方 RPC 添加仓库主目录：两个 linked worktree 在数秒内被自动注册，以分支名命名，紧跟主工作区排序。
3. `git worktree add`/`remove` 实时联动（fs.watch + 轮询兜底）；目录消失与 git 枚举消失都走宽限注销。
4. 手动删除 worktree 工作区 → 写入墓碑不再自动重建；`unignore` 后立即恢复。
5. 非 git 目录保持原生单行展示，不受影响。
6. 插件路由带 cookie 200 / 无 cookie 401（复用官方 `/api` 信任围栏）；client bundle 被宿主组合进 boot graph 并正确下发。
7. 三阶段数据影响实测：装插件前在 worktree 目录建的会话 → 装插件后自动挂入对应 worktree 工作区 → 卸载后工作区/账本/会话日志全部保留。

## 安装

```sh
# 本地路径（需要 pnpm）
dsh plugin --profile web add /Users/anzelin/Projects/Personal/Deepseek/left-panel

# 未全局安装 dsh CLI 时
npx @deepseek-ai/dsh plugin --profile web add /Users/anzelin/Projects/Personal/Deepseek/left-panel
```

安装或首次加入 bundle 图后重启 `dsh web`；client 更新后浏览器硬刷新。

## 本地开发

```sh
pnpm install
pnpm typecheck && pnpm build && pnpm test
```

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
│ 遮蔽 sidebar.workspaces  │ ────────────▶ │ WorktreeSyncService       │
│ 项目→worktree→会话 树渲染 │ ◀──────────── │ · git worktree 扫描/监听  │
│ useWorkspaces/useSessions│   全量快照     │ · 同步引擎(注册/注销/改名)  │
└─────────────────────────┘              │ · 墓碑与每仓库开关(持久化)  │
                                         │ workspaceRegistry(官方服务) │
                                         └──────────────────────────┘
```

- **RPC**：宿主在共享 `/api` 通道上注册精确 Fetch 路由（`/api/left-panel/<endpoint>`，Connection RPC 信封），浏览器端继续用 `connection.rpc.call('/api', 'left-panel/<endpoint>')`。鉴权与 Host/Origin 围栏完全复用官方通道，插件零自建鉴权。端点：`list` / `sync` / `ignore` / `unignore` / `register` / `setRepoAuto`，入参强校验（仅接受本插件枚举出的 worktree 路径）。
- **同步引擎**（`src/sync.ts`，纯函数）：决定 create/delete/retitle；分支切换会跟随改名，用户手工改名后不再覆盖；主工作树不自动删除；移除走 `REMOVAL_GRACE_MS` 宽限防抖。
- **状态**：`~/.dsh/storages/dsh-left-panel.json`（原子写；`DSH_HOME` 可重定位），存墓碑、每仓库开关、已知 worktree 与插件命名记录。
- **触发**：启动、`domain/changed`（区分插件自删与用户删除）、`fs.watch` 仓库 `.git` 目录（去抖 400ms）、30s 轮询兜底、客户端主动 sync。
- **git 访问**（`src/git.ts`）：固定 argv spawn，环境变量清洗（剔除 `*KEY*/*SECRET*/*TOKEN*/*PASSWORD*`），15s 超时，只读命令。

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
