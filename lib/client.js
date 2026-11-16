window.__ModuleLoader__.load({
	id: "dsh-left-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region src/client/workspace-picker-tree.ts
		/** Fold the durable Workspace order into project headings and their worktrees. */
		function workspacePickerEntries(workspaces, snapshot) {
			const repoByKey = new Map(snapshot.repos.map((repo) => [repo.key, repo]));
			const emitted = /* @__PURE__ */ new Set();
			const entries = [];
			for (const workspace of workspaces) {
				const repoKey = snapshot.workspaceRepo[workspace.workspaceId];
				const repo = repoKey === void 0 ? void 0 : repoByKey.get(repoKey);
				if (repo === void 0) {
					entries.push({
						kind: "workspace",
						workspace,
						nested: false
					});
					continue;
				}
				if (emitted.has(repoKey)) continue;
				emitted.add(repoKey);
				entries.push({
					kind: "project",
					id: `repo:${repoKey}`,
					name: repo.name
				});
				for (const member of workspaces) if (snapshot.workspaceRepo[member.workspaceId] === repoKey) entries.push({
					kind: "workspace",
					workspace: member,
					nested: true
				});
			}
			return entries;
		}
		/** Keep project headings while hiding nested worktrees of folded projects. */
		function visibleWorkspacePickerEntries(entries, expandedProjectIds) {
			let projectExpanded = true;
			const visible = [];
			for (const entry of entries) {
				if (entry.kind === "project") {
					projectExpanded = expandedProjectIds.has(entry.id);
					visible.push(entry);
					continue;
				}
				if (!entry.nested || projectExpanded) visible.push(entry);
			}
			return visible;
		}
		//#endregion
		//#region \0dsh-css:/home/ubuntu/repos/dsh-left-panel/src/client/GroupedWorkspacePicker.module.css.mjs
		const css$2 = ".zhmWLa_nestedLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.zhmWLa_projectLabel{align-items:center;width:100%;min-width:0;font-weight:600;display:flex}.zhmWLa_projectName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.zhmWLa_projectArrow,.zhmWLa_projectArrowExpanded{color:var(--dsw-alias-label-tertiary);transition:transform .15s var(--ds-ease-in-out);flex:none;margin-left:6px}.zhmWLa_projectArrowExpanded{transform:rotate(90deg)}.zhmWLa_modalAction{min-width:72px}.zhmWLa_modalError{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}";
		const tagId$2 = "dsh-left-panel/GroupedWorkspacePicker.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-left-panel";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var GroupedWorkspacePicker_module_css_default = {
			"modalAction": "zhmWLa_modalAction",
			"modalError": "zhmWLa_modalError",
			"nestedLabel": "zhmWLa_nestedLabel",
			"projectArrow": "zhmWLa_projectArrow",
			"projectArrowExpanded": "zhmWLa_projectArrowExpanded",
			"projectLabel": "zhmWLa_projectLabel",
			"projectName": "zhmWLa_projectName"
		};
		//#endregion
		//#region src/client/GroupedWorkspacePicker.tsx
		const ADD_WORKSPACE = "::add-workspace";
		const TOGGLE_PROJECT = "::toggle-project:";
		/** Repository-aware replacement for the New Session Workspace picker. */
		function GroupedWorkspacePicker({ open, anchorRef, useWorkspaces, useWorktrees, selectedId, onPick, onClose, createWorkspace, pickDirectory, t }) {
			const workspaces = useWorkspaces((state) => state).items;
			const snapshot = useWorktrees((state) => state);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [expandedProjects, setExpandedProjects] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const allEntries = workspacePickerEntries(workspaces, snapshot);
			const selectedRepoKey = selectedId === void 0 ? void 0 : snapshot.workspaceRepo[selectedId];
			const selectedProjectId = selectedRepoKey === void 0 ? void 0 : `repo:${selectedRepoKey}`;
			(0, react.useEffect)(() => {
				if (!open || selectedProjectId === void 0) return;
				setExpandedProjects((current) => {
					if (current.has(selectedProjectId)) return current;
					return /* @__PURE__ */ new Set([...current, selectedProjectId]);
				});
			}, [open, selectedProjectId]);
			const visibleEntries = visibleWorkspacePickerEntries(allEntries, expandedProjects);
			const entries = snapshot.syncedAt === 0 ? [{
				type: "label",
				id: "::loading",
				text: t("picker.loading")
			}] : visibleEntries.map((entry) => {
				if (entry.kind === "project") {
					const expanded = expandedProjects.has(entry.id);
					return {
						id: `${TOGGLE_PROJECT}${entry.id}`,
						label: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: GroupedWorkspacePicker_module_css_default.projectLabel,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: GroupedWorkspacePicker_module_css_default.projectName,
								children: entry.name
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: expanded ? GroupedWorkspacePicker_module_css_default.projectArrowExpanded : GroupedWorkspacePicker_module_css_default.projectArrow })]
						})
					};
				}
				return {
					id: entry.workspace.workspaceId,
					label: entry.nested ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: GroupedWorkspacePicker_module_css_default.nestedLabel,
						children: entry.workspace.title
					}) : entry.workspace.title,
					icon: entry.nested ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular, { size: 16 }),
					disabled: busy
				};
			});
			const addEntries = [{
				id: ADD_WORKSPACE,
				label: t("picker.addWorkspace"),
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutlineRegular, { size: 16 }),
				disabled: busy
			}];
			const chooseDirectory = () => {
				onClose();
				setBusy(true);
				setError(null);
				pickDirectory().then((path) => {
					if (path === null) return void 0;
					return createWorkspace({ path }).then((workspace) => {
						onPick(workspace.workspaceId);
					});
				}).catch((reason) => {
					setError(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					setBusy(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				anchor: null,
				items: entries.length === 0 ? addEntries : entries,
				...entries.length === 0 ? {} : { footer: addEntries },
				selectedId,
				onSelect: (id) => {
					if (id.startsWith(TOGGLE_PROJECT)) {
						const projectId = id.slice(17);
						setExpandedProjects((current) => {
							const next = new Set(current);
							if (next.has(projectId)) next.delete(projectId);
							else next.add(projectId);
							return next;
						});
					} else if (id === ADD_WORKSPACE) chooseDirectory();
					else onPick(id);
				},
				onClose,
				side: "bottom",
				portal: true,
				anchorRef
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: error !== null,
				onClose: () => {
					setError(null);
				},
				closeLabel: t("close"),
				title: t("folderError.title"),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					className: GroupedWorkspacePicker_module_css_default.modalAction,
					onClick: () => {
						setError(null);
					},
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					className: GroupedWorkspacePicker_module_css_default.modalAction,
					onClick: chooseDirectory,
					children: t("folderError.retry")
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: GroupedWorkspacePicker_module_css_default.modalError,
					role: "alert",
					children: error
				})
			})] });
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.6-alpha.2 (MIT License,
		* Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
		* group their worktrees and Workspace registration follows git.
		*/
		/**
		* `left-panel` namespace dictionaries: the browsing region (section header,
		* search, tree rows, dialogs), the add flow, and the repository/worktree rows.
		* Runtime failure messages (wire error strings) pass through untranslated by
		* policy. "worktree" stays untranslated per the DSH terminology glossary.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "left-panel";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"group.ungrouped": "未分组",
			"session.new": "新会话",
			"section.workspaces": "工作区",
			"section.sessions": "会话",
			"viewOptions.label": "视图选项",
			"groupBy.label": "分组方式",
			"groupBy.workspace": "按工作区",
			"groupBy.flat": "单列表",
			"orderBy.label": "排序方式",
			"orderBy.manual": "手动排序",
			"orderBy.updated": "最近更新",
			"viewOptions.activeSessions": "显示活跃会话",
			"viewOptions.treeGuides": "项目树状展示",
			"activeSessions.label": "活跃会话",
			"sessions.expand": "展开其余 {n} 个会话",
			"sessions.collapse": "收起",
			"empty.none": "暂无会话",
			"workspace.add": "添加工作区",
			"picker.addWorkspace": "添加工作区…",
			"picker.loading": "正在加载工作区…",
			"search.sessions.aria": "搜索会话",
			"search.placeholder": "搜索会话…",
			"search.clear": "清除搜索",
			"search.results.aria": "搜索结果",
			"search.pending": "正在搜索会话历史…",
			"search.unavailable": "内容搜索暂不可用，仅显示名称匹配。",
			"search.noMatches": "无匹配会话",
			"search.hasMore": "仅显示前 {n} 条结果，请缩小搜索范围。",
			"conflict.named": "已存在名为“{name}”的工作区。",
			"folderError.title": "无法打开文件夹",
			"folderError.retry": "重新选择",
			"rename": "重命名",
			"rename.workspace.title": "重命名工作区",
			"rename.session.title": "重命名会话",
			"field.workspaceName": "工作区名称",
			"field.sessionName": "会话名称",
			"delete.workspace": "删除工作区",
			"delete.workspace.main": "仓库主工作树不能删除",
			"worktree.rename.reset": "恢复为分支名",
			"delete.desc": "将移除“{name}”的工作区记录，目录、Git 分支和已有会话均保留。需要时可通过“添加工作区”重新加入；项目仍存在时也可从“已移除的工作区”恢复。",
			"delete.pending": "正在删除工作区记录…",
			"delete.workspace.branch": "同时删除分支“{branch}”",
			"delete.unsafe": "该工作树包含未提交的更改或未合并的提交，删除后将无法恢复。",
			"delete.confirm.force": "仍然删除",
			"delete.repository": "移除项目",
			"delete.repository.desc": "将移除项目“{name}”下所有工作区记录，并停止自动注册它们。项目目录、Git 分支和已有会话均保留；需要时可通过“添加工作区”重新加入。",
			"menu.fork": "分叉会话",
			"menu.archiveSession": "归档会话",
			"menu.copyAbsolutePath": "复制绝对路径",
			"sessions.count.one": "{n} 个会话",
			"sessions.count.other": "{n} 个会话",
			"actions.workspace.aria": "工作区“{name}”的操作",
			"actions.session.aria": "会话“{name}”的操作",
			"actions.newSession.aria": "在“{name}”中新建会话",
			"status.running": "进行中",
			"status.subagentsRunning.one": "{n} 个子代理运行中",
			"status.subagentsRunning.other": "{n} 个子代理运行中",
			"status.idle": "空闲",
			"status.waitingApproval": "等待审批",
			"status.planReview": "计划待审",
			"status.waitingAnswer": "等待回答",
			"status.completed": "已完成",
			"schedule.active": "有活动定时任务",
			"hover.created": "创建于 {time}",
			"hover.copied": "已复制",
			"date.ymd": "{y}年{m}月{d}日",
			"time.now": "刚刚",
			"time.minutes": "{n}分钟",
			"time.hours": "{n}小时",
			"time.days": "{n}天",
			"time.months": "{n}个月",
			"time.years": "{n}年",
			"time.ago": "{t}前",
			"repo.menu.refresh": "刷新",
			"repo.menu.deletedBranches": "已移除的工作区",
			"repo.menu.newWorktree": "新建 worktree",
			"worktree.rename.display": "重命名显示名称",
			"worktree.rename.branch": "重命名分支名称",
			"worktree.rename.branch.aria": "分支名称",
			"worktree.create.title": "新建 worktree",
			"worktree.create.branch": "分支",
			"worktree.create.branches.aria": "选择已有分支",
			"worktree.create.branches.empty": "没有尚未检出的分支",
			"worktree.create.parents.empty": "没有其他同级目录",
			"worktree.create.footer.hint": "输入或者快速选择",
			"worktree.create.base": "新分支将基于 {base}。",
			"worktree.create.path": "位置",
			"worktree.create.parents.aria": "选择同级目录",
			"worktree.create.pending": "正在创建 worktree…",
			"worktree.create.confirm": "创建",
			"repo.rename.title": "重命名项目",
			"repo.rename.hint": "只改侧栏里这个项目的显示名，留空恢复默认（主工作树目录名）。名称保存在插件自身状态里，卸载插件即消失。",
			"field.repoName": "项目名称",
			"repo.actions.aria": "仓库“{name}”的操作",
			"repo.hover.error": "扫描失败：{message}",
			"area.add": "新建分区",
			"area.default": "项目",
			"area.create.title": "新建项目分区",
			"area.rename.title": "重命名分区",
			"area.dissolve": "解散分区",
			"area.edit.aria": "编辑分区“{name}”",
			"area.dissolve.aria": "解散分区“{name}”",
			"area.actions.aria": "分区“{name}”的操作",
			"area.drop": "拖到此处分区",
			"field.areaName": "分区名称",
			"add.path.desc": "当前环境没有可用的目录选择器，请输入目录的绝对路径。",
			"field.workspacePath": "目录路径",
			"add.confirm": "添加"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"group.ungrouped": "Ungrouped",
			"session.new": "New Session",
			"section.workspaces": "Workspaces",
			"section.sessions": "Sessions",
			"viewOptions.label": "View options",
			"groupBy.label": "Group by",
			"groupBy.workspace": "WorkSpace",
			"groupBy.flat": "In one list",
			"orderBy.label": "Order by",
			"orderBy.manual": "Manual",
			"orderBy.updated": "Last updated",
			"viewOptions.activeSessions": "Show active sessions",
			"viewOptions.treeGuides": "Project tree guides",
			"activeSessions.label": "Active sessions",
			"sessions.expand": "Show {n} more sessions",
			"sessions.collapse": "Show less",
			"empty.none": "No sessions yet",
			"workspace.add": "Add workspace",
			"picker.addWorkspace": "Add workspace…",
			"picker.loading": "Loading workspaces…",
			"search.sessions.aria": "Search sessions",
			"search.placeholder": "Search sessions...",
			"search.clear": "Clear search",
			"search.results.aria": "Search results",
			"search.pending": "Searching session history…",
			"search.unavailable": "Content search is temporarily unavailable. Showing name matches.",
			"search.noMatches": "No matching sessions",
			"search.hasMore": "Showing the first {n} results. Narrow your search.",
			"conflict.named": "A workspace named “{name}” already exists.",
			"folderError.title": "Couldn’t open folder",
			"folderError.retry": "Choose again",
			"rename": "Rename",
			"rename.workspace.title": "Rename workspace",
			"rename.session.title": "Rename session",
			"field.workspaceName": "Workspace name",
			"field.sessionName": "Session name",
			"delete.workspace": "Delete workspace",
			"delete.workspace.main": "The repository main worktree cannot be deleted",
			"worktree.rename.reset": "Reset to branch name",
			"delete.desc": "Remove the Workspace record for “{name}”. Its directory, Git branch and existing sessions are kept. Use Add workspace to bring it back, or Removed workspaces while the project remains.",
			"delete.pending": "Deleting workspace record…",
			"delete.workspace.branch": "Also delete the branch “{branch}”",
			"delete.unsafe": "This worktree has uncommitted changes or unmerged commits; deleting it cannot be undone.",
			"delete.confirm.force": "Delete anyway",
			"delete.repository": "Remove project",
			"delete.repository.desc": "Remove every Workspace record under “{name}” and stop registering them automatically. Directories, Git branches and existing sessions are kept. Use Add workspace to bring the project back.",
			"menu.fork": "Fork session",
			"menu.archiveSession": "Archive session",
			"menu.copyAbsolutePath": "Copy absolute path",
			"sessions.count.one": "{n} session",
			"sessions.count.other": "{n} sessions",
			"actions.workspace.aria": "Workspace actions for {name}",
			"actions.session.aria": "Session actions for {name}",
			"actions.newSession.aria": "New session in {name}",
			"status.running": "Running",
			"status.subagentsRunning.one": "{n} subagent running",
			"status.subagentsRunning.other": "{n} subagents running",
			"status.idle": "Idle",
			"status.waitingApproval": "Waiting for approval",
			"status.planReview": "Plan awaiting review",
			"status.waitingAnswer": "Waiting for answer",
			"status.completed": "Completed",
			"schedule.active": "Has active scheduled task",
			"hover.created": "Created {time}",
			"hover.copied": "Copied",
			"date.ymd": "{y}-{m}-{d}",
			"time.now": "now",
			"time.minutes": "{n}min",
			"time.hours": "{n}h",
			"time.days": "{n}d",
			"time.months": "{n}mo",
			"time.years": "{n}y",
			"time.ago": "{t} ago",
			"repo.menu.refresh": "Refresh",
			"repo.menu.deletedBranches": "Removed workspaces",
			"repo.menu.newWorktree": "New worktree",
			"worktree.rename.display": "Rename display name",
			"worktree.rename.branch": "Rename branch",
			"worktree.rename.branch.aria": "Branch name",
			"worktree.create.title": "New worktree",
			"worktree.create.branch": "Branch",
			"worktree.create.branches.aria": "Choose an existing branch",
			"worktree.create.branches.empty": "No unchecked-out branches",
			"worktree.create.parents.empty": "No other sibling directories",
			"worktree.create.footer.hint": "Type or quick-pick",
			"worktree.create.base": "The new branch will start from {base}.",
			"worktree.create.path": "Location",
			"worktree.create.parents.aria": "Choose a sibling directory",
			"worktree.create.pending": "Creating worktree…",
			"worktree.create.confirm": "Create",
			"repo.rename.title": "Rename project",
			"repo.rename.hint": "Changes only this project’s name in the sidebar. Leave empty to restore the default (the main worktree directory name). The name lives in the plugin’s own state and disappears with the plugin.",
			"field.repoName": "Project name",
			"repo.actions.aria": "Repository actions for {name}",
			"repo.hover.error": "Scan failed: {message}",
			"area.add": "New section",
			"area.default": "Projects",
			"area.create.title": "New project section",
			"area.rename.title": "Rename section",
			"area.dissolve": "Dissolve section",
			"area.edit.aria": "Edit section “{name}”",
			"area.dissolve.aria": "Dissolve section “{name}”",
			"area.actions.aria": "Section actions for “{name}”",
			"area.drop": "Move to this section",
			"field.areaName": "Section name",
			"add.path.desc": "No directory picker is available here. Enter the absolute path of the directory.",
			"field.workspacePath": "Directory path",
			"add.confirm": "Add"
		};
		//#endregion
		//#region node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region node_modules/.pnpm/@deepseek-ai+dsh-util-workspace-path@0.2.2-rc.2_@deepseek-ai+cordis@4.1.0/node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
		/**
		* Browser-safe Workspace path and display helpers.
		* @module @deepseek-ai/dsh-util-workspace-path
		*/
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Abbreviate a POSIX home directory for display.
		* @param path - Absolute or already-short display path.
		* @param home - Host account home; absent skips abbreviation.
		* @returns `~` or `~/…` for the POSIX home and its descendants, otherwise `path`.
		*/
		function abbreviateHomePath(path, home) {
			if (home === void 0 || home === "") return path;
			if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
			const root = home.replace(/\/+$/, "");
			if (root === "" || root === "/") return path;
			if (path.replace(/\/+$/, "") === root) return "~";
			if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
			return path;
		}
		/**
		* Read the final non-empty segment of a Workspace path for display.
		* Workspace-label surfaces use this helper instead of deriving another basename.
		* @param path - Workspace directory path using POSIX or Windows separators.
		* @returns the final segment, or an empty string for a separator-only path.
		*/
		function workspaceTitleOf(path) {
			const trimmed = path.replace(/[/\\]+$/, "");
			const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return trimmed.slice(separator + 1);
		}
		//#endregion
		//#region src/client/subagent-lineage.ts
		/**
		* Index uninterrupted subagent descendants under each ancestor.
		* @param summaries - Session summaries keyed by id.
		* @returns descendant totals keyed by possible parent id.
		*/
		function indexSubagentDescendants(summaries) {
			const indexed = /* @__PURE__ */ new Map();
			for (const descendant of Object.values(summaries)) {
				if (descendant.origin !== "subagent") continue;
				const seen = /* @__PURE__ */ new Set();
				let current = descendant;
				while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
					seen.add(current.id);
					const aggregate = indexed.get(current.parentId);
					if (aggregate === void 0) indexed.set(current.parentId, {
						count: 1,
						runningCount: descendant.running ? 1 : 0
					});
					else {
						aggregate.count += 1;
						if (descendant.running) aggregate.runningCount += 1;
					}
					current = summaries[current.parentId];
				}
			}
			return indexed;
		}
		/** Prefix of the viewing-store expansion key that tracks one repository node. */
		const REPO_KEY_PREFIX = "repo:";
		/** Expansion key of a repository node in the viewing store. */
		function repoGroupKey(repoKey) {
			return REPO_KEY_PREFIX + repoKey;
		}
		/**
		* Resolve the Workspace browser group that owns one Session.
		* @param workspaces - authoritative Workspace membership.
		* @param sessionId - Session whose browser group is required.
		* @returns owning Workspace id, or {@link UNGROUPED_KEY} when no Workspace accounts for it.
		*/
		function owningGroupKey(workspaces, sessionId) {
			return workspaces.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId ?? "";
		}
		/** Session selected by the main view in the 0.1.6 retention-based model. */
		function mainSessionId(list) {
			return Object.values(list.byId).find((session) => (session.retainedBy.mainView ?? 0) > 0)?.id;
		}
		/**
		* Directory display label: basename of the path (both separators accepted).
		* Ungrouped-bucket fallback for surfaces without a workspace title.
		* @param cwd - directory path, or undefined for the ungrouped bucket.
		* @returns basename, the raw cwd when it has no basename, or an empty ungrouped marker.
		*/
		function workspaceLabel(cwd) {
			if (cwd === void 0 || cwd === "") return "";
			const base = workspaceTitleOf(cwd);
			return base !== "" ? base : cwd;
		}
		/** Recency comparator: newest first, id as the deterministic tiebreak (ids are unique per group). */
		function byRecency(a, b) {
			if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
			return a.id < b.id ? -1 : 1;
		}
		/**
		* Ordinary sessions are visible; among blank sessions, the current one and
		* any explicitly named blank stay visible (a rename is a durable user label,
		* so hiding it on selection change would lose the row). Subagent children use
		* their parent header catalog; archived sessions are visible nowhere, while
		* their accounting slots remain so unarchiving restores position.
		*/
		function sessionVisible(session, current, archived) {
			return session.origin !== "subagent" && !archived.has(session.id) && (!session.blank || session.id === current || isNamedBlank(session));
		}
		/**
		* A blank session is the selected Workspace's provisional New Session row and
		* its renderer label is localized, so only a user-assigned title is exposed;
		* unnamed blank rows keep the empty title.
		*/
		function sessionTitle(session) {
			if (!session.blank) return session.displayTitle;
			return session.title?.trim() ?? "";
		}
		/** A blank Session owns a durable user-assigned title (rename before the first prompt). */
		function isNamedBlank(session) {
			return session.blank && sessionTitle(session) !== "";
		}
		/**
		* Project the Host reminder catalog onto the Sessions that receive an active
		* task. A `new` target creates its own Session at delivery time, so it marks
		* no catalogued row; `session` and reserved `new_once` targets mark theirs.
		* @param entries - the whole Host reminder catalog.
		* @returns the Session ids with at least one active delivery.
		*/
		function activeScheduleSessionIds(entries) {
			const active = /* @__PURE__ */ new Set();
			for (const entry of entries) {
				if (entry.status !== "active" || entry.target.kind === "new") continue;
				active.add(entry.target.sessionId);
			}
			return active;
		}
		/** Build one group without projecting session lineage into presentation. */
		function buildGroup(key, workspaceId, cwd, createdAt, label, members, order) {
			const sessions = [...members];
			if (order === "recency") sessions.sort(byRecency);
			return {
				key,
				workspaceId,
				cwd,
				createdAt,
				label,
				sessions
			};
		}
		/** Apply a stored Ungrouped order and append newly loose Sessions by recency. */
		function orderedUngrouped(members, stored) {
			const byId = new Map(members.map((session) => [session.id, session]));
			const included = /* @__PURE__ */ new Set();
			const ordered = [];
			for (const key of stored) {
				const session = byId.get(key);
				if (session === void 0 || included.has(key)) continue;
				ordered.push(session);
				included.add(key);
			}
			for (const session of [...members].sort(byRecency)) {
				if (included.has(session.id)) continue;
				ordered.push(session);
			}
			return ordered;
		}
		/**
		* Group Sessions by Host Workspace: one group per entity in stable Host
		* order, with members resolved from sessionIds in their stored order. Sessions
		* outside every Workspace trail in the browser-local Ungrouped order, which
		* falls back to recency before that order is initialized.
		*/
		function groupByWorkspace(list, workspaces, archived, ungroupedOrder) {
			const current = mainSessionId(list);
			const groups = [];
			const accounted = /* @__PURE__ */ new Set();
			for (const workspace of workspaces) {
				const members = [];
				for (const id of workspace.sessionIds) {
					const summary = list.byId[id];
					if (summary === void 0) continue;
					accounted.add(id);
					if (!sessionVisible(summary, current, archived)) continue;
					members.push(summary);
				}
				groups.push(buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account"));
			}
			const stray = list.ids.map((id) => list.byId[id]).filter((s) => s !== void 0 && !accounted.has(s.id) && sessionVisible(s, current, archived));
			if (stray.length > 0) groups.push(buildGroup("", void 0, void 0, void 0, "", ungroupedOrder === void 0 ? stray : orderedUngrouped(stray, ungroupedOrder), ungroupedOrder === void 0 ? "recency" : "account"));
			return groups;
		}
		/** Keep navigation presentation independent from domain-owned interaction objects. */
		function visiblePendingKind(kind) {
			switch (kind) {
				case "approval":
				case "plan-review":
				case "question": return kind;
				default: return;
			}
		}
		function sessionNode(s, descendants, statuses, activeSchedules) {
			const status = statuses.get(s.id);
			const pendingInteraction = visiblePendingKind(status?.pendingInteraction?.kind);
			return {
				id: s.id,
				title: sessionTitle(s),
				blank: s.blank,
				running: status?.running ?? s.running,
				runningSubagentCount: descendants.get(s.id)?.runningCount ?? 0,
				completed: status?.completionUnread === true,
				hasActiveSchedule: activeSchedules.has(s.id),
				updatedAt: s.updatedAt,
				...pendingInteraction === void 0 ? {} : { pendingInteraction }
			};
		}
		/**
		* Derive the workspace browser groups with every session as a top-level row.
		*
		* Every group shows; sessions populate under expanded groups in the selected
		* local order. Unnamed blank sessions are excluded except for the selected
		* provisional New Session row, while renamed blank sessions stay visible;
		* archived sessions are excluded everywhere.
		* Content search lives outside this derivation
		* (see {@link deriveSearchResults}).
		* @param list - sessions list snapshot (`current` feeds containsCurrent).
		* @param workspaces - real workspaces in stable Host order.
		* @param archivedSessionIds - registry-global archive set.
		* @param statuses - unified UI status by Session.
		* @param activeSchedules - Sessions whose Host reminder catalog entry is active.
		* @param view - local expansion arrays.
		* @returns group sections in render order.
		*/
		function deriveGroups(list, workspaces, archivedSessionIds, statuses, activeSchedules, view) {
			const archived = new Set(archivedSessionIds);
			const expandedGroups = new Set(view.expandedGroups);
			const descendants = indexSubagentDescendants(list.byId);
			const current = mainSessionId(list);
			const currentGroup = current === void 0 ? void 0 : owningGroupKey(workspaces, current);
			const groups = [];
			for (const g of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder)) {
				const expanded = expandedGroups.has(g.key);
				let running = false;
				let completedUnread = false;
				let pendingInteraction = false;
				for (const member of g.sessions) {
					const status = statuses.get(member.id);
					if (visiblePendingKind(status?.pendingInteraction?.kind) !== void 0) pendingInteraction = true;
					if ((status?.running ?? member.running) || (descendants.get(member.id)?.runningCount ?? 0) > 0) running = true;
					if (status?.completionUnread === true) completedUnread = true;
				}
				groups.push({
					key: g.key,
					workspaceId: g.workspaceId,
					cwd: g.cwd,
					createdAt: g.createdAt,
					label: g.label,
					sessionCount: g.sessions.length,
					expanded,
					containsCurrent: g.key === currentGroup,
					running,
					completedUnread,
					pendingInteraction,
					sessions: expanded ? g.sessions.map((session) => sessionNode(session, descendants, statuses, activeSchedules)) : []
				});
			}
			return groups;
		}
		/**
		* Derive the flat session list ("In one list" mode): every session — fork
		* children included — as a top-level row, strictly newest-first. No grouping,
		* no parent/child adjacency. Content search lives outside this derivation
		* (see {@link deriveSearchResults}).
		* @param list - sessions list snapshot.
		* @param archivedSessionIds - registry-global archive set.
		* @param statuses - unified UI status by Session.
		* @param activeSchedules - Sessions whose Host reminder catalog entry is active.
		* @returns flat rows in render order.
		*/
		function deriveFlat(list, archivedSessionIds, statuses, activeSchedules) {
			const archived = new Set(archivedSessionIds);
			const current = mainSessionId(list);
			const descendants = indexSubagentDescendants(list.byId);
			const rows = [];
			for (const id of list.ids) {
				const s = list.byId[id];
				if (s === void 0 || !sessionVisible(s, current, archived)) continue;
				rows.push(s);
			}
			rows.sort(byRecency);
			return rows.map((session) => sessionNode(session, descendants, statuses, activeSchedules));
		}
		/**
		* Derive the pinned "active sessions" list: every visible Session that is
		* running itself or through a descendant subagent, awaits user interaction,
		* or finished while unopened. Newest-first, independent of group expansion,
		* so a session stays locatable even inside a folded Workspace. Opening an
		* entry clears its unread-completion flag and drops it from the list when it
		* has no other signal; running entries stay until activity ends.
		* @param list - sessions list snapshot.
		* @param archivedSessionIds - registry-global archive set.
		* @param statuses - unified UI status by Session.
		* @param activeSchedules - Sessions whose Host reminder catalog entry is active.
		* @returns active rows in render order.
		*/
		function deriveActive(list, archivedSessionIds, statuses, activeSchedules) {
			const archived = new Set(archivedSessionIds);
			const current = mainSessionId(list);
			const descendants = indexSubagentDescendants(list.byId);
			const rows = [];
			for (const id of list.ids) {
				const s = list.byId[id];
				if (s === void 0 || !sessionVisible(s, current, archived)) continue;
				rows.push(s);
			}
			rows.sort(byRecency);
			return rows.map((session) => sessionNode(session, descendants, statuses, activeSchedules)).filter((node) => node.pendingInteraction !== void 0 || node.running || node.runningSubagentCount > 0 || node.completed);
		}
		/**
		* Merge immediate title/Workspace substring matches with ranked Host content
		* matches. Local rows lead newest-first, content-only rows retain backend
		* order, and duplicate sessions receive the backend snippet in place.
		* @param list - session metadata authority.
		* @param workspaces - Workspace membership and display labels.
		* @param query - caller text; surrounding whitespace is ignored.
		* @param archivedSessionIds - registry-global archive set (members never match).
		* @param statuses - unified UI status by Session.
		* @param activeSchedules - Sessions whose Host reminder catalog entry is active.
		* @param content - ranked Host content-search page.
		* @param limit - protocol-owned maximum merged row count.
		* @returns bounded deduplicated flat rows and a refine-query hint bit.
		*/
		function deriveSearchResults(list, workspaces, query, archivedSessionIds, statuses, activeSchedules, content, limit) {
			const q = query.trim().toLowerCase();
			if (q === "") return {
				items: [],
				hasMore: false
			};
			const archived = new Set(archivedSessionIds);
			const descendants = indexSubagentDescendants(list.byId);
			const current = mainSessionId(list);
			const workspaceBySession = /* @__PURE__ */ new Map();
			for (const workspace of workspaces) for (const sessionId of workspace.sessionIds) if (!workspaceBySession.has(sessionId)) workspaceBySession.set(sessionId, workspace.title);
			const labelOf = (summary) => workspaceBySession.get(summary.id) ?? workspaceLabel(summary.cwd);
			const contentBySession = /* @__PURE__ */ new Map();
			for (const item of content.items) if (!contentBySession.has(item.sessionId)) contentBySession.set(item.sessionId, item);
			const local = [];
			for (const id of list.ids) {
				const summary = list.byId[id];
				if (summary === void 0 || !sessionVisible(summary, current, archived) || summary.blank && !isNamedBlank(summary)) continue;
				if (sessionTitle(summary).toLowerCase().includes(q) || labelOf(summary).toLowerCase().includes(q)) local.push(summary);
			}
			local.sort(byRecency);
			const ordered = [];
			const included = /* @__PURE__ */ new Set();
			const include = (summary) => {
				if (included.has(summary.id)) return;
				included.add(summary.id);
				ordered.push(summary);
			};
			for (const summary of local) include(summary);
			for (const item of content.items) {
				const summary = list.byId[item.sessionId];
				if (summary !== void 0 && sessionVisible(summary, current, archived) && (!summary.blank || isNamedBlank(summary))) include(summary);
			}
			return {
				items: ordered.slice(0, limit).map((summary) => {
					const match = contentBySession.get(summary.id);
					const status = statuses.get(summary.id);
					const pendingInteraction = visiblePendingKind(status?.pendingInteraction?.kind);
					return {
						id: summary.id,
						title: sessionTitle(summary),
						blank: summary.blank,
						workspace: labelOf(summary),
						running: status?.running ?? summary.running,
						runningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,
						...pendingInteraction === void 0 ? {} : { pendingInteraction },
						completed: status?.completionUnread === true,
						hasActiveSchedule: activeSchedules.has(summary.id),
						...match === void 0 ? {} : { snippet: match.snippet }
					};
				}),
				hasMore: content.hasMore || ordered.length > limit
			};
		}
		/**
		* Fold worktree Workspace groups under their repository. A repository node
		* sits where its first Workspace sits in Host order; Workspaces outside any
		* scanned repository keep their own row. Repository nodes default to expanded.
		*
		* Only what the Host actually holds is rendered: every row is a registered
		* Workspace's group. A worktree the user removed, one whose directory is gone,
		* and one git no longer lists produce no row at all — re-registering the
		* directory is what brings it back.
		* @param groups - derived groups in Host order.
		* @param snapshot - repositories and worktrees as the host last observed them.
		* @param groupExpansion - viewing-store expansion state (repository keys included).
		* @returns sections in render order.
		*/
		function arrangeSections(groups, snapshot, groupExpansion) {
			const repoByKey = new Map(snapshot.repos.map((repo) => [repo.key, repo]));
			const sections = [];
			const buckets = /* @__PURE__ */ new Map();
			const emitRepo = (repo) => {
				const key = repoGroupKey(repo.key);
				const bucket = [];
				sections.push({
					kind: "repo",
					key,
					repo,
					expanded: groupExpansion[key] ?? true,
					containsCurrent: false,
					groups: bucket,
					workspaceIds: []
				});
				buckets.set(repo.key, bucket);
				return bucket;
			};
			for (const group of groups) {
				const repoKey = group.workspaceId === void 0 ? void 0 : snapshot.workspaceRepo[group.workspaceId];
				const repo = repoKey === void 0 ? void 0 : repoByKey.get(repoKey);
				if (repo === void 0) {
					sections.push({
						kind: "group",
						group
					});
					continue;
				}
				(buckets.get(repo.key) ?? emitRepo(repo)).push(group);
			}
			return sections.map((section) => {
				if (section.kind !== "repo") return section;
				return {
					...section,
					groups: section.groups,
					containsCurrent: section.groups.some((group) => group.containsCurrent),
					workspaceIds: section.groups.flatMap((group) => group.workspaceId === void 0 ? [] : [group.workspaceId])
				};
			});
		}
		/** Nested worktrees only accept drops from their own repository; top-level sections share the undefined scope. */
		function workspaceDropAllowed(sourceRepoKey, targetRepoKey) {
			return sourceRepoKey === targetRepoKey;
		}
		/**
		* Resolve a workspace drag against the durable Host order: which Workspaces
		* move (a repository node moves all of its Workspaces as one block, a plain row
		* moves itself) and which Workspace they land in front of.
		*
		* The rendered order is the Host order, so the drop target's position in that
		* order is what the anchor is computed from. A drop that would not change the
		* order resolves to undefined.
		* @param order - durable Workspace ids, in Host order.
		* @param moving - Workspaces the drag carries.
		* @param target - every Workspace in the target section and which half of that section received the drop.
		* @returns the resolved move, or undefined when the order cannot change.
		*/
		function planWorkspaceMove(order, moving, target) {
			const block = order.filter((id) => moving.includes(id));
			if (block.length === 0) return void 0;
			const blockSet = new Set(block);
			const targetBlock = order.filter((id) => target.ids.includes(id));
			if (targetBlock.length === 0) return void 0;
			if (targetBlock.some((id) => blockSet.has(id))) return void 0;
			const boundaryId = target.half === "before" ? targetBlock[0] : targetBlock[targetBlock.length - 1];
			if (boundaryId === void 0) return void 0;
			let anchorIndex = order.indexOf(boundaryId);
			if (target.half === "after") anchorIndex += 1;
			while (anchorIndex < order.length && blockSet.has(order[anchorIndex])) anchorIndex += 1;
			const anchor = anchorIndex >= order.length ? void 0 : order[anchorIndex];
			const without = order.filter((id) => !blockSet.has(id));
			const insertAt = anchor === void 0 ? without.length : without.indexOf(anchor);
			const next = [
				...without.slice(0, insertAt),
				...block,
				...without.slice(insertAt)
			];
			if (next.length === order.length && next.every((id, index) => id === order[index])) return void 0;
			return {
				ids: block,
				anchor
			};
		}
		//#endregion
		//#region \0dsh-css:/home/ubuntu/repos/dsh-left-panel/src/client/rows/Rows.module.css.mjs
		const css$1 = "._3K6VwW_projectRow,._3K6VwW_sessionRow{cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary);border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}._3K6VwW_areaHeader{box-sizing:border-box;min-height:30px;color:var(--dsw-alias-label-tertiary);cursor:pointer;border:1px solid #0000;border-radius:8px;align-items:center;margin-top:10px;padding:0 8px 0 3px;display:flex}._3K6VwW_areaHeader:first-child{margin-top:0}._3K6VwW_areaHeaderActive{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover)}._3K6VwW_areaDropBefore:before,._3K6VwW_areaDropAfter:after{content:\"\";background:var(--dsw-alias-state-business-primary);border-radius:2px;height:2px;position:absolute;left:4px;right:4px}._3K6VwW_areaHeader{position:relative}._3K6VwW_areaDropBefore:before{top:-5px}._3K6VwW_areaDropAfter:after{bottom:-5px}._3K6VwW_areaName{text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:calc(100% - 48px);font-size:14px;font-weight:400;line-height:20px;overflow:hidden}._3K6VwW_areaChevron{flex:none;justify-content:center;align-items:center;width:14px;height:20px;margin-left:4px;display:none}._3K6VwW_areaHeader:hover ._3K6VwW_areaChevron,._3K6VwW_areaHeader._3K6VwW_menuOpen ._3K6VwW_areaChevron{display:inline-flex}._3K6VwW_areaActions{align-items:center;gap:8px;margin-left:auto;display:none}._3K6VwW_areaHeader:hover ._3K6VwW_areaActions,._3K6VwW_areaHeader._3K6VwW_menuOpen ._3K6VwW_areaActions{display:inline-flex}._3K6VwW_areaAction{width:20px;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:5px;justify-content:center;align-items:center;padding:0;display:inline-flex}._3K6VwW_areaAction:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}._3K6VwW_projectRow:hover,._3K6VwW_sessionRow:hover,._3K6VwW_sessionRow._3K6VwW_selected{background:var(--dsw-alias-interactive-bg-hover)}._3K6VwW_searchResultRow{box-sizing:border-box;cursor:pointer;text-align:left;width:100%;min-height:48px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:8px;flex-direction:column;align-items:stretch;padding:4px 8px;display:flex}._3K6VwW_searchResultRow:hover,._3K6VwW_searchResultRow._3K6VwW_selected,._3K6VwW_searchResultRow._3K6VwW_menuOpen{background:var(--dsw-alias-interactive-bg-hover)}._3K6VwW_searchResultHeading{align-items:center;min-width:0;display:flex}._3K6VwW_searchResultHeading>._3K6VwW_rowActions{margin-left:auto;padding-left:6px}._3K6VwW_searchResultTitle{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;margin-left:4px;font-size:14px;line-height:20px;overflow:hidden}._3K6VwW_searchResultMeta{align-items:center;gap:6px;min-width:0;margin-left:20px;display:flex}._3K6VwW_searchResultWorkspace,._3K6VwW_searchResultSnippet{text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;overflow:hidden}._3K6VwW_searchResultWorkspace{max-width:40%;color:var(--dsw-alias-label-tertiary);flex:none}._3K6VwW_searchResultSnippet{min-width:0;color:var(--dsw-alias-label-secondary);flex:1}._3K6VwW_projectRow{box-sizing:border-box;align-items:center;height:34px}._3K6VwW_projectRow ._3K6VwW_rowActions{height:20px}._3K6VwW_sessionRow{height:32px;animation:_3K6VwW_row-in .15s var(--ds-ease-in-out);gap:0}._3K6VwW_sessionRow ._3K6VwW_title{margin:0 6px 0 4px}._3K6VwW_flatSessionRowWithoutStatus ._3K6VwW_title{margin-left:0}@keyframes _3K6VwW_row-in{0%{opacity:0}}@keyframes _3K6VwW_flashRow{0%{background:0 0}25%{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 3px 0 0 var(--dsw-alias-state-business-primary)}70%{background:var(--dsw-alias-interactive-bg-hover);box-shadow:inset 3px 0 0 var(--dsw-alias-state-business-primary)}to{background:0 0}}._3K6VwW_sessionRowFlash{animation:1.8s ease-out _3K6VwW_flashRow}._3K6VwW_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}._3K6VwW_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}._3K6VwW_folderActive{color:var(--dsw-alias-state-business-primary)}._3K6VwW_projectRow ._3K6VwW_chevron{display:none}._3K6VwW_projectRow:hover ._3K6VwW_chevron{display:inline-flex}._3K6VwW_projectRow:hover ._3K6VwW_folder{display:none}._3K6VwW_arrow{transition:transform .15s var(--ds-ease-in-out)}._3K6VwW_arrowOpen{transform:rotate(90deg)}._3K6VwW_projectText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._3K6VwW_title{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;line-height:20px;overflow:hidden}._3K6VwW_renameInput{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-button-elevated-fill);min-width:0;color:inherit;border-radius:4px;outline:none;padding:0 2px;font-size:14px;line-height:20px}._3K6VwW_sessionRow ._3K6VwW_title{flex:1}._3K6VwW_meta{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;overflow:hidden}._3K6VwW_time{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:20px}._3K6VwW_scheduleIndicator{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-right:6px;display:inline-flex}._3K6VwW_searchScheduleIndicator{margin-left:4px;margin-right:0}._3K6VwW_dot{flex:none}._3K6VwW_rowActions{flex:none;align-items:center;gap:12px;display:none}._3K6VwW_projectRow:hover ._3K6VwW_rowActions,._3K6VwW_projectRow:focus ._3K6VwW_rowActions,._3K6VwW_projectRow:focus-within ._3K6VwW_rowActions,._3K6VwW_sessionRow:hover ._3K6VwW_rowActions,._3K6VwW_sessionRow:focus ._3K6VwW_rowActions,._3K6VwW_sessionRow:focus-within ._3K6VwW_rowActions,._3K6VwW_searchResultRow:hover ._3K6VwW_rowActions,._3K6VwW_searchResultRow:focus ._3K6VwW_rowActions,._3K6VwW_searchResultRow:focus-within ._3K6VwW_rowActions,._3K6VwW_projectRow._3K6VwW_menuOpen ._3K6VwW_rowActions,._3K6VwW_sessionRow._3K6VwW_menuOpen ._3K6VwW_rowActions,._3K6VwW_searchResultRow._3K6VwW_menuOpen ._3K6VwW_rowActions{display:inline-flex}._3K6VwW_sessionRow:hover ._3K6VwW_time,._3K6VwW_sessionRow:focus ._3K6VwW_time,._3K6VwW_sessionRow:focus-within ._3K6VwW_time,._3K6VwW_sessionRow._3K6VwW_menuOpen ._3K6VwW_time{display:none}._3K6VwW_projectRow._3K6VwW_menuOpen,._3K6VwW_sessionRow._3K6VwW_menuOpen{background:var(--dsw-alias-interactive-bg-hover)}._3K6VwW_sessionRow._3K6VwW_dropBefore,._3K6VwW_sessionRow._3K6VwW_dropAfter{position:relative}._3K6VwW_sessionRow._3K6VwW_dropBefore:before,._3K6VwW_sessionRow._3K6VwW_dropAfter:after{content:\"\";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:4px}._3K6VwW_sessionRow._3K6VwW_dropBefore:before{top:-7px}._3K6VwW_sessionRow._3K6VwW_dropAfter:after{bottom:-7px}._3K6VwW_hoverContent{flex-direction:column;gap:8px;display:flex}._3K6VwW_hoverTitle{color:#fff;overflow-wrap:break-word;font-size:14px;line-height:20px}._3K6VwW_hoverPath{color:#cfd3d6;word-break:break-all;font-size:12px;line-height:16px}._3K6VwW_hoverTime{color:#cfd3d6;font-size:12px;line-height:16px}._3K6VwW_hoverStatus{color:#adb2b8;align-items:center;gap:8px;font-size:12px;line-height:20px;display:flex}._3K6VwW_iconButton{cursor:pointer;width:16px;height:16px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._3K6VwW_iconButton:hover{color:var(--dsw-alias-label-primary)}._3K6VwW_chevron{color:var(--dsw-alias-label-caption)}._3K6VwW_repoMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:12px;line-height:20px}._3K6VwW_repoMetaError{color:var(--dsw-alias-label-warning,#c47a00)}._3K6VwW_repoRow:hover ._3K6VwW_repoMeta,._3K6VwW_repoRow._3K6VwW_menuOpen ._3K6VwW_repoMeta{display:none}._3K6VwW_badge{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:4px;flex:none;padding:0 4px;font-size:10px;line-height:14px}@media (prefers-reduced-motion:reduce){._3K6VwW_sessionRow,._3K6VwW_arrow{transition:none;animation:none}}";
		const tagId$1 = "dsh-left-panel/Rows.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-left-panel";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var Rows_module_css_default = {
			"areaAction": "_3K6VwW_areaAction",
			"areaActions": "_3K6VwW_areaActions",
			"areaChevron": "_3K6VwW_areaChevron",
			"areaDropAfter": "_3K6VwW_areaDropAfter",
			"areaDropBefore": "_3K6VwW_areaDropBefore",
			"areaHeader": "_3K6VwW_areaHeader",
			"areaHeaderActive": "_3K6VwW_areaHeaderActive",
			"areaName": "_3K6VwW_areaName",
			"arrow": "_3K6VwW_arrow",
			"arrowOpen": "_3K6VwW_arrowOpen",
			"badge": "_3K6VwW_badge",
			"chevron": "_3K6VwW_chevron",
			"dot": "_3K6VwW_dot",
			"dropAfter": "_3K6VwW_dropAfter",
			"dropBefore": "_3K6VwW_dropBefore",
			"flashRow": "_3K6VwW_flashRow",
			"flatSessionRowWithoutStatus": "_3K6VwW_flatSessionRowWithoutStatus",
			"folder": "_3K6VwW_folder",
			"folderActive": "_3K6VwW_folderActive",
			"hoverContent": "_3K6VwW_hoverContent",
			"hoverPath": "_3K6VwW_hoverPath",
			"hoverStatus": "_3K6VwW_hoverStatus",
			"hoverTime": "_3K6VwW_hoverTime",
			"hoverTitle": "_3K6VwW_hoverTitle",
			"iconButton": "_3K6VwW_iconButton",
			"menuOpen": "_3K6VwW_menuOpen",
			"meta": "_3K6VwW_meta",
			"projectRow": "_3K6VwW_projectRow",
			"projectText": "_3K6VwW_projectText",
			"renameInput": "_3K6VwW_renameInput",
			"repoMeta": "_3K6VwW_repoMeta",
			"repoMetaError": "_3K6VwW_repoMetaError",
			"repoRow": "_3K6VwW_repoRow",
			"row-in": "_3K6VwW_row-in",
			"rowActions": "_3K6VwW_rowActions",
			"scheduleIndicator": "_3K6VwW_scheduleIndicator",
			"searchResultHeading": "_3K6VwW_searchResultHeading",
			"searchResultMeta": "_3K6VwW_searchResultMeta",
			"searchResultRow": "_3K6VwW_searchResultRow",
			"searchResultSnippet": "_3K6VwW_searchResultSnippet",
			"searchResultTitle": "_3K6VwW_searchResultTitle",
			"searchResultWorkspace": "_3K6VwW_searchResultWorkspace",
			"searchScheduleIndicator": "_3K6VwW_searchScheduleIndicator",
			"selected": "_3K6VwW_selected",
			"sessionRow": "_3K6VwW_sessionRow",
			"sessionRowFlash": "_3K6VwW_sessionRowFlash",
			"slot": "_3K6VwW_slot",
			"time": "_3K6VwW_time",
			"title": "_3K6VwW_title",
			"visuallyHidden": "_3K6VwW_visuallyHidden"
		};
		//#endregion
		//#region src/client/rows/Rows.tsx
		/**
		* Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.6-alpha.2 (MIT License,
		* Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
		* group their worktrees and Workspace registration follows git.
		*/
		/**
		* Workspace browser tree row components (figma Cell set 14:3080): pure presentational —
		* all data and callbacks arrive via props. Hover swaps (folder->chevron,
		* time->ellipsis, action buttons) are CSS-only. Menus expose workspace
		* rename/delete, branch-path copy and session rename/fork/archive; the session
		* and workspace hover cards are suppressed while a menu is open.
		*/
		/** Only unnamed blank rows use the localized New Session placeholder. */
		function displayTitle(node, t) {
			return node.blank && node.title === "" ? t("session.new") : node.title;
		}
		/** Localized compact relative time ("刚刚"/"5分钟" in zh, "now"/"5min" in en). */
		function timeLabel(updatedAt, now, t) {
			const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
			return unit === "now" ? t("time.now") : t(`time.${unit}`, { n });
		}
		/** Hover-card variant: distances wrap in the ago template; the now bucket stays bare (no "now ago"). */
		function hoverTimeLabel(updatedAt, now, t) {
			const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(updatedAt, now);
			return unit === "now" ? t("time.now") : t("time.ago", { t: t(`time.${unit}`, { n }) });
		}
		/**
		* Absolute creation time through the dictionary's date template (the message
		* clock pattern): `toLocaleString` would follow the browser language, not the
		* app locale, and produce mixed-language text after a switch.
		*/
		function createdLabel(createdAt, t) {
			const d = new Date(createdAt);
			const pad2 = (v) => String(v).padStart(2, "0");
			return t("hover.created", { time: `${t("date.ymd", {
				y: d.getFullYear(),
				m: d.getMonth() + 1,
				d: d.getDate()
			})} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` });
		}
		/** Hover-card body: workspace title, display directory path, absolute creation time. */
		function WorkspaceHoverContent({ label, cwd, createdAt, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Rows_module_css_default.hoverContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverTitle,
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverPath,
						children: cwd
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverTime,
						children: createdLabel(createdAt, t)
					})
				]
			});
		}
		/** Visual project-section heading. Actions appear only while the heading is hovered. */
		function ProjectAreaHeader({ name, expanded, active, drag, onToggle, onRename, onDissolve, onDragOver, onDrop, t }) {
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(Rows_module_css_default.areaHeader, active && Rows_module_css_default.areaHeaderActive, menuOpen && Rows_module_css_default.menuOpen, drag?.marker === "before" && Rows_module_css_default.areaDropBefore, drag?.marker === "after" && Rows_module_css_default.areaDropAfter),
				role: "button",
				tabIndex: 0,
				"aria-expanded": expanded,
				draggable: drag !== void 0,
				onClick: onToggle,
				onDragStart: drag === void 0 ? void 0 : (event) => {
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", name);
					drag.start();
				},
				onDragEnd: drag?.end,
				onKeyDown: (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					onToggle();
				},
				onDragOver: drag?.active === true ? (event) => {
					event.preventDefault();
					event.dataTransfer.dropEffect = "move";
					drag.hover(rowHalf(event));
				} : onDragOver,
				onDrop: drag?.active === true ? (event) => {
					event.preventDefault();
					drag.drop(rowHalf(event));
				} : onDrop,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.areaName,
						children: name
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.areaChevron,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: clsx(Rows_module_css_default.arrow, expanded && Rows_module_css_default.arrowOpen) })
					}),
					(onRename !== void 0 || onDissolve !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.areaActions,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuOpen,
							onClose: () => {
								setMenuOpen(false);
							},
							items: [...onRename === void 0 ? [] : [{
								id: "rename",
								label: t("rename"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, {})
							}], ...onDissolve === void 0 ? [] : [{
								id: "dissolve",
								label: t("area.dissolve"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, {}),
								danger: true
							}]],
							onSelect: (id) => {
								setMenuOpen(false);
								if (id === "rename") onRename?.();
								if (id === "dissolve") onDissolve?.();
							},
							portal: true,
							closeOnPointerLeave: true,
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: Rows_module_css_default.areaAction,
								"aria-label": t("area.actions.aria", { name }),
								onClick: (event) => {
									event.stopPropagation();
									setMenuOpen((value) => !value);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutlineRegular, {})
							})
						})
					})
				]
			});
		}
		/** Pointer-position half of a row (insert line above or below). */
		function rowHalf(e) {
			const rect = e.currentTarget.getBoundingClientRect();
			return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
		}
		/**
		* Project (workspace) header row: folder + title;
		* hover reveals the chevron and create button, and dwelling on a real
		* Workspace shows its hover card (the ungrouped bucket has none).
		* `containsCurrent` arrives on the node (derivation fact, no renderer scan).
		* @param props.group - derived group node.
		* @param props.onToggle - expand/collapse the group.
		* @param props.onCreate - start a frontend Session inside this Workspace.
		* @param props.drag - optional workspace-row drag wiring.
		* @param props.home - host account home for POSIX hover-path abbreviation.
		* @param props.nested - the row sits under a repository node and can only be reordered within it.
		* @param props.t - the browser root's locale seat.
		* @returns the row element.
		*/
		function ProjectRowItem({ group, onToggle, onCreate, actions, drag, home, nested = false, t }) {
			const row = group;
			const label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;
			const active = group.expanded && group.containsCurrent;
			const status = row.expanded ? void 0 : groupPrimaryStatus(row, t);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const workspaceMenuItems = [
				{
					id: "rename",
					label: nested ? t("worktree.rename.display") : t("rename"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, {})
				},
				...nested && actions?.renameBranch !== void 0 ? [{
					id: "rename-branch",
					label: t("worktree.rename.branch"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, {})
				}] : [],
				...nested && row.cwd !== void 0 ? [{
					id: "copy-path",
					label: t("menu.copyAbsolutePath"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular, {})
				}] : [],
				...actions?.delete === void 0 ? [] : [{
					id: "delete",
					label: t("delete.workspace"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, {}),
					danger: true,
					...actions.deleteDisabled === true ? {
						disabled: true,
						disabledReason: t("delete.workspace.main")
					} : {}
				}]
			];
			const ownRow = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(Rows_module_css_default.projectRow, menuOpen && Rows_module_css_default.menuOpen),
				role: "treeitem",
				"aria-expanded": row.expanded,
				onClick: onToggle,
				draggable: drag !== void 0,
				onDragStart: drag === void 0 ? void 0 : (e) => {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", row.key);
					drag.start();
				},
				onDragEnd: drag?.end,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(Rows_module_css_default.slot, Rows_module_css_default.folder, active && Rows_module_css_default.folderActive),
						children: nested ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, {}) : row.expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(Rows_module_css_default.slot, Rows_module_css_default.chevron),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: clsx(Rows_module_css_default.arrow, row.expanded && Rows_module_css_default.arrowOpen) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.projectText,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Rows_module_css_default.title,
							children: label
						})
					}),
					status !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: Rows_module_css_default.slot,
						title: status.label,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: status.state }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Rows_module_css_default.visuallyHidden,
							children: status.label
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: Rows_module_css_default.rowActions,
						children: [actions !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuOpen,
							onClose: () => {
								setMenuOpen(false);
							},
							items: workspaceMenuItems,
							onSelect: (id) => {
								setMenuOpen(false);
								if (id === "copy-path" && nested && row.cwd !== void 0) (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(row.cwd).then((copied) => {
									if (!copied) console.warn("left-panel: could not copy the worktree path to the clipboard");
								});
								if (id === "rename") actions.rename();
								if (id === "rename-branch") actions.renameBranch?.();
								if (id === "delete") actions.delete?.();
							},
							portal: true,
							closeOnPointerLeave: true,
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: Rows_module_css_default.iconButton,
								"aria-label": t("actions.workspace.aria", { name: label }),
								onClick: (e) => {
									e.stopPropagation();
									setMenuOpen((v) => !v);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutlineRegular, {})
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: Rows_module_css_default.iconButton,
							"aria-label": t("actions.newSession.aria", { name: label }),
							onClick: (e) => {
								e.stopPropagation();
								onCreate();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutlineRegular, {})
						})]
					})
				]
			});
			if (row.createdAt === void 0) return ownRow;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
				anchor: ownRow,
				content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceHoverContent, {
					label: row.label,
					cwd: row.cwd === void 0 ? void 0 : abbreviateHomePath(row.cwd, home),
					createdAt: row.createdAt,
					t
				}),
				disabled: menuOpen,
				copyText: row.cwd,
				copyLabel: t("copy"),
				copiedLabel: t("hover.copied")
			});
		}
		/** Hover-card body for a repository node: name, main worktree path, scan error. */
		function RepoHoverContent({ section, home, t }) {
			const { repo } = section;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Rows_module_css_default.hoverContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverTitle,
						children: repo.name
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverPath,
						children: abbreviateHomePath(repo.mainPath, home)
					}),
					repo.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Rows_module_css_default.hoverStatus,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("repo.hover.error", { message: repo.error }) })]
					})
				]
			});
		}
		/**
		* Repository header row: branch glyph + repository name + worktree count.
		* The row only folds and unfolds its worktrees — sessions live in the worktree
		* rows beneath it — and its menu drives the plugin's per-repository sync.
		* @param props.section - derived repository section.
		* @param props.onToggle - expand/collapse the repository.
		* @param props.onRefresh - reconcile this repository's worktrees now.
		* @param props.onRename - open the browser-owned rename dialog for this repository.
		* @param props.drag - optional node-row drag wiring (moves the whole repository block).
		* @param props.home - host account home for POSIX hover-path abbreviation.
		* @param props.t - the browser root's locale seat.
		* @returns the row element.
		*/
		function RepoRowItem({ section, onToggle, onRefresh, onRename, onDelete, onRestore, onCreateWorktree, drag, home, t }) {
			const { repo } = section;
			const deletedBranchItems = (repo.deletedWorktrees ?? []).map((worktree) => ({
				id: `restore:${worktree.path}`,
				label: worktree.branch ?? worktree.title
			}));
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const active = section.expanded && section.containsCurrent;
			const menuItems = [
				{
					id: "rename",
					label: t("rename"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, {})
				},
				{
					id: "create-worktree",
					label: t("repo.menu.newWorktree"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, {})
				},
				{
					id: "refresh",
					label: t("repo.menu.refresh"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, {})
				},
				{
					id: "delete",
					label: t("delete.repository"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, {}),
					danger: true
				},
				...deletedBranchItems.length === 0 ? [] : [{
					id: "deleted-branches",
					label: t("repo.menu.deletedBranches"),
					submenu: deletedBranchItems
				}]
			];
			const ownRow = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(Rows_module_css_default.projectRow, Rows_module_css_default.repoRow, menuOpen && Rows_module_css_default.menuOpen),
				role: "treeitem",
				"aria-expanded": section.expanded,
				onClick: onToggle,
				draggable: drag !== void 0,
				onDragStart: drag === void 0 ? void 0 : (e) => {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", section.key);
					drag.start();
				},
				onDragEnd: drag?.end,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(Rows_module_css_default.slot, Rows_module_css_default.folder, active && Rows_module_css_default.folderActive),
						children: section.expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(Rows_module_css_default.slot, Rows_module_css_default.chevron),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: clsx(Rows_module_css_default.arrow, section.expanded && Rows_module_css_default.arrowOpen) })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.projectText,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Rows_module_css_default.title,
							children: repo.name
						})
					}),
					repo.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: clsx(Rows_module_css_default.repoMeta, Rows_module_css_default.repoMetaError),
						children: "!"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.rowActions,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuOpen,
							onClose: () => {
								setMenuOpen(false);
							},
							items: menuItems,
							onSelect: (id) => {
								setMenuOpen(false);
								if (id === "create-worktree") onCreateWorktree();
								if (id === "rename") onRename();
								if (id === "refresh") onRefresh();
								if (id === "delete") onDelete();
								if (id.startsWith("restore:")) onRestore(id.slice(8));
							},
							portal: true,
							closeOnPointerLeave: true,
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: Rows_module_css_default.iconButton,
								"aria-label": t("repo.actions.aria", { name: repo.name }),
								onClick: (e) => {
									e.stopPropagation();
									setMenuOpen((v) => !v);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutlineRegular, {})
							})
						})
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
				anchor: ownRow,
				content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RepoHoverContent, {
					section,
					home,
					t
				}),
				disabled: menuOpen,
				copyText: repo.mainPath,
				copyLabel: t("copy"),
				copiedLabel: t("hover.copied")
			});
		}
		/* v8 ignore next 3 -- closed-union backstop; only reached if the status is forged */
		function assertNever(value) {
			throw new Error(`unknown pending interaction: ${String(value)}`);
		}
		/**
		* Session status presentation; pending interaction is primary and live activity
		* outranks completion reminders.
		*/
		function sessionStatuses(node, t) {
			const subagents = node.runningSubagentCount === 0 ? void 0 : {
				state: "ongoing",
				label: t(node.runningSubagentCount === 1 ? "status.subagentsRunning.one" : "status.subagentsRunning.other", { n: node.runningSubagentCount })
			};
			let pending;
			switch (node.pendingInteraction) {
				case "approval":
					pending = {
						state: "warning",
						label: t("status.waitingApproval")
					};
					break;
				case "plan-review":
					pending = {
						state: "warning",
						label: t("status.planReview")
					};
					break;
				case "question":
					pending = {
						state: "warning",
						label: t("status.waitingAnswer")
					};
					break;
				case void 0: break;
				/* v8 ignore next -- closed PendingInteractionStatus union */
				default: return assertNever(node.pendingInteraction);
			}
			if (pending !== void 0) return subagents === void 0 ? [pending] : [pending, subagents];
			if (node.running) {
				const primary = {
					state: "ongoing",
					label: t("status.running")
				};
				return subagents === void 0 ? [primary] : [primary, subagents];
			}
			if (subagents !== void 0) return [subagents];
			if (node.completed) return [{
				state: "done",
				label: t("status.completed")
			}];
			return [{
				state: "done",
				label: t("status.idle")
			}];
		}
		/**
		* One workspace group's aggregate status, mirroring a session row's primary
		* status: pending interaction outranks live activity, which outranks the
		* finished-but-unviewed reminder. Nothing renders when every member is idle.
		*/
		function groupPrimaryStatus(group, t) {
			if (group.pendingInteraction) return {
				state: "warning",
				label: t("status.waitingApproval")
			};
			if (group.running) return {
				state: "ongoing",
				label: t("status.running")
			};
			if (group.completedUnread) return {
				state: "done",
				label: t("status.completed")
			};
		}
		/** Primary status dot plus every status's screen-reader label, shared by the search and session rows. */
		function SessionStatusDots({ statuses }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: statuses[0].state }), statuses.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.visuallyHidden,
				children: status.label
			}, status.label))] });
		}
		/** Non-interactive active-Schedule marker; the enclosing row remains the only action. */
		function ActiveScheduleIndicator({ t, search = false }) {
			const label = t("schedule.active");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clsx(Rows_module_css_default.scheduleIndicator, search && Rows_module_css_default.searchScheduleIndicator),
				role: "img",
				"aria-label": label,
				title: label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAlarmClockOutlineRegular, {})
			});
		}
		/** Hover-card body: full title, relative time, and every relevant live status. */
		function SessionHoverContent({ node, now, t }) {
			const statuses = sessionStatuses(node, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Rows_module_css_default.hoverContent,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverTitle,
						children: displayTitle(node, t)
					}),
					!node.blank && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Rows_module_css_default.hoverTime,
						children: hoverTimeLabel(node.updatedAt, now, t)
					}),
					statuses.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Rows_module_css_default.hoverStatus,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: status.state }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status.label })]
					}, status.label))
				]
			});
		}
		/** Every listed Session has registration-safe actions, including blank Sessions. */
		function SessionMenu({ id, title, blank = false, open, setOpen, onRename, onFork, onArchive, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Rows_module_css_default.rowActions,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open,
					onClose: () => {
						setOpen(false);
					},
					items: [
						{
							id: "rename",
							label: t("rename"),
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, {})
						},
						...blank ? [] : [{
							id: "fork",
							label: t("menu.fork"),
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutlineRegular, {})
						}],
						{
							id: "archive",
							label: t("menu.archiveSession"),
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutlineRegular, { size: 16 })
						}
					],
					onSelect: (action) => {
						setOpen(false);
						if (action === "rename") onRename(id, title);
						if (action === "fork") onFork(id);
						if (action === "archive") onArchive(id);
					},
					portal: true,
					closeOnPointerLeave: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: Rows_module_css_default.iconButton,
						"aria-label": t("actions.session.aria", { name: title || t("session.new") }),
						onClick: (event) => {
							event.stopPropagation();
							setOpen(!open);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEllipsisOutlineRegular, {})
					})
				})
			});
		}
		/**
		* One flat search result: title, Workspace context, and optional content
		* excerpt. Search navigation opens the session only; it does not address an
		* event inside the conversation.
		* @param props.result - merged local/content search row.
		* @param props.currentId - selected session id.
		* @param props.onOpen - open the selected session.
		* @param props.t - Workspace-browser translation seat.
		* @returns the result row with its own session actions.
		*/
		function SearchResultItem({ result, currentId, onOpen, onRename, onFork, onArchive, t }) {
			const selected = result.id === currentId;
			const statuses = sessionStatuses(result, t);
			const primaryStatus = statuses[0];
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(Rows_module_css_default.searchResultRow, selected && Rows_module_css_default.selected, menuOpen && Rows_module_css_default.menuOpen),
				role: "treeitem",
				"aria-selected": selected,
				tabIndex: 0,
				onKeyDown: (event) => {
					if (event.target !== event.currentTarget || event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					onOpen(result.id);
				},
				onClick: () => {
					onOpen(result.id);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: Rows_module_css_default.searchResultHeading,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Rows_module_css_default.slot,
							children: (primaryStatus.state !== "done" || result.completed) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Rows_module_css_default.searchResultTitle,
							children: result.title
						}),
						result.hasActiveSchedule && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActiveScheduleIndicator, {
							t,
							search: true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionMenu, {
							id: result.id,
							title: result.title,
							blank: result.blank,
							open: menuOpen,
							setOpen: setMenuOpen,
							onRename,
							onFork,
							onArchive,
							t
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: Rows_module_css_default.searchResultMeta,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.searchResultWorkspace,
						children: result.workspace || t("group.ungrouped")
					}), result.snippet !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.searchResultSnippet,
						children: result.snippet
					})]
				})]
			});
		}
		/**
		* One top-level 34px session row: status dot (pending user interaction outranks
		* own or descendant activity), title, relative time, and the row actions menu.
		* @param props.node - derived session node.
		* @param props.currentId - selected session id (row highlight).
		* @param props.now - epoch ms for relative-time formatting.
		* @param props.onOpen - open a session by id.
		* @param props.onRename - open the session rename dialog (id + current title).
		* @param props.onFork - fork a session at its last completed turn.
		* @param props.onArchive - archive a session by id.
		* @param props.onReveal - scroll this row into view after search navigation, then acknowledge it.
		* @param props.drag - optional draggable-row wiring.
		* @param props.flat - omit the empty status slot in the hierarchy-free flat list.
		* @param props.t - the browser root's locale seat.
		* @returns the session row.
		*/
		function SessionNodeItem({ node, currentId, now, onOpen, onRename, onFork, onArchive, onReveal, drag, flat = false, flash = false, t }) {
			const row = node;
			const title = displayTitle(node, t);
			const selected = node.id === currentId;
			const statuses = sessionStatuses(node, t);
			const showStatus = statuses[0].state !== "done" || row.completed;
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const rowRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (onReveal === void 0) return;
				rowRef.current?.scrollIntoView({ block: "nearest" });
				onReveal();
			}, [onReveal]);
			const ownRow = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rowRef,
				className: clsx(Rows_module_css_default.sessionRow, selected && Rows_module_css_default.selected, menuOpen && Rows_module_css_default.menuOpen, flat && !showStatus && Rows_module_css_default.flatSessionRowWithoutStatus, drag?.marker === "before" && Rows_module_css_default.dropBefore, drag?.marker === "after" && Rows_module_css_default.dropAfter, flash && Rows_module_css_default.sessionRowFlash),
				role: "treeitem",
				"aria-selected": selected,
				onClick: () => {
					onOpen(node.id);
				},
				draggable: drag !== void 0,
				onDragStart: drag === void 0 ? void 0 : (e) => {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", node.id);
					drag.start();
				},
				onDragEnd: drag?.end,
				onDragOver: drag === void 0 ? void 0 : (e) => {
					if (!drag.active) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					drag.hover(rowHalf(e));
				},
				onDrop: drag === void 0 ? void 0 : (e) => {
					if (!drag.active) return;
					e.preventDefault();
					drag.drop(rowHalf(e));
				},
				children: [
					(!flat || showStatus) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.slot,
						children: showStatus && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.title,
						children: title
					}),
					row.hasActiveSchedule && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActiveScheduleIndicator, { t }),
					!row.blank && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Rows_module_css_default.time,
						children: timeLabel(row.updatedAt, now, t)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionMenu, {
						id: row.id,
						title: row.title,
						blank: row.blank,
						open: menuOpen,
						setOpen: setMenuOpen,
						onRename,
						onFork,
						onArchive,
						t
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {
				anchor: ownRow,
				content: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionHoverContent, {
					node,
					now,
					t
				}),
				disabled: menuOpen || drag?.active === true,
				copyText: row.blank ? void 0 : row.title,
				copyLabel: t("copy"),
				copiedLabel: t("hover.copied")
			});
		}
		//#endregion
		//#region src/client/stores.ts
		/**
		* Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.6-alpha.2 (MIT License,
		* Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
		* group their worktrees and Workspace registration follows git.
		*/
		/**
		* The workspace browser's viewing store: the session-list grouping mode,
		* persisted across reloads. Module level exports the factory only (a
		* module-level handle would pin the store identity across plugin reloads);
		* register() receives the factory and the browser derives its PropsStore
		* share from the return type.
		*/
		/** Browser-local order account for the hierarchy-free flat Session list. */
		const FLAT_SESSION_ORDER_KEY = "__flat_session_order__";
		/**
		* Create the workspace browser viewing store handle.
		* @returns the store handle (spec + type + identity + factory in one).
		*/
		function createWorkspaceViewStore() {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					groupBy: "workspace",
					orderBy: "updated",
					groupExpansion: {},
					sessionOrderByAccount: {},
					sessionUpdatedAtByAccount: {},
					projectAreas: [],
					showActiveSessions: true,
					activeSessionsCollapsed: false,
					treeGuides: false
				}),
				persist: "dsh-left-panel.workspace.view.v2",
				actions: {
					setGroupBy: (d, mode) => {
						d.groupBy = mode;
					},
					setOrderBy: (d, mode) => {
						d.orderBy = mode;
					},
					setShowActiveSessions: (d, show) => {
						d.showActiveSessions = show;
					},
					setActiveSessionsCollapsed: (d, collapsed) => {
						d.activeSessionsCollapsed = collapsed;
					},
					setTreeGuides: (d, show) => {
						d.treeGuides = show;
					},
					setGroupExpanded: (d, key, expanded) => {
						d.groupExpansion[key] = expanded;
					},
					retainAccountKeys: (d, workspaceKeys) => {
						const retained = new Set(workspaceKeys);
						d.groupExpansion = Object.fromEntries(Object.entries(d.groupExpansion).filter(([key]) => retained.has(key)));
						d.sessionOrderByAccount = Object.fromEntries(Object.entries(d.sessionOrderByAccount).filter(([key]) => retained.has(key)));
						d.sessionUpdatedAtByAccount = Object.fromEntries(Object.entries(d.sessionUpdatedAtByAccount).filter(([key]) => retained.has(key)));
					},
					syncSessionOrderAccount: (d, accountKey, order, updatedAt) => {
						d.sessionOrderByAccount[accountKey] = order;
						d.sessionUpdatedAtByAccount[accountKey] = updatedAt;
					},
					setSessionOrder: (d, accountKey, order) => {
						d.sessionOrderByAccount[accountKey] = order;
					},
					createProjectArea: (d, id, name) => {
						d.projectAreas ??= [];
						if (d.projectAreas.some((area) => area.id === id)) return;
						d.projectAreas.push({
							id,
							name,
							repoKeys: []
						});
					},
					renameProjectArea: (d, id, name) => {
						const area = d.projectAreas?.find((candidate) => candidate.id === id);
						if (area !== void 0) area.name = name;
					},
					dissolveProjectArea: (d, id) => {
						d.projectAreas = (d.projectAreas ?? []).filter((area) => area.id !== id);
					},
					setRepoProjectArea: (d, repoKey, areaId) => {
						d.projectAreas ??= [];
						for (const area of d.projectAreas) area.repoKeys = area.repoKeys.filter((key) => key !== repoKey);
						if (areaId === null) return;
						const target = d.projectAreas.find((area) => area.id === areaId);
						if (target !== void 0) target.repoKeys.push(repoKey);
					},
					setProjectAreaOrder: (d, areaIds) => {
						d.projectAreas ??= [];
						const byId = new Map(d.projectAreas.map((area) => [area.id, area]));
						const included = /* @__PURE__ */ new Set();
						const ordered = [];
						for (const id of areaIds) {
							const area = byId.get(id);
							if (area === void 0 || included.has(id)) continue;
							ordered.push(area);
							included.add(id);
						}
						for (const area of d.projectAreas) if (!included.has(area.id)) ordered.push(area);
						d.projectAreas = ordered;
					}
				}
			});
		}
		//#endregion
		//#region src/client/project-areas.ts
		/** Stable migration fallback for persisted pre-section view documents. */
		const EMPTY_PROJECT_AREAS = Object.freeze([]);
		/** Preserve reference identity while an older persisted document lacks projectAreas. */
		function projectAreasOrEmpty(value) {
			return value ?? EMPTY_PROJECT_AREAS;
		}
		/** Reorder one custom area around another; the default Projects area is not part of this order. */
		function moveProjectAreaOrder(order, sourceId, targetId, half) {
			if (sourceId === targetId || !order.includes(sourceId) || !order.includes(targetId)) return [...order];
			const next = order.filter((id) => id !== sourceId);
			const targetIndex = next.indexOf(targetId);
			next.splice(targetIndex + (half === "after" ? 1 : 0), 0, sourceId);
			return next;
		}
		//#endregion
		//#region \0dsh-css:/home/ubuntu/repos/dsh-left-panel/src/client/rows/WorkspaceBrowser.module.css.mjs
		const css = ".H02TPW_root{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);--dsh-session-list-scrollbar-width:8px;--dsh-session-list-scrollbar-offset:2px;box-sizing:border-box;min-height:0;padding-right:var(--dsh-session-list-edge-inset);flex-direction:column;flex:1;display:flex}.H02TPW_root.H02TPW_rail{padding-right:0}.H02TPW_iconButton{corner-shape:round;cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.H02TPW_iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.H02TPW_sectionHeader{box-sizing:border-box;height:36px;color:var(--dsw-alias-label-tertiary);border-radius:12px;flex:none;justify-content:flex-end;align-items:center;gap:4px;margin-bottom:4px;padding-left:4px;display:flex;overflow:hidden}.H02TPW_root:not(.H02TPW_rail) .H02TPW_sectionHeader{margin-top:2px;margin-right:-4px}.H02TPW_sectionLabel{white-space:nowrap;opacity:1;visibility:visible;min-width:0;max-width:45%;transition:max-width .18s var(--ds-ease-in-out), margin-right .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;line-height:20px;overflow:hidden}.H02TPW_sectionLabelHidden{opacity:0;visibility:hidden;max-width:0;margin-right:-4px;transition-delay:0s,0s,0s,0s,.18s;transform:translate(-4px)}.H02TPW_searchSlot{box-sizing:border-box;min-width:0;max-width:28px;transition:max-width .18s var(--ds-ease-in-out), padding-left .18s var(--ds-ease-in-out);flex:1;align-items:center;margin-left:auto;padding-left:0;display:flex}.H02TPW_searchSlotExpanded{max-width:100%;padding-left:0}.H02TPW_headerActions{opacity:1;visibility:visible;max-width:92px;transition:max-width .18s var(--ds-ease-in-out), opacity .12s var(--ds-ease-in-out), transform .18s var(--ds-ease-in-out), visibility 0s linear;flex:none;align-items:center;gap:4px;display:flex;overflow:hidden}.H02TPW_headerActionsHidden{opacity:0;visibility:hidden;pointer-events:none;max-width:0;transition-delay:0s,0s,0s,.18s;transform:translate(4px)}.H02TPW_search{box-sizing:border-box;corner-shape:round;cursor:text;width:100%;height:28px;color:var(--dsw-alias-label-secondary);transition:width .18s var(--ds-ease-in-out), padding .18s var(--ds-ease-in-out), border-color .18s var(--ds-ease-in-out), background-color .18s var(--ds-ease-in-out);background:0 0;border:none;border-radius:50%;flex:none;align-items:center;gap:0;margin:0;padding:0;display:flex;overflow:hidden}.H02TPW_searchExpanded{border:.5px solid var(--dsw-alias-border-l4);width:calc(100% + 4px);height:30px;color:var(--dsw-alias-label-caption);background:0 0;border-radius:10px;margin-inline:-2px;padding:0 4px 0 0}.H02TPW_searchButton{corner-shape:round;cursor:pointer;width:28px;height:28px;color:inherit;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.H02TPW_searchExpanded .H02TPW_searchButton{width:28px;height:30px}.H02TPW_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.H02TPW_searchExpanded .H02TPW_searchButton:hover{background:0 0}.H02TPW_searchInput{opacity:0;pointer-events:none;width:0;min-width:0;color:var(--dsw-alias-label-primary);transition:opacity .12s var(--ds-ease-in-out);background:0 0;border:none;outline:none;flex:1;font-size:13px;line-height:18px}.H02TPW_searchExpanded .H02TPW_searchInput{opacity:1;pointer-events:auto;margin-left:-2px}.H02TPW_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}.H02TPW_clearButton{corner-shape:round;cursor:pointer;width:24px;height:24px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.H02TPW_clearButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.H02TPW_rail .H02TPW_sectionHeader{justify-content:flex-start;gap:0;margin-bottom:12px;padding-left:0}.H02TPW_rail .H02TPW_headerActions{max-width:none}.H02TPW_rail .H02TPW_iconButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.H02TPW_rail .H02TPW_search{background:0 0;border-color:#0000;gap:0;width:36px;height:36px;margin:0 0 12px;padding:0}.H02TPW_rail .H02TPW_searchButton{width:36px;height:36px;color:var(--dsw-alias-label-primary)}.H02TPW_rail .H02TPW_searchButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.H02TPW_listArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:visible}.H02TPW_rail .H02TPW_listArea{margin-left:0;margin-right:0;padding-left:0}.H02TPW_treeBody{flex-direction:column;flex:1;min-height:0;display:flex;position:relative}.H02TPW_wide{animation:H02TPW_wide-in .2s var(--ds-ease-in-out)}@keyframes H02TPW_wide-in{0%{opacity:0}}.H02TPW_list{min-height:0;margin-left:-4px;margin-right:var(--dsh-session-list-scrollbar-offset);padding-left:4px;padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset));scrollbar-gutter:stable;flex:1;overflow-y:auto}.H02TPW_flatList>*+*,.H02TPW_searchTree>[role=treeitem]+[role=treeitem],.H02TPW_groupSection>*+*{margin-top:2px}.H02TPW_searchStatus,.H02TPW_searchWarning{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:12px;line-height:18px}.H02TPW_searchWarning{color:var(--dsw-alias-label-secondary)}.H02TPW_activeHeader{min-height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none;align-items:center;gap:4px;padding:0 8px 0 3px;font-size:14px;font-weight:400;line-height:20px;display:flex}.H02TPW_activeHeaderName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.H02TPW_activeChevron{width:14px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-left:4px;display:none}.H02TPW_activeHeader:hover .H02TPW_activeChevron{display:inline-flex}.H02TPW_activeArrow{transition:transform .15s var(--ds-ease-in-out)}.H02TPW_activeArrowOpen{transform:rotate(90deg)}.H02TPW_groupSection{position:relative}.H02TPW_groupSection+.H02TPW_groupSection{margin-top:4px}.H02TPW_projectArea+.H02TPW_projectArea{margin-top:8px}.H02TPW_projectArea>.H02TPW_groupSection+.H02TPW_groupSection{margin-top:4px}.H02TPW_nestedSection{padding-left:14px}.H02TPW_treeGuides .H02TPW_nestedSection{position:relative}.H02TPW_treeGuides .H02TPW_nestedSection:before{content:\"\";border-left:1px solid var(--dsw-alias-border-l4);border-bottom:1px solid var(--dsw-alias-border-l4);pointer-events:none;border-bottom-left-radius:6px;width:11px;height:26px;position:absolute;top:-9px;left:15px}.H02TPW_treeGuides .H02TPW_nestedSection:not(:last-child):after{content:\"\";border-left:1px solid var(--dsw-alias-border-l4);pointer-events:none;position:absolute;top:16px;bottom:7px;left:15px}.H02TPW_nestedSection+.H02TPW_nestedSection{margin-top:2px}.H02TPW_listTopDropIndicator,.H02TPW_groupSection.H02TPW_workspaceDropBefore:before,.H02TPW_groupSection.H02TPW_workspaceDropAfter:after{content:\"\";z-index:1;background:linear-gradient(55deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat, linear-gradient(125deg, transparent calc(50% - 1px), var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat, linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;pointer-events:none;height:12px;position:absolute;left:0;right:0}.H02TPW_listTopDropIndicator{top:-8px;left:0;right:var(--dsh-session-list-edge-inset)}.H02TPW_listTopDropActive>.H02TPW_workspaceDropBefore:first-child:before{display:none}.H02TPW_groupSection.H02TPW_workspaceDropBefore:before{top:-8px}.H02TPW_groupSection.H02TPW_workspaceDropAfter:after{bottom:-8px}.H02TPW_sessionOverflowButton{cursor:pointer;text-align:left;width:100%;height:28px;color:var(--dsw-alias-label-tertiary);background:0 0;border:none;border-radius:8px;padding:0 12px 0 28px;font-size:12px}.H02TPW_groupSection>.H02TPW_sessionOverflowButton{margin-top:0}.H02TPW_sessionOverflowButton:hover{color:var(--dsw-alias-label-secondary);background:0 0}.H02TPW_empty{color:var(--dsw-alias-label-tertiary);padding:16px 12px;font-size:13px}.H02TPW_renameInput{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);width:100%;height:44px;color:var(--dsw-alias-label-primary);background:0 0;border-radius:22px;outline:none;padding:7px 14px;font-size:14px;font-weight:400;line-height:22px}.H02TPW_renameInput:disabled{color:var(--dsw-alias-label-dimmed)}.H02TPW_renameError{color:var(--dsw-alias-state-error-primary);margin-top:8px;font-size:12px;line-height:18px}.H02TPW_fieldLabel{color:var(--dsw-alias-label-secondary);margin:12px 0 6px;font-size:12px;line-height:18px}.H02TPW_fieldLabel:first-child{margin-top:-10px}.H02TPW_fieldHint{color:var(--dsw-alias-label-tertiary);margin-top:6px;font-size:12px;line-height:18px}.H02TPW_comboRow{display:flex;position:relative}.H02TPW_comboRow .H02TPW_renameInput{flex:1;min-width:0;padding-right:40px}.H02TPW_comboButton{corner-shape:round;cursor:pointer;width:32px;height:32px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:50%;right:5px;transform:translateY(-50%)}.H02TPW_footerHint{color:var(--dsw-alias-label-tertiary);margin-right:auto;font-size:12px;line-height:18px}.H02TPW_comboButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.H02TPW_deleteAction:not(:disabled){color:var(--dsw-alias-state-error-primary)}.H02TPW_deleteStatus{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.H02TPW_deleteCheck{color:var(--dsw-alias-label-primary);margin-top:10px;font-size:13px;line-height:20px;display:flex}@media (prefers-reduced-motion:reduce){.H02TPW_wide{animation:none}.H02TPW_search,.H02TPW_sectionLabel,.H02TPW_searchSlot,.H02TPW_searchInput,.H02TPW_headerActions{transition:none}}";
		const tagId = "dsh-left-panel/WorkspaceBrowser.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-left-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WorkspaceBrowser_module_css_default = {
			"activeArrow": "H02TPW_activeArrow",
			"activeArrowOpen": "H02TPW_activeArrowOpen",
			"activeChevron": "H02TPW_activeChevron",
			"activeHeader": "H02TPW_activeHeader",
			"activeHeaderName": "H02TPW_activeHeaderName",
			"clearButton": "H02TPW_clearButton",
			"comboButton": "H02TPW_comboButton",
			"comboRow": "H02TPW_comboRow",
			"deleteAction": "H02TPW_deleteAction",
			"deleteCheck": "H02TPW_deleteCheck",
			"deleteStatus": "H02TPW_deleteStatus",
			"empty": "H02TPW_empty",
			"fieldHint": "H02TPW_fieldHint",
			"fieldLabel": "H02TPW_fieldLabel",
			"flatList": "H02TPW_flatList",
			"footerHint": "H02TPW_footerHint",
			"groupSection": "H02TPW_groupSection",
			"headerActions": "H02TPW_headerActions",
			"headerActionsHidden": "H02TPW_headerActionsHidden",
			"iconButton": "H02TPW_iconButton",
			"list": "H02TPW_list",
			"listArea": "H02TPW_listArea",
			"listTopDropActive": "H02TPW_listTopDropActive",
			"listTopDropIndicator": "H02TPW_listTopDropIndicator",
			"nestedSection": "H02TPW_nestedSection",
			"projectArea": "H02TPW_projectArea",
			"rail": "H02TPW_rail",
			"renameError": "H02TPW_renameError",
			"renameInput": "H02TPW_renameInput",
			"root": "H02TPW_root",
			"search": "H02TPW_search",
			"searchButton": "H02TPW_searchButton",
			"searchExpanded": "H02TPW_searchExpanded",
			"searchInput": "H02TPW_searchInput",
			"searchSlot": "H02TPW_searchSlot",
			"searchSlotExpanded": "H02TPW_searchSlotExpanded",
			"searchStatus": "H02TPW_searchStatus",
			"searchTree": "H02TPW_searchTree",
			"searchWarning": "H02TPW_searchWarning",
			"sectionHeader": "H02TPW_sectionHeader",
			"sectionLabel": "H02TPW_sectionLabel",
			"sectionLabelHidden": "H02TPW_sectionLabelHidden",
			"sessionOverflowButton": "H02TPW_sessionOverflowButton",
			"treeBody": "H02TPW_treeBody",
			"treeGuides": "H02TPW_treeGuides",
			"wide": "H02TPW_wide",
			"wide-in": "H02TPW_wide-in",
			"workspaceDropAfter": "H02TPW_workspaceDropAfter",
			"workspaceDropBefore": "H02TPW_workspaceDropBefore"
		};
		//#endregion
		//#region src/client/rows/WorkspaceBrowser.tsx
		/**
		* Derived from @deepseek-ai/dsh-client-ui-workspace 0.1.6-alpha.2 (MIT License,
		* Copyright (c) 2026 DeepSeek). Adapted for dsh-left-panel: repositories
		* group their worktrees and Workspace registration follows git.
		*/
		/**
		* The workspace/session browsing region filling the sidebar shell's
		* `sidebar.workspaces` hole: section header (title + view options + add
		* workspace), search, the grouped tree or flat list, and the workspace
		* dialogs. Wide state renders the full browser; rail state renders the two
		* region icons (search / add workspace) as 36px controls on the shell's shared
		* rail entry path, each requesting expansion through the owner share. Adding
		* is the header button's one action, so it raises the directory flow with no
		* menu in between; the flow and its error dialog live in WorkspacePicker
		* (same package — direct composition, no slot between them).
		*/
		/**
		* Column slide length (--ds-transition-duration-slow): rail-search focus waits it out —
		* focus() forces a synchronous layout and would jank the slide.
		*/
		const EXPAND_SLIDE_MS = 300;
		/** Pause between the latest keystroke and a Host content-search request. */
		const SEARCH_DEBOUNCE_MS = 250;
		/** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
		const SEARCH_QUERY_MAX_CODE_UNITS = 500;
		/** Session rows visible per Workspace before the local overflow control. */
		const COLLAPSED_SESSION_LIMIT = 5;
		const DEFAULT_PROJECT_AREA_KEY = "project-area:default";
		function projectAreaExpansionKey(id) {
			return `project-area:${id}`;
		}
		/** The worktree a registered Workspace id maps to, if it is one. */
		function worktreeOfWorkspace(snapshot, workspaceId) {
			if (workspaceId === void 0) return void 0;
			for (const repo of snapshot.repos) {
				const found = repo.worktrees.find((worktree) => worktree.workspaceId === workspaceId);
				if (found !== void 0) return found;
			}
		}
		/** Fold one Workspace without charging its provisional New Session against the ordinary-row limit. */
		function collapsedSessionRows(sessions) {
			let ordinaryCount = 0;
			const rows = sessions.filter((session) => {
				if (session.blank && session.title === "") return true;
				if (ordinaryCount >= COLLAPSED_SESSION_LIMIT) return false;
				ordinaryCount += 1;
				return true;
			});
			return {
				rows,
				hiddenCount: sessions.length - rows.length
			};
		}
		/** Keep controlled input and RPC payload inside the session.search wire contract. */
		function sanitizeSearchQuery(value) {
			const withoutNul = value.replaceAll("\0", "");
			if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul;
			let end = SEARCH_QUERY_MAX_CODE_UNITS;
			const last = withoutNul.charCodeAt(end - 1);
			const next = withoutNul.charCodeAt(end);
			if (last >= 55296 && last <= 56319 && next >= 56320 && next <= 57343) end--;
			return withoutNul.slice(0, end);
		}
		/** Immutable membership toggle for the local expand-all array. */
		function toggled(list, key) {
			return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
		}
		/**
		* Accept the native drag at document level while a row drag is active: row
		* hover still owns the insertion marker, and releasing outside the list must
		* not be rendered as a rejected drop before dragend commits that last marker.
		*/
		function useNativeDragAcceptance(active) {
			(0, react.useEffect)(() => {
				if (!active) return;
				const acceptDrag = (event) => {
					event.preventDefault();
					if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "move";
				};
				const acceptDrop = (event) => {
					event.preventDefault();
				};
				document.addEventListener("dragover", acceptDrag);
				document.addEventListener("drop", acceptDrop);
				return () => {
					document.removeEventListener("dragover", acceptDrag);
					document.removeEventListener("drop", acceptDrop);
				};
			}, [active]);
		}
		/** Reconcile a stored view order with the Workspace's current session account. */
		function reconciledSessionOrder(sessionIds, stored) {
			if (stored === void 0) return [...sessionIds];
			const byId = new Map(sessionIds.map((id) => [id, id]));
			const ordered = [];
			const included = /* @__PURE__ */ new Set();
			for (const key of stored) {
				const id = byId.get(key);
				if (id === void 0 || included.has(key)) continue;
				ordered.push(id);
				included.add(key);
			}
			for (const id of sessionIds) {
				if (included.has(id)) continue;
				ordered.push(id);
			}
			return ordered;
		}
		/** Newest update first with stable Session identity as the tie-break. */
		function compareSessionRecency(a, b, byId) {
			const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY;
			const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY;
			if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt;
			return a < b ? -1 : 1;
		}
		/** Reconcile one editable order account and apply its activity-promotion policy. */
		function nextSessionOrderAccount({ sessionIds, previousOrder, previousUpdatedAt, list, orderBy, sortByRecency }) {
			let order = reconciledSessionOrder(sessionIds, previousOrder);
			if (sortByRecency) order.sort((a, b) => compareSessionRecency(a, b, list.byId));
			else if (orderBy === "updated") {
				const promoted = sessionIds.filter((id) => {
					const session = list.byId[id];
					return session !== void 0 && (previousUpdatedAt[id] === void 0 || session.updatedAt > previousUpdatedAt[id]);
				}).sort((a, b) => compareSessionRecency(a, b, list.byId));
				if (promoted.length > 0) {
					const promotedIds = new Set(promoted);
					order = [...promoted, ...order.filter((id) => !promotedIds.has(id))];
				}
			}
			const updatedAt = {};
			for (const id of sessionIds) {
				const session = list.byId[id];
				if (session !== void 0) updatedAt[id] = session.updatedAt;
			}
			const orderChanged = previousOrder === void 0 || order.length !== previousOrder.length || order.some((id, index) => id !== previousOrder[index]);
			const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp);
			return {
				order,
				updatedAt,
				changed: orderChanged || timestampsChanged
			};
		}
		/** Grouping and ordering menu; own open state so it resets with the wide chrome. */
		function ViewOptionsMenu({ groupBy, orderBy, showActive, showTreeGuides, onGroupPick, onOrderPick, onActiveToggle, onTreeGuidesToggle, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				onClose: () => {
					setOpen(false);
				},
				items: [
					{
						type: "label",
						id: "group-by",
						text: t("groupBy.label")
					},
					{
						id: "workspace",
						label: t("groupBy.workspace")
					},
					{
						id: "flat",
						label: t("groupBy.flat")
					},
					{
						type: "separator",
						id: "order-by-separator"
					},
					{
						type: "label",
						id: "order-by",
						text: t("orderBy.label")
					},
					{
						id: "manual",
						label: t("orderBy.manual")
					},
					{
						id: "updated",
						label: t("orderBy.updated")
					},
					{
						type: "separator",
						id: "active-separator"
					},
					{
						id: "active-sessions",
						label: t("viewOptions.activeSessions")
					},
					{
						id: "tree-guides",
						label: t("viewOptions.treeGuides")
					}
				],
				selectedIds: [
					groupBy,
					orderBy,
					...showActive ? ["active-sessions"] : [],
					...showTreeGuides ? ["tree-guides"] : []
				],
				onSelect: (id) => {
					if (id === "workspace" || id === "flat") onGroupPick(id);
					else if (id === "manual" || id === "updated") onOrderPick(id);
					else if (id === "active-sessions") onActiveToggle();
					else if (id === "tree-guides") onTreeGuidesToggle();
					setOpen(false);
				},
				align: "end",
				dense: true,
				portal: true,
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("viewOptions.label"),
					side: "bottom",
					delayMs: 500,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: clsx(WorkspaceBrowser_module_css_default.iconButton, WorkspaceBrowser_module_css_default.wide),
						"aria-label": t("viewOptions.label"),
						onClick: () => {
							setOpen((v) => !v);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutlineRegular, {})
					})
				})
			});
		}
		/** Resolve an insertion side from the full rendered workspace group. */
		function workspaceGroupHalf(e) {
			const rect = e.currentTarget.getBoundingClientRect();
			return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
		}
		/** The scrolling session tree; unmounting drops the sessions subscription and expand-all state. */
		function SessionTree({ useSessions, useSessionStatus, startSession, open, forkSession, workspaces, archivedSessionIds, workspaceReady, usePanelInfo, onRenameRequest, onBranchRenameRequest, onDeleteRequest, onRepoDeleteRequest, onSessionRename, onSessionArchive, onRepoRenameRequest, onRepoCreateWorktree, insertWorkspaceBefore, insertSessionBefore, orderBy, showActiveSessions, activeSessionsCollapsed, onActiveSessionsToggle, showTreeGuides, activeSchedules, groupExpansion, setGroupExpanded, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, home, t, revealSessionId, onSessionRevealed, onSessionRevealRequest, flashSessionId, snapshot, worktrees, projectAreas, onProjectAreaRenameRequest, onProjectAreaDissolve, onRepoProjectAreaChange, onProjectAreaOrderChange }) {
			const panelActive = usePanelInfo((info) => info.activePanelId !== null);
			const list = useSessions((s) => s);
			const statuses = useSessionStatus((s) => s);
			const current = panelActive ? void 0 : mainSessionId(list);
			const revealGroup = revealSessionId === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, revealSessionId);
			const [expandedSessionGroups, setExpandedSessionGroups] = (0, react.useState)([]);
			const [drag, setDrag] = (0, react.useState)(null);
			const sessionDropCommitted = (0, react.useRef)(false);
			const [workspaceDrag, setWorkspaceDrag] = (0, react.useState)(null);
			const workspaceDropCommitted = (0, react.useRef)(false);
			const [projectAreaDrag, setProjectAreaDrag] = (0, react.useState)(null);
			const projectAreaDropCommitted = (0, react.useRef)(false);
			const previousOrderBy = (0, react.useRef)(orderBy);
			useNativeDragAcceptance(drag !== null || workspaceDrag !== null || projectAreaDrag !== null);
			const currentGroup = current === void 0 || !workspaceReady ? void 0 : owningGroupKey(workspaces, current);
			(0, react.useEffect)(() => {
				if (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;
				setGroupExpanded(currentGroup, true);
			}, [
				current,
				currentGroup,
				setGroupExpanded,
				groupExpansion
			]);
			const expandedGroups = (0, react.useMemo)(() => Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key), [groupExpansion]);
			const ungroupedSessionIds = (0, react.useMemo)(() => {
				const accounted = new Set(workspaces.flatMap((workspace) => workspace.sessionIds));
				return list.ids.filter((id) => list.byId[id] !== void 0 && !accounted.has(id));
			}, [list, workspaces]);
			(0, react.useEffect)(() => {
				if (list.phase !== "ready") return;
				const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
				previousOrderBy.current = orderBy;
				const accounts = [...workspaces.map((workspace) => ({
					key: workspace.workspaceId,
					sessionIds: workspace.sessionIds.filter((id) => list.byId[id] !== void 0)
				})), {
					key: "",
					sessionIds: ungroupedSessionIds
				}];
				for (const { key, sessionIds } of accounts) {
					const previousOrder = sessionOrderByAccount[key];
					const next = nextSessionOrderAccount({
						sessionIds,
						previousOrder,
						previousUpdatedAt: sessionUpdatedAtByAccount[key] ?? {},
						list,
						orderBy,
						sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
					});
					if (next.changed) syncSessionOrderAccount(key, next.order.map((id) => id), next.updatedAt);
				}
			}, [
				list,
				orderBy,
				sessionOrderByAccount,
				sessionUpdatedAtByAccount,
				syncSessionOrderAccount,
				ungroupedSessionIds,
				workspaces
			]);
			const orderedWorkspaces = (0, react.useMemo)(() => {
				return workspaces.map((workspace) => {
					const stored = sessionOrderByAccount[workspace.workspaceId];
					const sessionIds = reconciledSessionOrder(workspace.sessionIds, stored);
					return {
						...workspace,
						sessionIds
					};
				});
			}, [sessionOrderByAccount, workspaces]);
			const orderedUngroupedSessionIds = (0, react.useMemo)(() => reconciledSessionOrder(ungroupedSessionIds, sessionOrderByAccount[""]), [sessionOrderByAccount, ungroupedSessionIds]);
			const groups = (0, react.useMemo)(() => deriveGroups(list, orderedWorkspaces, archivedSessionIds, statuses, activeSchedules, {
				expandedGroups,
				...sessionOrderByAccount[""] === void 0 ? {} : { ungroupedOrder: sessionOrderByAccount[""] }
			}), [
				list,
				orderedWorkspaces,
				archivedSessionIds,
				statuses,
				activeSchedules,
				expandedGroups,
				sessionOrderByAccount
			]);
			const sections = (0, react.useMemo)(() => arrangeSections(groups, snapshot, groupExpansion), [
				groups,
				snapshot,
				groupExpansion
			]);
			const activeSessions = (0, react.useMemo)(() => showActiveSessions ? deriveActive(list, archivedSessionIds, statuses, activeSchedules) : [], [
				showActiveSessions,
				list,
				archivedSessionIds,
				statuses,
				activeSchedules
			]);
			const recencyByGroup = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				const note = (key, sessionIds) => {
					let best = Number.NEGATIVE_INFINITY;
					for (const id of sessionIds) {
						const updatedAt = list.byId[id]?.updatedAt;
						if (updatedAt !== void 0 && updatedAt > best) best = updatedAt;
					}
					map.set(key, best);
				};
				for (const workspace of workspaces) note(workspace.workspaceId, workspace.sessionIds);
				note("", ungroupedSessionIds);
				return map;
			}, [
				list,
				workspaces,
				ungroupedSessionIds
			]);
			const groupRecency = (key) => recencyByGroup.get(key) ?? Number.NEGATIVE_INFINITY;
			const sectionRecency = (section) => section.kind === "group" ? groupRecency(section.group.key) : section.groups.reduce((best, group) => Math.max(best, groupRecency(group.key)), Number.NEGATIVE_INFINITY);
			const orderedSections = (0, react.useMemo)(() => orderBy === "updated" ? sections.map((section) => section.kind !== "repo" ? section : {
				...section,
				groups: [...section.groups].sort((a, b) => groupRecency(b.key) - groupRecency(a.key))
			}) : sections, [
				sections,
				orderBy,
				recencyByGroup
			]);
			const warnRejected = (what) => (reason) => {
				console.warn(`${what} rejected:`, reason);
			};
			const areaByRepo = /* @__PURE__ */ new Map();
			for (const area of projectAreas) for (const repoKey of area.repoKeys) if (!areaByRepo.has(repoKey)) areaByRepo.set(repoKey, area.id);
			(0, react.useEffect)(() => {
				if (revealGroup === void 0) return;
				const repoKey = snapshot.workspaceRepo[revealGroup];
				const keys = [
					revealGroup,
					...repoKey === void 0 ? [] : [repoGroupKey(repoKey)],
					...repoKey === void 0 || areaByRepo.get(repoKey) === void 0 ? [] : [projectAreaExpansionKey(areaByRepo.get(repoKey))]
				];
				for (const key of keys) if (groupExpansion[key] !== true) setGroupExpanded(key, true);
			}, [
				groupExpansion,
				revealGroup,
				setGroupExpanded,
				snapshot,
				areaByRepo
			]);
			(0, react.useEffect)(() => {
				if (revealSessionId === void 0 || revealGroup === void 0) return;
				const group = groups.find((candidate) => candidate.key === revealGroup);
				if (group === void 0 || !group.expanded || !group.sessions.some((row) => row.id === revealSessionId)) return;
				if (collapsedSessionRows(group.sessions).rows.some((row) => row.id === revealSessionId)) return;
				setExpandedSessionGroups((keys) => keys.includes(revealGroup) ? keys : [...keys, revealGroup]);
			}, [
				groups,
				revealGroup,
				revealSessionId
			]);
			const now = Date.now();
			const commitSessionDrag = (activeDrag, over) => {
				if (sessionDropCommitted.current) return;
				sessionDropCommitted.current = true;
				setDrag(null);
				const group = groups.find((candidate) => candidate.key === activeDrag.accountKey);
				if (group === void 0) return;
				const sessionsExpanded = expandedSessionGroups.includes(group.key);
				const renderedSessions = sessionsExpanded ? group.sessions : collapsedSessionRows(group.sessions).rows;
				const targetIndex = renderedSessions.findIndex((session) => session.id === over.id);
				if (targetIndex === -1) return;
				const sourceIndex = renderedSessions.findIndex((session) => session.id === activeDrag.sessionId);
				if (over.id === activeDrag.sessionId) return;
				const withoutSource = renderedSessions.filter((session) => session.id !== activeDrag.sessionId);
				const targetWithoutSourceIndex = withoutSource.findIndex((session) => session.id === over.id);
				if (targetWithoutSourceIndex === -1) return;
				const visibleInsertAt = over.half === "before" ? targetWithoutSourceIndex : targetWithoutSourceIndex + 1;
				if (sourceIndex !== -1 && visibleInsertAt === sourceIndex) return;
				const accountSessionIds = activeDrag.accountKey === "" ? orderedUngroupedSessionIds : orderedWorkspaces.find((workspace) => workspace.workspaceId === activeDrag.accountKey)?.sessionIds;
				if (accountSessionIds === void 0) return;
				const nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId);
				let anchor;
				if (sessionsExpanded) anchor = over.half === "before" ? over.id : renderedSessions[targetIndex + 1]?.id;
				else {
					const previousVisible = withoutSource[visibleInsertAt - 1]?.id;
					if (previousVisible === void 0) anchor = nextOrder[0];
					else {
						const previousIndex = nextOrder.indexOf(previousVisible);
						if (previousIndex === -1) return;
						anchor = nextOrder[previousIndex + 1];
					}
				}
				const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
				nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
				if (!sessionsExpanded && sourceIndex !== -1) {
					const nodes = new Map(group.sessions.map((node) => [node.id, node]));
					if (!collapsedSessionRows(nextOrder.flatMap((id) => {
						const node = nodes.get(id);
						return node === void 0 ? [] : [node];
					})).rows.some((node) => node.id === activeDrag.sessionId)) return;
				}
				setSessionOrder(activeDrag.accountKey, nextOrder.map((id) => id));
				if (orderBy === "updated" || activeDrag.accountKey === "") return;
				insertSessionBefore(activeDrag.accountKey, activeDrag.sessionId, anchor).catch((reason) => {
					console.warn("session reorder rejected:", reason);
				});
			};
			const commitWorkspaceDrag = (activeDrag, over) => {
				if (workspaceDropCommitted.current) return;
				workspaceDropCommitted.current = true;
				setWorkspaceDrag(null);
				const move = planWorkspaceMove(workspaces.map((workspace) => workspace.workspaceId), activeDrag.ids, over);
				if (move === void 0) return;
				(async () => {
					for (const id of move.ids) await insertWorkspaceBefore(id, move.anchor);
				})().catch((reason) => {
					console.warn("workspace reorder rejected:", reason);
				});
			};
			const commitProjectArea = (activeDrag, areaId) => {
				if (workspaceDropCommitted.current || activeDrag.projectKey === void 0) return;
				workspaceDropCommitted.current = true;
				setWorkspaceDrag(null);
				if (activeDrag.sourceAreaId !== areaId) onRepoProjectAreaChange(activeDrag.projectKey, areaId);
			};
			const commitProjectAreaOrder = (activeDrag, over) => {
				if (projectAreaDropCommitted.current) return;
				projectAreaDropCommitted.current = true;
				setProjectAreaDrag(null);
				const current = projectAreas.map((area) => area.id);
				const next = moveProjectAreaOrder(current, activeDrag.id, over.id, over.half);
				if (!next.every((id, index) => id === current[index])) onProjectAreaOrderChange(next);
			};
			/** One Workspace group: header row + expanded top-level session rows. */
			const renderGroup = (group, nested, repoKey) => {
				const workspaceId = group.workspaceId;
				const groupWorktree = nested ? worktreeOfWorkspace(snapshot, workspaceId) : void 0;
				const collapsed = collapsedSessionRows(group.sessions);
				const sessionsExpanded = expandedSessionGroups.includes(group.key);
				const workspaceMarker = workspaceId !== void 0 && workspaceDrag?.over?.ids.includes(workspaceId) ? workspaceDrag.over.half : null;
				const workspaceDragProps = workspaceId === void 0 || orderBy === "updated" ? void 0 : {
					start: () => {
						workspaceDropCommitted.current = false;
						setWorkspaceDrag({
							ids: [workspaceId],
							...nested ? { repoKey } : { sourceAreaId: null },
							over: null
						});
					},
					end: () => {
						if (workspaceDrag?.over !== null && workspaceDrag?.over !== void 0) commitWorkspaceDrag(workspaceDrag, workspaceDrag.over);
						else setWorkspaceDrag(null);
						workspaceDropCommitted.current = false;
					}
				};
				const acceptsWorkspaceDrag = workspaceId !== void 0 && workspaceDrag !== null && orderBy !== "updated" && workspaceDropAllowed(workspaceDrag.repoKey, nested ? repoKey : void 0);
				const hoverWorkspace = !acceptsWorkspaceDrag ? void 0 : (half) => {
					setWorkspaceDrag((active) => active === null ? active : {
						...active,
						over: {
							ids: [workspaceId],
							half
						}
					});
				};
				const dropWorkspace = !acceptsWorkspaceDrag ? void 0 : (half) => {
					if (workspaceDrag === null) return;
					commitWorkspaceDrag(workspaceDrag, {
						ids: [workspaceId],
						half
					});
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: clsx(WorkspaceBrowser_module_css_default.groupSection, nested && WorkspaceBrowser_module_css_default.nestedSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter),
					onDragOver: workspaceDrag === null || hoverWorkspace === void 0 ? void 0 : (e) => {
						e.preventDefault();
						if (nested) e.stopPropagation();
						e.dataTransfer.dropEffect = "move";
						hoverWorkspace(workspaceGroupHalf(e));
					},
					onDrop: workspaceDrag === null || dropWorkspace === void 0 ? void 0 : (e) => {
						e.preventDefault();
						if (nested) e.stopPropagation();
						dropWorkspace(workspaceGroupHalf(e));
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectRowItem, {
							group,
							home,
							t,
							nested,
							onToggle: () => {
								if (group.expanded) setExpandedSessionGroups((keys) => keys.filter((key) => key !== group.key));
								setGroupExpanded(group.key, !group.expanded);
							},
							onCreate: () => {
								if (group.workspaceId !== void 0) {
									setGroupExpanded(group.key, true);
									startSession(group.workspaceId);
								}
							},
							drag: workspaceDragProps,
							actions: group.workspaceId === void 0 ? void 0 : {
								rename: () => {
									if (group.workspaceId !== void 0) onRenameRequest(group.workspaceId, group.label);
								},
								...nested && groupWorktree?.branch != null ? { renameBranch: () => {
									onBranchRenameRequest(group.workspaceId, groupWorktree.branch);
								} } : {},
								delete: () => {
									onDeleteRequest(group.workspaceId, group.label);
								},
								deleteDisabled: nested && groupWorktree?.main === true
							}
						}),
						(sessionsExpanded ? group.sessions : collapsed.rows).map((node) => {
							const sameGroupDrag = drag !== null && drag.accountKey === group.key;
							const dragProps = {
								start: () => {
									sessionDropCommitted.current = false;
									setDrag({
										accountKey: group.key,
										sessionId: node.id,
										over: null
									});
								},
								active: sameGroupDrag,
								marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
								hover: (half) => {
									setDrag((d) => d === null ? d : {
										...d,
										over: {
											id: node.id,
											half
										}
									});
								},
								drop: (half) => {
									if (drag === null) return;
									commitSessionDrag(drag, {
										id: node.id,
										half
									});
								},
								end: () => {
									if (drag?.over !== null && drag?.over !== void 0) commitSessionDrag(drag, drag.over);
									else setDrag(null);
									sessionDropCommitted.current = false;
								}
							};
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionNodeItem, {
								node,
								currentId: current,
								now,
								onOpen: open,
								onRename: onSessionRename,
								onFork: forkSession,
								onArchive: onSessionArchive,
								onReveal: node.id === revealSessionId && group.key === revealGroup ? () => {
									onSessionRevealed(node.id);
								} : void 0,
								flash: node.id === flashSessionId,
								drag: dragProps,
								t
							}, node.id);
						}),
						collapsed.hiddenCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: WorkspaceBrowser_module_css_default.sessionOverflowButton,
							"aria-expanded": sessionsExpanded,
							onClick: () => {
								setExpandedSessionGroups((keys) => toggled(keys, group.key));
							},
							children: sessionsExpanded ? t("sessions.collapse") : t("sessions.expand", { n: collapsed.hiddenCount })
						})
					]
				}, group.key);
			};
			const sectionsByArea = new Map(projectAreas.map((area) => [area.id, []]));
			const defaultSections = [];
			for (const section of orderedSections) {
				if (section.kind !== "repo") {
					defaultSections.push(section);
					continue;
				}
				const areaId = areaByRepo.get(section.repo.key);
				const bucket = areaId === void 0 ? void 0 : sectionsByArea.get(areaId);
				if (bucket === void 0) defaultSections.push(section);
				else bucket.push(section);
			}
			if (orderBy === "updated") {
				defaultSections.sort((a, b) => sectionRecency(b) - sectionRecency(a));
				for (const bucket of sectionsByArea.values()) bucket.sort((a, b) => sectionRecency(b) - sectionRecency(a));
			}
			const renderTopSection = (section, areaId) => {
				if (section.kind === "group") return renderGroup(section.group, false);
				const anchorId = section.workspaceIds[0];
				const sectionMarker = workspaceDrag?.repoKey === void 0 && workspaceDrag?.sourceAreaId === areaId && anchorId !== void 0 && workspaceDrag?.over?.ids.includes(anchorId) ? workspaceDrag.over.half : null;
				const nodeDrag = anchorId === void 0 ? void 0 : {
					start: () => {
						workspaceDropCommitted.current = false;
						setWorkspaceDrag({
							ids: section.workspaceIds,
							projectKey: section.repo.key,
							sourceAreaId: areaId,
							over: null
						});
					},
					end: () => {
						if (workspaceDrag?.overAreaId !== void 0) commitProjectArea(workspaceDrag, workspaceDrag.overAreaId);
						else if (workspaceDrag?.over !== null && workspaceDrag?.over !== void 0) commitWorkspaceDrag(workspaceDrag, workspaceDrag.over);
						else setWorkspaceDrag(null);
						workspaceDropCommitted.current = false;
					}
				};
				const acceptsOrder = orderBy !== "updated" && workspaceDrag !== null && workspaceDrag.repoKey === void 0 && workspaceDrag.sourceAreaId === areaId && anchorId !== void 0;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: clsx(WorkspaceBrowser_module_css_default.groupSection, sectionMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, sectionMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter),
					onDragOver: !acceptsOrder ? void 0 : (e) => {
						e.preventDefault();
						e.dataTransfer.dropEffect = "move";
						const half = workspaceGroupHalf(e);
						setWorkspaceDrag((active) => active === null ? active : {
							...active,
							overAreaId: void 0,
							over: {
								ids: section.workspaceIds,
								half
							}
						});
					},
					onDrop: !acceptsOrder ? void 0 : (e) => {
						e.preventDefault();
						if (workspaceDrag !== null) commitWorkspaceDrag(workspaceDrag, {
							ids: section.workspaceIds,
							half: workspaceGroupHalf(e)
						});
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RepoRowItem, {
						section,
						home,
						t,
						drag: nodeDrag,
						onToggle: () => {
							setGroupExpanded(section.key, !section.expanded);
						},
						onRefresh: () => {
							worktrees.refresh().catch(warnRejected("worktree refresh"));
						},
						onRename: () => {
							onRepoRenameRequest(section.repo.key, section.repo.name);
						},
						onDelete: () => {
							onRepoDeleteRequest(section.repo.key, section.repo.name, section.workspaceIds);
						},
						onRestore: (path) => {
							worktrees.restoreWorkspace(path).catch(warnRejected("workspace restore"));
						},
						onCreateWorktree: () => {
							onRepoCreateWorktree(section.repo.key);
						}
					}), section.expanded && section.groups.map((group) => renderGroup(group, true, section.repo.key))]
				}, section.key);
			};
			const renderAreaHeader = (area) => {
				const areaId = area?.id ?? null;
				const expansionKey = area === null ? DEFAULT_PROJECT_AREA_KEY : projectAreaExpansionKey(area.id);
				const expanded = groupExpansion[expansionKey] ?? true;
				const canAccept = projectAreaDrag === null && workspaceDrag?.projectKey !== void 0 && workspaceDrag.sourceAreaId !== areaId;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectAreaHeader, {
					name: area?.name ?? t("area.default"),
					expanded,
					active: workspaceDrag?.overAreaId === areaId,
					drag: area === null ? void 0 : {
						active: projectAreaDrag !== null,
						marker: projectAreaDrag?.over?.id === area.id ? projectAreaDrag.over.half : null,
						start: () => {
							projectAreaDropCommitted.current = false;
							setProjectAreaDrag({
								id: area.id,
								over: null
							});
						},
						hover: (half) => {
							setProjectAreaDrag((current) => current === null ? current : {
								...current,
								over: {
									id: area.id,
									half
								}
							});
						},
						drop: (half) => {
							if (projectAreaDrag !== null) commitProjectAreaOrder(projectAreaDrag, {
								id: area.id,
								half
							});
						},
						end: () => {
							if (projectAreaDrag?.over !== null && projectAreaDrag?.over !== void 0) commitProjectAreaOrder(projectAreaDrag, projectAreaDrag.over);
							else setProjectAreaDrag(null);
							projectAreaDropCommitted.current = false;
						}
					},
					onToggle: () => {
						setGroupExpanded(expansionKey, !expanded);
					},
					t,
					...area === null ? {} : {
						onRename: () => {
							onProjectAreaRenameRequest(area.id, area.name);
						},
						onDissolve: () => {
							onProjectAreaDissolve(area.id);
						}
					},
					onDragOver: !canAccept ? void 0 : (e) => {
						e.preventDefault();
						e.dataTransfer.dropEffect = "move";
						setWorkspaceDrag((active) => active === null ? active : {
							...active,
							over: null,
							overAreaId: areaId
						});
					},
					onDrop: !canAccept ? void 0 : (e) => {
						e.preventDefault();
						if (workspaceDrag !== null) commitProjectArea(workspaceDrag, areaId);
					}
				}, area?.id ?? "__default_project_area__");
			};
			const firstRowId = (() => {
				const first = orderedSections[0];
				if (first === void 0) return void 0;
				return first.kind === "group" ? first.group.workspaceId : first.workspaceIds[0];
			})();
			const workspaceDropAtListStart = orderBy !== "updated" && firstRowId !== void 0 && workspaceDrag?.repoKey === void 0 && workspaceDrag?.over?.ids[0] === firstRowId && workspaceDrag.over.half === "before";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
				children: [workspaceDropAtListStart && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: WorkspaceBrowser_module_css_default.listTopDropIndicator,
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: clsx(WorkspaceBrowser_module_css_default.list, showTreeGuides && WorkspaceBrowser_module_css_default.treeGuides, workspaceDropAtListStart && WorkspaceBrowser_module_css_default.listTopDropActive),
					role: "tree",
					"aria-label": t("section.sessions"),
					children: [
						activeSessions.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WorkspaceBrowser_module_css_default.groupSection,
							role: "group",
							"aria-label": t("activeSessions.label"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: WorkspaceBrowser_module_css_default.activeHeader,
								role: "button",
								tabIndex: 0,
								"aria-expanded": !activeSessionsCollapsed,
								onClick: onActiveSessionsToggle,
								onKeyDown: (event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									onActiveSessionsToggle();
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: WorkspaceBrowser_module_css_default.activeHeaderName,
									children: t("activeSessions.label")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: WorkspaceBrowser_module_css_default.activeChevron,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: clsx(WorkspaceBrowser_module_css_default.activeArrow, !activeSessionsCollapsed && WorkspaceBrowser_module_css_default.activeArrowOpen) })
								})]
							}), !activeSessionsCollapsed && activeSessions.map((node) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionNodeItem, {
								node,
								currentId: current,
								now,
								onOpen: (id) => {
									onSessionRevealRequest?.(id);
									open(id);
								},
								onRename: onSessionRename,
								onFork: forkSession,
								onArchive: onSessionArchive,
								t
							}, node.id))]
						}),
						groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.empty,
							children: t("empty.none")
						}),
						projectAreas.length === 0 ? defaultSections.map((section) => renderTopSection(section, null)) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [projectAreas.map((area) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WorkspaceBrowser_module_css_default.projectArea,
							children: [renderAreaHeader(area), (groupExpansion[projectAreaExpansionKey(area.id)] ?? true) && (sectionsByArea.get(area.id) ?? []).map((section) => renderTopSection(section, area.id))]
						}, area.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: WorkspaceBrowser_module_css_default.projectArea,
							children: [renderAreaHeader(null), (groupExpansion[DEFAULT_PROJECT_AREA_KEY] ?? true) && defaultSections.map((section) => renderTopSection(section, null))]
						})] })
					]
				})]
			});
		}
		/** The flat "In one list" body: every session is one draggable top-level row. */
		function FlatList({ useSessions, useSessionStatus, open, forkSession, onSessionRename, onSessionArchive, archivedSessionIds, usePanelInfo, orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, activeSchedules, revealSessionId, onSessionRevealed, t }) {
			const panelActive = usePanelInfo((info) => info.activePanelId !== null);
			const list = useSessions((s) => s);
			const statuses = useSessionStatus((s) => s);
			const baseRows = (0, react.useMemo)(() => deriveFlat(list, archivedSessionIds, statuses, activeSchedules), [
				list,
				archivedSessionIds,
				statuses,
				activeSchedules
			]);
			const sessionIds = (0, react.useMemo)(() => baseRows.map((row) => row.id), [baseRows]);
			const previousOrderBy = (0, react.useRef)(orderBy);
			(0, react.useEffect)(() => {
				if (list.phase !== "ready") return;
				const previousOrder = sessionOrderByAccount[FLAT_SESSION_ORDER_KEY];
				const previousUpdatedAt = sessionUpdatedAtByAccount["__flat_session_order__"] ?? {};
				const switchedToUpdated = previousOrderBy.current !== "updated" && orderBy === "updated";
				previousOrderBy.current = orderBy;
				const next = nextSessionOrderAccount({
					sessionIds,
					previousOrder,
					previousUpdatedAt,
					list,
					orderBy,
					sortByRecency: orderBy === "updated" && (previousOrder === void 0 || switchedToUpdated)
				});
				if (next.changed) syncSessionOrderAccount(FLAT_SESSION_ORDER_KEY, next.order.map((id) => id), next.updatedAt);
			}, [
				list,
				orderBy,
				sessionOrderByAccount,
				sessionUpdatedAtByAccount,
				sessionIds,
				syncSessionOrderAccount
			]);
			const rows = (0, react.useMemo)(() => {
				const byId = new Map(baseRows.map((row) => [row.id, row]));
				return reconciledSessionOrder(sessionIds, sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]).flatMap((id) => {
					const row = byId.get(id);
					return row === void 0 ? [] : [row];
				});
			}, [
				baseRows,
				sessionOrderByAccount,
				sessionIds
			]);
			const [drag, setDrag] = (0, react.useState)(null);
			const dropCommitted = (0, react.useRef)(false);
			useNativeDragAcceptance(drag !== null);
			const commitDrag = (activeDrag, over) => {
				if (dropCommitted.current) return;
				dropCommitted.current = true;
				setDrag(null);
				const targetIndex = rows.findIndex((row) => row.id === over.id);
				if (targetIndex === -1) return;
				const anchor = over.half === "before" ? over.id : rows[targetIndex + 1]?.id;
				if (anchor === activeDrag.sessionId) return;
				const sourceIndex = rows.findIndex((row) => row.id === activeDrag.sessionId);
				const anchorIndex = anchor === void 0 ? rows.length : rows.findIndex((row) => row.id === anchor);
				if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) return;
				const nextOrder = rows.map((row) => row.id).filter((id) => id !== activeDrag.sessionId);
				const insertAt = anchor === void 0 ? nextOrder.length : nextOrder.indexOf(anchor);
				nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId);
				setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder.map((id) => id));
			};
			const now = Date.now();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: clsx(WorkspaceBrowser_module_css_default.list, WorkspaceBrowser_module_css_default.flatList),
					role: "tree",
					"aria-label": t("section.sessions"),
					children: [rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WorkspaceBrowser_module_css_default.empty,
						children: t("empty.none")
					}), rows.map((node) => {
						const active = drag !== null;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionNodeItem, {
							node,
							currentId: panelActive ? void 0 : mainSessionId(list),
							now,
							onOpen: open,
							onRename: onSessionRename,
							onFork: forkSession,
							onArchive: onSessionArchive,
							onReveal: node.id === revealSessionId ? () => {
								onSessionRevealed(node.id);
							} : void 0,
							flat: true,
							drag: {
								start: () => {
									dropCommitted.current = false;
									setDrag({
										accountKey: FLAT_SESSION_ORDER_KEY,
										sessionId: node.id,
										over: null
									});
								},
								active,
								marker: active && drag.over?.id === node.id ? drag.over.half : null,
								hover: (half) => {
									setDrag((current) => current === null ? current : {
										...current,
										over: {
											id: node.id,
											half
										}
									});
								},
								drop: (half) => {
									if (drag !== null) commitDrag(drag, {
										id: node.id,
										half
									});
								},
								end: () => {
									if (drag?.over !== null && drag?.over !== void 0) commitDrag(drag, drag.over);
									else setDrag(null);
									dropCommitted.current = false;
								}
							},
							t
						}, node.id);
					})]
				})
			});
		}
		/** Flat search body: local metadata matches plus the current Host result page. */
		function SearchResults({ useSessions, useSessionStatus, open, onSessionRename, forkSession, onSessionArchive, workspaces, archivedSessionIds, query, remote, resultLimit, activeSchedules, usePanelInfo, t }) {
			const panelActive = usePanelInfo((info) => info.activePanelId !== null);
			const list = useSessions((s) => s);
			const statuses = useSessionStatus((s) => s);
			const currentRemote = remote.query === query ? remote : {
				query,
				status: "loading",
				items: [],
				hasMore: false
			};
			const results = (0, react.useMemo)(() => deriveSearchResults(list, workspaces, query, archivedSessionIds, statuses, activeSchedules, currentRemote, resultLimit), [
				list,
				workspaces,
				query,
				archivedSessionIds,
				statuses,
				activeSchedules,
				currentRemote,
				resultLimit
			]);
			const pending = currentRemote.status === "loading";
			const failed = currentRemote.status === "error";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: clsx(WorkspaceBrowser_module_css_default.treeBody, WorkspaceBrowser_module_css_default.wide),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: WorkspaceBrowser_module_css_default.list,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.searchTree,
							role: "tree",
							"aria-label": t("search.results.aria"),
							children: results.items.map((result) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchResultItem, {
								result,
								currentId: panelActive ? void 0 : mainSessionId(list),
								onOpen: open,
								onRename: onSessionRename,
								onFork: forkSession,
								onArchive: onSessionArchive,
								t
							}, result.id))
						}),
						pending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.searchStatus,
							role: "status",
							children: t("search.pending")
						}),
						failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.searchWarning,
							role: "status",
							children: t("search.unavailable")
						}),
						!pending && results.items.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.empty,
							children: t("search.noMatches")
						}),
						results.hasMore && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.searchStatus,
							children: t("search.hasMore", { n: resultLimit })
						})
					]
				})
			});
		}
		/**
		* Render the browsing region.
		* @param props - composed slot props (shell owner share + store + injected actions).
		* @returns the region element tree.
		*/
		function WorkspaceBrowser({ wide, usePanelInfo, expandSidebar, useSessions, useSessionStatus, useWorkspaces, useStore, actions, startSession, open, renameSession, forkSession, renameWorkspace, insertWorkspaceBefore, archiveSession, insertSessionBefore, createWorkspace, searchSessions, searchResultLimit, useHostInfo, useWorktrees, useScheduleCatalog, pickDirectory, worktrees, t }) {
			const home = useHostInfo((info) => info.home);
			const workspaces = useWorkspaces((state) => state.items);
			const workspacePhase = useWorkspaces((state) => state.phase);
			const workspaceStreamState = useWorkspaces((state) => state.state);
			const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds);
			const snapshot = useWorktrees((state) => state);
			const scheduleCatalog = useScheduleCatalog((entries) => entries);
			const activeSchedules = (0, react.useMemo)(() => activeScheduleSessionIds(scheduleCatalog), [scheduleCatalog]);
			const groupBy = useStore((s) => s.groupBy);
			const orderBy = useStore((s) => s.orderBy);
			const showActiveSessions = useStore((s) => s.showActiveSessions === true);
			const activeSessionsCollapsed = useStore((s) => s.activeSessionsCollapsed === true);
			const treeGuides = useStore((s) => s.treeGuides === true);
			const groupExpansion = useStore((s) => s.groupExpansion);
			const sessionOrderByAccount = useStore((s) => s.sessionOrderByAccount);
			const sessionUpdatedAtByAccount = useStore((s) => s.sessionUpdatedAtByAccount);
			const projectAreas = projectAreasOrEmpty(useStore((s) => s.projectAreas));
			const currentBlankSessionId = useSessions((state) => {
				const current = mainSessionId(state);
				return current !== void 0 && state.byId[current]?.blank === true ? current : void 0;
			});
			const currentBlankAccount = currentBlankSessionId === void 0 || workspacePhase !== "ready" ? void 0 : owningGroupKey(workspaces, currentBlankSessionId);
			const promotedBlank = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				if (currentBlankSessionId === void 0 || currentBlankAccount === void 0) {
					promotedBlank.current = void 0;
					return;
				}
				const promoted = promotedBlank.current;
				if (promoted !== void 0 && promoted.sessionId === currentBlankSessionId && promoted.accountKey === currentBlankAccount) return;
				promotedBlank.current = {
					sessionId: currentBlankSessionId,
					accountKey: currentBlankAccount
				};
				for (const accountKey of /* @__PURE__ */ new Set([currentBlankAccount, FLAT_SESSION_ORDER_KEY])) {
					const previous = sessionOrderByAccount[accountKey] ?? [];
					actions.setSessionOrder(accountKey, [currentBlankSessionId, ...previous.filter((id) => id !== currentBlankSessionId)]);
				}
			}, [
				actions.setSessionOrder,
				currentBlankAccount,
				currentBlankSessionId,
				sessionOrderByAccount
			]);
			(0, react.useEffect)(() => {
				if (workspacePhase !== "ready") return;
				actions.retainAccountKeys([
					"",
					FLAT_SESSION_ORDER_KEY,
					...workspaces.map((workspace) => workspace.workspaceId),
					...snapshot.repos.map((repo) => repoGroupKey(repo.key)),
					DEFAULT_PROJECT_AREA_KEY,
					...projectAreas.map((area) => projectAreaExpansionKey(area.id))
				]);
			}, [
				actions.retainAccountKeys,
				workspacePhase,
				workspaces,
				snapshot.repos,
				projectAreas
			]);
			const [query, setQuery] = (0, react.useState)("");
			const [searchExpanded, setSearchExpanded] = (0, react.useState)(false);
			const [revealSessionId, setRevealSessionId] = (0, react.useState)(void 0);
			const [flashSessionId, setFlashSessionId] = (0, react.useState)(void 0);
			const flashTimer = (0, react.useRef)(void 0);
			const requestSessionReveal = (sessionId) => {
				setRevealSessionId(sessionId);
				setFlashSessionId(sessionId);
				window.clearTimeout(flashTimer.current);
				flashTimer.current = window.setTimeout(() => {
					setFlashSessionId(void 0);
				}, 2e3);
			};
			const normalizedQuery = sanitizeSearchQuery(query).trim();
			const [remoteSearch, setRemoteSearch] = (0, react.useState)({
				query: "",
				status: "idle",
				items: [],
				hasMore: false
			});
			const searchRoot = (0, react.useRef)(null);
			const searchInput = (0, react.useRef)(null);
			const composingRef = (0, react.useRef)(false);
			const [addBusy, setAddBusy] = (0, react.useState)(false);
			const [addError, setAddError] = (0, react.useState)(null);
			const [pathPrompt, setPathPrompt] = (0, react.useState)(null);
			const adoptDirectory = (path) => {
				setAddBusy(true);
				setAddError(null);
				createWorkspace({ path }).then((workspace) => {
					setPathPrompt(null);
					startSession(workspace.workspaceId);
				}).catch((reason) => {
					setAddError(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					setAddBusy(false);
				});
			};
			const addWorkspace = () => {
				if (addBusy) return;
				setAddError(null);
				setAddBusy(true);
				pickDirectory().then((picked) => {
					setAddBusy(false);
					if (picked !== null) adoptDirectory(picked);
				}).catch(() => {
					setAddBusy(false);
					setPathPrompt("");
				});
			};
			const pathPromptTrimmed = (pathPrompt ?? "").trim();
			const [areaDialog, setAreaDialog] = (0, react.useState)(null);
			const [areaDraft, setAreaDraft] = (0, react.useState)("");
			const areaTrimmed = areaDraft.trim();
			const closeAreaDialog = () => {
				setAreaDialog(null);
				setAreaDraft("");
			};
			const confirmAreaDialog = () => {
				if (areaDialog === null || areaTrimmed === "") return;
				if (areaDialog.mode === "create") actions.createProjectArea(crypto.randomUUID(), areaTrimmed);
				else actions.renameProjectArea(areaDialog.id, areaTrimmed);
				closeAreaDialog();
			};
			const openSearchResult = (sessionId) => {
				setRevealSessionId(sessionId);
				setQuery("");
				setSearchExpanded(false);
				open(sessionId);
			};
			const acknowledgeSessionReveal = (sessionId) => {
				setRevealSessionId((current) => current === sessionId ? void 0 : current);
			};
			(0, react.useEffect)(() => {
				if (normalizedQuery !== "") setRevealSessionId(void 0);
			}, [normalizedQuery]);
			const [searchOnExpand, setSearchOnExpand] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (wide && searchOnExpand) {
					const timer = window.setTimeout(() => {
						searchInput.current?.focus({ preventScroll: true });
						setSearchOnExpand(false);
					}, EXPAND_SLIDE_MS);
					return () => {
						window.clearTimeout(timer);
					};
				}
			}, [wide, searchOnExpand]);
			(0, react.useEffect)(() => {
				if (!wide || !searchExpanded || searchOnExpand) return;
				searchInput.current?.focus({ preventScroll: true });
			}, [
				wide,
				searchExpanded,
				searchOnExpand
			]);
			(0, react.useEffect)(() => {
				if (!wide || !searchExpanded || searchOnExpand) return;
				const onClick = (event) => {
					if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) return;
					searchInput.current?.blur();
					if (normalizedQuery !== "") return;
					setSearchExpanded(false);
				};
				document.addEventListener("click", onClick);
				return () => {
					document.removeEventListener("click", onClick);
				};
			}, [
				normalizedQuery,
				wide,
				searchExpanded,
				searchOnExpand
			]);
			(0, react.useEffect)(() => {
				if (normalizedQuery === "") {
					setRemoteSearch({
						query: "",
						status: "idle",
						items: [],
						hasMore: false
					});
					return;
				}
				const controller = new AbortController();
				setRemoteSearch({
					query: normalizedQuery,
					status: "loading",
					items: [],
					hasMore: false
				});
				const timer = window.setTimeout(() => {
					searchSessions(normalizedQuery, controller.signal).then((result) => {
						if (controller.signal.aborted) return;
						setRemoteSearch({
							query: normalizedQuery,
							status: "ready",
							items: result.items,
							hasMore: result.hasMore
						});
					}).catch(() => {
						if (controller.signal.aborted) return;
						setRemoteSearch({
							query: normalizedQuery,
							status: "error",
							items: [],
							hasMore: false
						});
					});
				}, SEARCH_DEBOUNCE_MS);
				return () => {
					window.clearTimeout(timer);
					controller.abort();
				};
			}, [normalizedQuery, searchSessions]);
			const [renameTarget, setRenameTarget] = (0, react.useState)(null);
			const [renameDraft, setRenameDraft] = (0, react.useState)("");
			const [renaming, setRenaming] = (0, react.useState)(false);
			const [renameError, setRenameError] = (0, react.useState)(null);
			const renameTrimmed = renameDraft.trim();
			const renameRepoKey = renameTarget === null ? void 0 : snapshot.workspaceRepo[renameTarget.workspaceId];
			const renameDuplicate = renameTarget !== null && renameTrimmed !== "" && renameTrimmed !== renameTarget.currentTitle && workspaces.some((w) => w.workspaceId !== renameTarget.workspaceId && w.title === renameTrimmed && (renameRepoKey === void 0 || snapshot.workspaceRepo[w.workspaceId] === renameRepoKey));
			const renameBlocked = renaming || renameTrimmed === "" || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate;
			const closeRename = () => {
				if (renaming) return;
				setRenameTarget(null);
				setRenameError(null);
			};
			const confirmRename = () => {
				if (renameBlocked) return;
				setRenaming(true);
				setRenameError(null);
				(renameRepoKey === void 0 ? renameWorkspace(renameTarget.workspaceId, renameTrimmed) : worktrees.setWorkspaceTitle(renameTarget.workspaceId, renameTrimmed)).then(() => {
					setRenaming(false);
					setRenameTarget(null);
				}).catch((reason) => {
					setRenaming(false);
					setRenameError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			const [branchRenameTarget, setBranchRenameTarget] = (0, react.useState)(null);
			const [branchRenameDraft, setBranchRenameDraft] = (0, react.useState)("");
			const [branchRenaming, setBranchRenaming] = (0, react.useState)(false);
			const [branchRenameError, setBranchRenameError] = (0, react.useState)(null);
			const branchRenameTrimmed = branchRenameDraft.trim();
			const branchRenameBlocked = branchRenaming || branchRenameTrimmed === "" || branchRenameTarget === null || branchRenameTrimmed === branchRenameTarget.currentBranch;
			const closeBranchRename = () => {
				if (branchRenaming) return;
				setBranchRenameTarget(null);
				setBranchRenameError(null);
			};
			const confirmBranchRename = () => {
				if (branchRenameBlocked || branchRenameTarget === null) return;
				setBranchRenaming(true);
				setBranchRenameError(null);
				worktrees.renameBranch(branchRenameTarget.workspaceId, branchRenameTrimmed).then(() => {
					setBranchRenaming(false);
					setBranchRenameTarget(null);
				}).catch((reason) => {
					setBranchRenaming(false);
					setBranchRenameError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			const [sessionRenameTarget, setSessionRenameTarget] = (0, react.useState)(null);
			const [sessionRenameDraft, setSessionRenameDraft] = (0, react.useState)("");
			const [sessionRenaming, setSessionRenaming] = (0, react.useState)(false);
			const [sessionRenameError, setSessionRenameError] = (0, react.useState)(null);
			const sessionRenameTrimmed = sessionRenameDraft.trim();
			const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === "" || sessionRenameTarget === null;
			const closeSessionRename = () => {
				if (sessionRenaming) return;
				setSessionRenameTarget(null);
				setSessionRenameError(null);
			};
			const confirmSessionRename = () => {
				if (sessionRenameBlocked) return;
				setSessionRenaming(true);
				setSessionRenameError(null);
				renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
					setSessionRenaming(false);
					setSessionRenameTarget(null);
				}).catch((reason) => {
					setSessionRenaming(false);
					setSessionRenameError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			const onSessionRename = (sessionId, currentTitle) => {
				setSessionRenameTarget({
					sessionId,
					currentTitle
				});
				setSessionRenameDraft(currentTitle);
				setSessionRenameError(null);
			};
			const onSessionArchive = (sessionId) => {
				archiveSession(sessionId).catch((reason) => {
					console.warn("session archive rejected:", reason);
				});
			};
			const [repoRenameTarget, setRepoRenameTarget] = (0, react.useState)(null);
			const [repoRenameDraft, setRepoRenameDraft] = (0, react.useState)("");
			const [repoRenaming, setRepoRenaming] = (0, react.useState)(false);
			const [repoRenameError, setRepoRenameError] = (0, react.useState)(null);
			const repoRenameTrimmed = repoRenameDraft.trim();
			const closeRepoRename = () => {
				if (repoRenaming) return;
				setRepoRenameTarget(null);
				setRepoRenameError(null);
			};
			const confirmRepoRename = () => {
				/* v8 ignore next -- the Modal is absent without a target and its button is disabled while renaming. */
				if (repoRenameTarget === null || repoRenaming) return;
				setRepoRenaming(true);
				setRepoRenameError(null);
				worktrees.setRepoName(repoRenameTarget.repoKey, repoRenameTrimmed).then(() => {
					setRepoRenaming(false);
					setRepoRenameTarget(null);
				}).catch((reason) => {
					setRepoRenaming(false);
					setRepoRenameError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			const [worktreeDialog, setWorktreeDialog] = (0, react.useState)(null);
			const [worktreeOptions, setWorktreeOptions] = (0, react.useState)(null);
			const [branchDraft, setBranchDraft] = (0, react.useState)("");
			const [branchMenuOpen, setBranchMenuOpen] = (0, react.useState)(false);
			const [parentMenuOpen, setParentMenuOpen] = (0, react.useState)(false);
			const [pathParent, setPathParent] = (0, react.useState)(null);
			const [pathDraft, setPathDraft] = (0, react.useState)("");
			const [pathEdited, setPathEdited] = (0, react.useState)(false);
			const [creating, setCreating] = (0, react.useState)(false);
			const [createError, setCreateError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (worktreeDialog === null) return;
				const repoKey = worktreeDialog.repoKey;
				setWorktreeOptions({ status: "loading" });
				worktrees.branchOptions(repoKey).then((options) => {
					setWorktreeOptions({
						status: "ready",
						options
					});
				}).catch((reason) => {
					setWorktreeOptions({
						status: "error",
						message: reason instanceof Error ? reason.message : String(reason)
					});
				});
			}, [worktreeDialog, worktrees]);
			const options = worktreeOptions?.status === "ready" ? worktreeOptions.options : null;
			const branchTrimmed = branchDraft.trim();
			const worktreeParent = pathParent ?? options?.parents[0] ?? "";
			const suggestedPath = worktreeParent === "" || options === null || branchTrimmed === "" ? "" : `${worktreeParent === "/" ? "" : worktreeParent}/${options.dirName}-${branchTrimmed.replaceAll("/", "-")}`;
			const pathValue = pathEdited ? pathDraft : suggestedPath;
			const branchIsNew = options !== null && branchTrimmed !== "" && !options.availableBranches.includes(branchTrimmed);
			const branchChoices = options === null ? [] : options.availableBranches.filter((branch) => branch.toLowerCase().includes(branchTrimmed.toLowerCase()));
			const closeWorktreeDialog = () => {
				if (creating) return;
				setWorktreeDialog(null);
				setCreateError(null);
			};
			const confirmWorktreeCreate = () => {
				if (worktreeDialog === null || creating || branchTrimmed === "" || pathValue.trim() === "") return;
				setCreating(true);
				setCreateError(null);
				worktrees.createWorktree({
					repoKey: worktreeDialog.repoKey,
					branch: branchTrimmed,
					path: pathValue.trim()
				}).then(() => {
					setCreating(false);
					setWorktreeDialog(null);
				}).catch((reason) => {
					setCreating(false);
					setCreateError(reason instanceof Error ? reason.message : String(reason));
				});
			};
			const [deleteTarget, setDeleteTarget] = (0, react.useState)(null);
			const [deleting, setDeleting] = (0, react.useState)(false);
			const [deleteCommittedIds, setDeleteCommittedIds] = (0, react.useState)(null);
			const [deleteError, setDeleteError] = (0, react.useState)(null);
			const [deleteAlsoBranch, setDeleteAlsoBranch] = (0, react.useState)(false);
			const [deleteForce, setDeleteForce] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (deleteCommittedIds === null || workspaces.some((workspace) => deleteCommittedIds.includes(workspace.workspaceId))) return;
				setDeleting(false);
				setDeleteCommittedIds(null);
				setDeleteTarget(null);
				setDeleteAlsoBranch(false);
				setDeleteForce(false);
			}, [deleteCommittedIds, workspaces]);
			const deleteWorktree = deleteTarget?.kind === "workspace" ? worktreeOfWorkspace(snapshot, deleteTarget.workspaceId) : void 0;
			const deleteBranchOffered = deleteWorktree !== void 0 && !deleteWorktree.main && deleteWorktree.branch !== null;
			const closeDelete = () => {
				if (deleting) return;
				setDeleteTarget(null);
				setDeleteError(null);
				setDeleteAlsoBranch(false);
				setDeleteForce(false);
			};
			const confirmDelete = () => {
				/* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
				if (deleting || deleteTarget === null) return;
				setDeleting(true);
				setDeleteCommittedIds(null);
				setDeleteError(null);
				const target = deleteTarget;
				(target.kind === "repository" ? worktrees.deleteRepository(target.repoKey) : worktrees.deleteWorkspace(target.workspaceId, deleteBranchOffered && deleteAlsoBranch ? {
					deleteBranch: true,
					force: deleteForce
				} : void 0)).then(() => {
					setDeleteCommittedIds(target.kind === "repository" ? target.workspaceIds : [target.workspaceId]);
				}).catch((reason) => {
					setDeleting(false);
					const message = reason instanceof Error ? reason.message : String(reason);
					if (message.startsWith("left-panel/unsafe-delete")) {
						setDeleteForce(true);
						return;
					}
					setDeleteError(message);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(WorkspaceBrowser_module_css_default.root, !wide && WorkspaceBrowser_module_css_default.rail),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: WorkspaceBrowser_module_css_default.sectionHeader,
						children: [
							wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: clsx(WorkspaceBrowser_module_css_default.sectionLabel, WorkspaceBrowser_module_css_default.wide, searchExpanded && WorkspaceBrowser_module_css_default.sectionLabelHidden),
								children: groupBy === "flat" ? t("section.sessions") : t("section.workspaces")
							}),
							wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: clsx(WorkspaceBrowser_module_css_default.searchSlot, searchExpanded && WorkspaceBrowser_module_css_default.searchSlotExpanded),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									ref: searchRoot,
									className: clsx(WorkspaceBrowser_module_css_default.search, searchExpanded && WorkspaceBrowser_module_css_default.searchExpanded),
									onClick: () => {
										setSearchExpanded(true);
										searchInput.current?.focus();
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
											label: t("search"),
											side: "bottom",
											delayMs: 500,
											disabled: searchExpanded,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: WorkspaceBrowser_module_css_default.searchButton,
												"aria-label": t("search.sessions.aria"),
												"aria-expanded": searchExpanded,
												onClick: () => {
													setSearchExpanded(true);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: searchExpanded ? 11 : 14 })
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											ref: searchInput,
											className: WorkspaceBrowser_module_css_default.searchInput,
											type: "text",
											placeholder: t("search.placeholder"),
											maxLength: SEARCH_QUERY_MAX_CODE_UNITS,
											value: query,
											tabIndex: searchExpanded ? 0 : -1,
											onChange: (e) => {
												setQuery(sanitizeSearchQuery(e.target.value));
											},
											onKeyDown: (e) => {
												if (e.key !== "Escape") return;
												setQuery("");
												setSearchExpanded(false);
											}
										}),
										searchExpanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: WorkspaceBrowser_module_css_default.clearButton,
											"aria-label": t("search.clear"),
											onClick: (e) => {
												e.stopPropagation();
												setQuery("");
												setSearchExpanded(false);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFillRegular, {})
										})
									]
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: clsx(WorkspaceBrowser_module_css_default.headerActions, wide && searchExpanded && WorkspaceBrowser_module_css_default.headerActionsHidden),
								children: [
									wide && groupBy === "workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
										label: t("area.add"),
										side: "bottom",
										delayMs: 500,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: WorkspaceBrowser_module_css_default.iconButton,
											"aria-label": t("area.add"),
											onClick: () => {
												setAreaDraft("");
												setAreaDialog({ mode: "create" });
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutlineRegular, {})
										})
									}),
									wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {
										groupBy,
										orderBy,
										showActive: showActiveSessions,
										showTreeGuides: treeGuides,
										onGroupPick: (mode) => {
											actions.setGroupBy(mode);
										},
										onOrderPick: (mode) => {
											actions.setOrderBy(mode);
										},
										onActiveToggle: () => {
											actions.setShowActiveSessions(!showActiveSessions);
										},
										onTreeGuidesToggle: () => {
											actions.setTreeGuides(!treeGuides);
										},
										t
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
										label: t("workspace.add"),
										side: "bottom",
										delayMs: 500,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: WorkspaceBrowser_module_css_default.iconButton,
											"aria-label": t("workspace.add"),
											disabled: addBusy,
											onClick: addWorkspace,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconProjectAddOutlineRegular, { size: wide ? 16 : 18 })
										})
									})
								]
							})
						]
					}),
					!wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WorkspaceBrowser_module_css_default.search,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
							label: t("search"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WorkspaceBrowser_module_css_default.searchButton,
								"aria-label": t("search.sessions.aria"),
								onClick: () => {
									setSearchExpanded(true);
									setSearchOnExpand(true);
									expandSidebar();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 18 })
							})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: WorkspaceBrowser_module_css_default.listArea,
						children: wide && (normalizedQuery !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchResults, {
							usePanelInfo,
							useSessions,
							useSessionStatus,
							open: openSearchResult,
							onSessionRename,
							forkSession,
							onSessionArchive,
							workspaces,
							archivedSessionIds,
							query: normalizedQuery,
							remote: remoteSearch,
							resultLimit: searchResultLimit,
							activeSchedules,
							t
						}) : groupBy === "flat" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FlatList, {
							usePanelInfo,
							useSessions,
							useSessionStatus,
							open,
							forkSession,
							onSessionRename,
							onSessionArchive,
							archivedSessionIds,
							orderBy,
							sessionOrderByAccount,
							sessionUpdatedAtByAccount,
							syncSessionOrderAccount: actions.syncSessionOrderAccount,
							setSessionOrder: actions.setSessionOrder,
							activeSchedules,
							revealSessionId,
							onSessionRevealed: acknowledgeSessionReveal,
							t
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionTree, {
							usePanelInfo,
							useSessions,
							useSessionStatus,
							onSessionRename,
							onSessionArchive,
							forkSession,
							workspaces,
							workspaceReady: workspacePhase === "ready" && workspaceStreamState !== "loading",
							groupExpansion,
							setGroupExpanded: actions.setGroupExpanded,
							sessionOrderByAccount,
							sessionUpdatedAtByAccount,
							syncSessionOrderAccount: actions.syncSessionOrderAccount,
							setSessionOrder: actions.setSessionOrder,
							archivedSessionIds,
							activeSchedules,
							startSession,
							open,
							insertWorkspaceBefore,
							insertSessionBefore,
							orderBy,
							showActiveSessions,
							showTreeGuides: treeGuides,
							activeSessionsCollapsed,
							onActiveSessionsToggle: () => {
								actions.setActiveSessionsCollapsed(!activeSessionsCollapsed);
							},
							revealSessionId,
							onSessionRevealed: acknowledgeSessionReveal,
							onSessionRevealRequest: requestSessionReveal,
							flashSessionId,
							home,
							t,
							snapshot,
							worktrees,
							projectAreas,
							onProjectAreaRenameRequest: (areaId, currentName) => {
								setAreaDraft(currentName);
								setAreaDialog({
									mode: "rename",
									id: areaId
								});
							},
							onProjectAreaDissolve: (areaId) => {
								actions.dissolveProjectArea(areaId);
							},
							onRepoProjectAreaChange: (repoKey, areaId) => {
								actions.setRepoProjectArea(repoKey, areaId);
							},
							onProjectAreaOrderChange: (areaIds) => {
								actions.setProjectAreaOrder(areaIds);
							},
							onRenameRequest: (workspaceId, currentTitle) => {
								setRenameTarget({
									workspaceId,
									currentTitle,
									branch: worktreeOfWorkspace(snapshot, workspaceId)?.branch ?? void 0
								});
								setRenameDraft(currentTitle);
								setRenameError(null);
							},
							onBranchRenameRequest: (workspaceId, currentBranch) => {
								setBranchRenameTarget({
									workspaceId,
									currentBranch
								});
								setBranchRenameDraft(currentBranch);
								setBranchRenameError(null);
							},
							onDeleteRequest: (workspaceId, title) => {
								setDeleteTarget({
									kind: "workspace",
									workspaceId,
									title
								});
								setDeleteError(null);
								setDeleteAlsoBranch(false);
								setDeleteForce(false);
							},
							onRepoDeleteRequest: (repoKey, title, workspaceIds) => {
								setDeleteTarget({
									kind: "repository",
									repoKey,
									title,
									workspaceIds
								});
								setDeleteError(null);
								setDeleteAlsoBranch(false);
								setDeleteForce(false);
							},
							onRepoRenameRequest: (repoKey, currentName) => {
								setRepoRenameTarget({
									repoKey,
									currentName
								});
								setRepoRenameDraft(currentName);
								setRepoRenameError(null);
							},
							onRepoCreateWorktree: (repoKey) => {
								const repo = snapshot.repos.find((candidate) => candidate.key === repoKey);
								setWorktreeDialog({
									repoKey,
									repoName: repo?.name ?? repoKey
								});
								setBranchDraft("");
								setBranchMenuOpen(false);
								setParentMenuOpen(false);
								setPathParent(null);
								setPathDraft("");
								setPathEdited(false);
								setCreateError(null);
							}
						}))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: areaDialog !== null,
						onClose: closeAreaDialog,
						closeLabel: t("close"),
						title: t(areaDialog?.mode === "rename" ? "area.rename.title" : "area.create.title"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							onClick: closeAreaDialog,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: areaTrimmed === "",
							onClick: confirmAreaDialog,
							children: areaDialog?.mode === "rename" ? t("rename") : t("add.confirm")
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: WorkspaceBrowser_module_css_default.renameInput,
							value: areaDraft,
							"aria-label": t("field.areaName"),
							autoFocus: true,
							onFocus: (e) => {
								e.target.select();
							},
							onChange: (e) => {
								setAreaDraft(e.target.value);
							},
							onCompositionStart: () => {
								composingRef.current = true;
							},
							onCompositionEnd: () => {
								composingRef.current = false;
							},
							onKeyDown: (e) => {
								if (e.key === "Enter" && !composingRef.current) {
									e.preventDefault();
									confirmAreaDialog();
								}
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: renameTarget !== null,
						onClose: closeRename,
						closeLabel: t("close"),
						title: t("rename.workspace.title"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: renaming,
							onClick: closeRename,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: renameBlocked,
							onClick: confirmRename,
							children: t("rename")
						})] }),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: WorkspaceBrowser_module_css_default.comboRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: WorkspaceBrowser_module_css_default.renameInput,
									value: renameDraft,
									"aria-label": t("field.workspaceName"),
									autoFocus: true,
									disabled: renaming,
									onFocus: (e) => {
										e.target.select();
									},
									onChange: (e) => {
										setRenameDraft(e.target.value);
										setRenameError(null);
									},
									onCompositionStart: () => {
										composingRef.current = true;
									},
									onCompositionEnd: () => {
										composingRef.current = false;
									},
									onKeyDown: (e) => {
										if (e.key === "Enter" && !composingRef.current) {
											e.preventDefault();
											confirmRename();
										}
									}
								}), renameTarget?.branch != null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WorkspaceBrowser_module_css_default.comboButton,
									"aria-label": t("worktree.rename.reset"),
									title: t("worktree.rename.reset"),
									disabled: renaming || renameDraft === renameTarget.branch,
									onClick: () => {
										setRenameDraft(renameTarget.branch);
										setRenameError(null);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, {})
								})]
							}),
							renameDuplicate && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.renameError,
								role: "alert",
								children: t("conflict.named", { name: renameTrimmed })
							}),
							renameError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.renameError,
								role: "alert",
								children: renameError
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: branchRenameTarget !== null,
						onClose: closeBranchRename,
						closeLabel: t("close"),
						title: t("worktree.rename.branch"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: branchRenaming,
							onClick: closeBranchRename,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: branchRenameBlocked,
							onClick: confirmBranchRename,
							children: t("rename")
						})] }),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: WorkspaceBrowser_module_css_default.renameInput,
							value: branchRenameDraft,
							"aria-label": t("worktree.rename.branch.aria"),
							autoFocus: true,
							disabled: branchRenaming,
							onFocus: (e) => {
								e.target.select();
							},
							onChange: (e) => {
								setBranchRenameDraft(e.target.value);
								setBranchRenameError(null);
							},
							onCompositionStart: () => {
								composingRef.current = true;
							},
							onCompositionEnd: () => {
								composingRef.current = false;
							},
							onKeyDown: (e) => {
								if (e.key === "Enter" && !composingRef.current) {
									e.preventDefault();
									confirmBranchRename();
								}
							}
						}), branchRenameError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.renameError,
							role: "alert",
							children: branchRenameError
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: repoRenameTarget !== null,
						onClose: closeRepoRename,
						closeLabel: t("close"),
						title: t("repo.rename.title"),
						description: t("repo.rename.hint"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: repoRenaming,
							onClick: closeRepoRename,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: repoRenaming,
							onClick: confirmRepoRename,
							children: t("rename")
						})] }),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: WorkspaceBrowser_module_css_default.renameInput,
							value: repoRenameDraft,
							"aria-label": t("field.repoName"),
							placeholder: repoRenameTarget?.currentName ?? "",
							autoFocus: true,
							disabled: repoRenaming,
							onFocus: (e) => {
								e.target.select();
							},
							onChange: (e) => {
								setRepoRenameDraft(e.target.value);
								setRepoRenameError(null);
							},
							onCompositionStart: () => {
								composingRef.current = true;
							},
							onCompositionEnd: () => {
								composingRef.current = false;
							},
							onKeyDown: (e) => {
								if (e.key === "Enter" && !composingRef.current) {
									e.preventDefault();
									confirmRepoRename();
								}
							}
						}), repoRenameError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.renameError,
							role: "alert",
							children: repoRenameError
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: worktreeDialog !== null,
						onClose: closeWorktreeDialog,
						closeLabel: t("close"),
						title: t("worktree.create.title"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: WorkspaceBrowser_module_css_default.footerHint,
								children: t("worktree.create.footer.hint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								disabled: creating,
								onClick: closeWorktreeDialog,
								children: t("cancel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: creating || options === null || branchTrimmed === "" || pathValue.trim() === "",
								onClick: confirmWorktreeCreate,
								children: t("worktree.create.confirm")
							})
						] }),
						children: [
							worktreeOptions?.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.renameError,
								role: "alert",
								children: worktreeOptions.message
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: WorkspaceBrowser_module_css_default.fieldLabel,
									children: t("worktree.create.branch")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: WorkspaceBrowser_module_css_default.comboRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: WorkspaceBrowser_module_css_default.renameInput,
										value: branchDraft,
										"aria-label": t("worktree.create.branch"),
										autoFocus: true,
										disabled: creating || options === null,
										onChange: (e) => {
											setBranchDraft(e.target.value);
											setCreateError(null);
										},
										onCompositionStart: () => {
											composingRef.current = true;
										},
										onCompositionEnd: () => {
											composingRef.current = false;
										},
										onKeyDown: (e) => {
											if (e.key === "Enter" && !composingRef.current) {
												e.preventDefault();
												confirmWorktreeCreate();
											}
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
										open: branchMenuOpen,
										onClose: () => {
											setBranchMenuOpen(false);
										},
										items: branchChoices.length > 0 ? branchChoices.map((branch) => ({
											id: branch,
											label: branch
										})) : [{
											type: "label",
											id: "empty",
											text: t("worktree.create.branches.empty")
										}],
										onSelect: (id) => {
											setBranchMenuOpen(false);
											setBranchDraft(id);
										},
										portal: true,
										closeOnPointerLeave: true,
										anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: WorkspaceBrowser_module_css_default.comboButton,
											"aria-label": t("worktree.create.branches.aria"),
											disabled: creating || options === null,
											onClick: () => {
												setBranchMenuOpen((v) => !v);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronsUpDownOutlineRegular, {})
										})
									})]
								}),
								options !== null && branchIsNew && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: WorkspaceBrowser_module_css_default.fieldHint,
									children: t("worktree.create.base", { base: options.base })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: WorkspaceBrowser_module_css_default.fieldLabel,
									children: t("worktree.create.path")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: WorkspaceBrowser_module_css_default.comboRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: WorkspaceBrowser_module_css_default.renameInput,
										value: pathValue,
										"aria-label": t("worktree.create.path"),
										disabled: creating || options === null,
										onChange: (e) => {
											setPathDraft(e.target.value);
											setPathEdited(true);
											setCreateError(null);
										},
										onCompositionStart: () => {
											composingRef.current = true;
										},
										onCompositionEnd: () => {
											composingRef.current = false;
										},
										onKeyDown: (e) => {
											if (e.key === "Enter" && !composingRef.current) {
												e.preventDefault();
												confirmWorktreeCreate();
											}
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
										open: parentMenuOpen,
										onClose: () => {
											setParentMenuOpen(false);
										},
										items: options !== null && options.parents.length > 0 ? options.parents.map((parent) => ({
											id: parent,
											label: parent
										})) : [{
											type: "label",
											id: "empty",
											text: t("worktree.create.parents.empty")
										}],
										onSelect: (id) => {
											setParentMenuOpen(false);
											setPathParent(id);
											setPathEdited(false);
										},
										portal: true,
										closeOnPointerLeave: true,
										anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: WorkspaceBrowser_module_css_default.comboButton,
											"aria-label": t("worktree.create.parents.aria"),
											disabled: creating || options === null,
											onClick: () => {
												setParentMenuOpen((v) => !v);
											},
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronsUpDownOutlineRegular, {})
										})
									})]
								})
							] }),
							creating && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.deleteStatus,
								role: "status",
								children: t("worktree.create.pending")
							}),
							createError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.renameError,
								role: "alert",
								children: createError
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: sessionRenameTarget !== null,
						onClose: closeSessionRename,
						closeLabel: t("close"),
						title: t("rename.session.title"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: sessionRenaming,
							onClick: closeSessionRename,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: sessionRenameBlocked,
							onClick: confirmSessionRename,
							children: t("rename")
						})] }),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: WorkspaceBrowser_module_css_default.renameInput,
							value: sessionRenameDraft,
							"aria-label": t("field.sessionName"),
							autoFocus: true,
							disabled: sessionRenaming,
							onFocus: (e) => {
								e.target.select();
							},
							onChange: (e) => {
								setSessionRenameDraft(e.target.value);
								setSessionRenameError(null);
							},
							onCompositionStart: () => {
								composingRef.current = true;
							},
							onCompositionEnd: () => {
								composingRef.current = false;
							},
							onKeyDown: (e) => {
								if (e.key === "Enter" && !composingRef.current) {
									e.preventDefault();
									confirmSessionRename();
								}
							}
						}), sessionRenameError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.renameError,
							role: "alert",
							children: sessionRenameError
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: deleteTarget !== null,
						onClose: closeDelete,
						closeLabel: t("close"),
						title: t(deleteTarget?.kind === "repository" ? "delete.repository" : "delete.workspace"),
						...deleteTarget === null ? {} : { description: t(deleteTarget.kind === "repository" ? "delete.repository.desc" : "delete.desc", { name: deleteTarget.title }) },
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: deleting,
							onClick: closeDelete,
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							className: WorkspaceBrowser_module_css_default.deleteAction,
							disabled: deleting,
							onClick: confirmDelete,
							children: t(deleteForce ? "delete.confirm.force" : deleteTarget?.kind === "repository" ? "delete.repository" : "delete.workspace")
						})] }),
						children: [
							deleteBranchOffered && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Checkbox, {
								className: WorkspaceBrowser_module_css_default.deleteCheck,
								checked: deleteAlsoBranch,
								disabled: deleting,
								onChange: setDeleteAlsoBranch,
								label: t("delete.workspace.branch", { branch: deleteWorktree?.branch ?? "" })
							}),
							deleteForce && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.renameError,
								role: "alert",
								children: t("delete.unsafe")
							}),
							deleting && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.deleteStatus,
								role: "status",
								children: t("delete.pending")
							}),
							deleteError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: WorkspaceBrowser_module_css_default.renameError,
								role: "alert",
								children: deleteError
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: pathPrompt !== null,
						onClose: () => {
							if (!addBusy) {
								setPathPrompt(null);
								setAddError(null);
							}
						},
						closeLabel: t("close"),
						title: t("workspace.add"),
						description: t("add.path.desc"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							disabled: addBusy,
							onClick: () => {
								setPathPrompt(null);
								setAddError(null);
							},
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: addBusy || pathPromptTrimmed === "",
							onClick: () => {
								adoptDirectory(pathPromptTrimmed);
							},
							children: t("add.confirm")
						})] }),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: WorkspaceBrowser_module_css_default.renameInput,
							value: pathPrompt ?? "",
							"aria-label": t("field.workspacePath"),
							autoFocus: true,
							disabled: addBusy,
							onChange: (e) => {
								setPathPrompt(e.target.value);
								setAddError(null);
							},
							onCompositionStart: () => {
								composingRef.current = true;
							},
							onCompositionEnd: () => {
								composingRef.current = false;
							},
							onKeyDown: (e) => {
								if (e.key === "Enter" && !composingRef.current && pathPromptTrimmed !== "" && !addBusy) {
									e.preventDefault();
									adoptDirectory(pathPromptTrimmed);
								}
							}
						}), pathPrompt !== null && addError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.renameError,
							role: "alert",
							children: addError
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: pathPrompt === null && addError !== null,
						onClose: () => {
							setAddError(null);
						},
						closeLabel: t("close"),
						title: t("folderError.title"),
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "outline",
							onClick: () => {
								setAddError(null);
							},
							children: t("cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "primary",
							disabled: addBusy,
							onClick: addWorkspace,
							children: t("folderError.retry")
						})] }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: WorkspaceBrowser_module_css_default.renameError,
							role: "alert",
							children: addError
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/schedules.ts
		/** Catalog value before the first successful read: no Session is marked. */
		const EMPTY_SCHEDULE_CATALOG = [];
		function createScheduleCatalogClient(ctx) {
			let snapshot = EMPTY_SCHEDULE_CATALOG;
			const listeners = /* @__PURE__ */ new Set();
			let reading = false;
			let queued = false;
			let generation = 0;
			let disposed = false;
			const publish = (next) => {
				if (next === snapshot) return;
				snapshot = next;
				for (const listener of listeners) listener();
			};
			const refresh = () => {
				if (disposed) return;
				const schedule = ctx.remote.schedule;
				if (reading) {
					queued = true;
					return;
				}
				reading = true;
				const current = generation;
				schedule.catalog().then((result) => {
					if (disposed || current !== generation) return;
					if (result.ok) {
						publish(result.value);
						return;
					}
					console.warn("left-panel: schedule catalog read failed:", result.error.message);
				}).catch((reason) => {
					if (disposed || current !== generation) return;
					console.warn("left-panel: schedule catalog read failed:", reason);
				}).finally(() => {
					if (disposed || current !== generation) return;
					reading = false;
					if (queued) {
						queued = false;
						refresh();
					}
				});
			};
			const invalidate = () => {
				generation += 1;
				reading = false;
				queued = false;
				publish(EMPTY_SCHEDULE_CATALOG);
				refresh();
			};
			return {
				source: {
					getSnapshot: () => snapshot,
					subscribe: (listener) => {
						listeners.add(listener);
						if (listeners.size === 1) refresh();
						return () => {
							listeners.delete(listener);
						};
					}
				},
				start() {
					const changed = ctx.remote.$on("schedule/changed", refresh);
					const reset = ctx.on("connection/reset", invalidate);
					return () => {
						disposed = true;
						generation += 1;
						changed();
						reset();
					};
				}
			};
		}
		//#endregion
		//#region src/protocol.ts
		/**
		* Wire contract between the plugin's host half and its browser half. The host
		* answers every endpoint with a fresh {@link WorktreeSnapshot} so the client
		* never has to merge partial updates.
		*
		* Transport: exact Fetch routes on the shared, authenticated `/api` channel
		* (`/api/left-panel/<endpoint>`), speaking the Connection RPC envelope so the
		* browser half can use `connection.rpc.call(CHANNEL, methodOf(endpoint), payload)`.
		*
		* The plugin keeps no per-repository switches: registering a repository's
		* worktrees is its default behaviour, and reconciliation runs on its own
		* (startup, workspace changes, git filesystem events, a slow poll), so the
		* browser only asks for a snapshot or for a refresh.
		*/
		/** Shared Connection channel the plugin's routes live under. */
		const CHANNEL = "/api";
		/** First path segment of every endpoint of this plugin below {@link CHANNEL}. */
		const ENDPOINT_PREFIX = "left-panel";
		/** The method name the browser passes to `connection.rpc.call`; also the route path below {@link CHANNEL}. */
		function methodOf(endpoint) {
			return `${ENDPOINT_PREFIX}/${endpoint}`;
		}
		//#endregion
		//#region src/client/worktrees.ts
		const EMPTY_SNAPSHOT = {
			repos: [],
			workspaceRepo: {},
			syncedAt: 0
		};
		const POLL_MS = 15e3;
		const FOLLOW_DEBOUNCE_MS = 300;
		function isSnapshot(value) {
			if (typeof value !== "object" || value === null) return false;
			const candidate = value;
			return Array.isArray(candidate.repos) && typeof candidate.workspaceRepo === "object" && candidate.workspaceRepo !== null && typeof candidate.syncedAt === "number";
		}
		function createWorktreeClient(connection, workspaces) {
			let snapshot = EMPTY_SNAPSHOT;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				snapshot = next;
				for (const listener of listeners) listener();
			};
			const call = async (endpoint, payload = {}) => {
				const result = await connection.rpc.call(CHANNEL, methodOf(endpoint), payload);
				if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
				if (!isSnapshot(result.value)) throw new Error(`left-panel: malformed snapshot from ${endpoint}`);
				publish(result.value);
			};
			const refresh = () => {
				call("list").catch((reason) => {
					console.warn("left-panel: worktree list failed:", reason);
				});
			};
			return {
				source: {
					getSnapshot: () => snapshot,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					}
				},
				actions: {
					refresh: () => call("sync"),
					setRepoName: (repoKey, name) => call("setRepoName", {
						repoKey,
						name
					}),
					setWorkspaceTitle: (workspaceId, title) => call("setWorkspaceTitle", {
						workspaceId,
						title
					}),
					deleteWorkspace: (workspaceId, options) => call("deleteWorkspace", {
						workspaceId,
						...options
					}),
					deleteRepository: (repoKey) => call("deleteRepository", { repoKey }),
					restoreWorkspace: (path) => call("restoreWorkspace", { path }),
					branchOptions: async (repoKey) => {
						const result = await connection.rpc.call(CHANNEL, methodOf("branchOptions"), { repoKey });
						if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
						return result.value;
					},
					createWorktree: (request) => call("createWorktree", request),
					renameBranch: (workspaceId, branch) => call("renameBranch", {
						workspaceId,
						branch
					})
				},
				start() {
					refresh();
					const timer = window.setInterval(refresh, POLL_MS);
					let debounce;
					const unsubscribe = workspaces.list.subscribe(() => {
						if (debounce !== void 0) window.clearTimeout(debounce);
						debounce = window.setTimeout(() => {
							debounce = void 0;
							refresh();
						}, FOLLOW_DEBOUNCE_MS);
					});
					return () => {
						window.clearInterval(timer);
						if (debounce !== void 0) window.clearTimeout(debounce);
						unsubscribe();
					};
				}
			};
		}
		//#endregion
		//#region src/client/index.ts
		const name = "left-panel";
		/**
		* Required services (cordis fiber inject). The target slot is declared by the
		* ui-sidebar apply, whose activation order relative to this one is not
		* constrained, so registration waits on the declaration through `slots.inject()`.
		*/
		const inject = [
			"slots",
			"sessions",
			"workspaces",
			"locale",
			"remote",
			"remote.schedule",
			"layout",
			"uiWorkspace",
			"connection"
		];
		/** Below the shipped entry's default 0: the lowest priority renders. */
		const SHADOW_PRIORITY = -1;
		function apply(ctx) {
			const sessions = ctx.get("sessions");
			const workspaces = ctx.get("workspaces");
			const connection = ctx.get("connection");
			const uiWorkspace = ctx.uiWorkspace;
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "left-panel: dictionaries");
			const worktrees = createWorktreeClient(connection, workspaces);
			ctx.effect(() => worktrees.start(), "left-panel: worktree snapshot");
			const schedules = createScheduleCatalogClient(ctx);
			ctx.effect(() => schedules.start(), "left-panel: schedule catalog");
			const searchSessions = async (query, signal) => {
				const result = await sessions.search(query, signal);
				if (!result.ok) throw new Error(result.error.message);
				return result.value;
			};
			const hostInfo = {
				getSnapshot: () => ctx.remote.$host,
				subscribe: (listener) => ctx.on("connection/reset", listener)
			};
			const injected = () => ({
				startSession: (workspaceId) => {
					uiWorkspace.startSession(workspaceId);
				},
				open: (sessionId) => {
					uiWorkspace.openSession(sessionId);
				},
				searchSessions,
				searchResultLimit: sessions.searchResultLimit,
				renameSession: async (sessionId, title) => {
					const result = await sessions.using(sessionId, { source: "workspaceOperation" }, (reference) => reference.binding.session.rename(title));
					if (!result.ok) throw new Error(result.error.message);
				},
				forkSession: (sessionId) => {
					uiWorkspace.forkSession(sessionId, (childId) => uiWorkspace.openSession(childId)).catch(() => {});
				},
				renameWorkspace: async (workspaceId, title) => {
					await workspaces.rename(workspaceId, title);
				},
				insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {
					await workspaces.insertBefore(workspaceId, beforeWorkspaceId);
				},
				archiveSession: async (sessionId) => {
					await uiWorkspace.archiveSession(sessionId);
				},
				insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
					await workspaces.insertSessionBefore(workspaceId, sessionId, beforeSessionId);
				},
				createWorkspace: (input) => workspaces.create(input),
				pickDirectory: () => uiWorkspace.pickDirectory(),
				worktrees: worktrees.actions,
				hooks: {
					hostInfo,
					worktrees: worktrees.source,
					scheduleCatalog: schedules.source
				}
			});
			const pickerInjected = () => ({
				createWorkspace: (input) => workspaces.create(input),
				pickDirectory: () => uiWorkspace.pickDirectory(),
				hooks: { worktrees: worktrees.source }
			});
			ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
				name: "sidebar.workspaces",
				priority: SHADOW_PRIORITY,
				store: createWorkspaceViewStore(),
				inject: injected,
				locale: NS
			}, WorkspaceBrowser));
			ctx.slots.inject("conversation.hero.workspace", () => ctx.slots.register({
				name: "conversation.hero.workspace",
				priority: SHADOW_PRIORITY,
				inject: pickerInjected,
				locale: NS
			}, GroupedWorkspacePicker));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map