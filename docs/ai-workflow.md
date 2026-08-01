# Development Workflow

> **重要**：本工作流中所有 git 命令、打包命令、GitHub Release API 调用均由 AI 直接执行，无需人工操作。
> 开发者只需确认执行意图（例如"开发 0.0.15，publisher 改成 zhanwangfeng"或"合并发布 0.0.15"）。

## 一、开发阶段

1. 切到 main 并拉取最新（AI 执行）
2. 创建开发分支：`dev{ver}`（AI 执行，ver 由指令中指定）
3. 编写设计文档：`docs/design.{ver}.md`（AI 生成）
4. 修改代码（AI 修改）
5. 等待开发者确认或测试通过
6. 更新所有 md 文档中关于该版本的变更说明（`CHANGELOG.md` 及涉及的功能文档）（AI 更新）

## 二、合并阶段

7. 提交本地改动（`git add` + `git commit`，commit message 含版本号和概要）（AI 执行）
8. 推送开发分支：`git push origin dev{ver}`（AI 执行）
9. 通过 `gh` CLI 或 GitHub API 创建 Pull Request（标题：`Release v{ver}`，body 自动填入 `docs/design.{ver}.md` 概要及 `CHANGELOG.md` 条目）并合并到 main（AI 执行，合并策略：**Squash and merge** 或按开发者偏好的 **Create a merge commit**；PR 标题与 commit message 需保留版本号和概要）
10. 切回 main 并拉取合并结果：`git checkout main && git pull`（AI 执行）
11. 打标签并推送：`git tag v{ver} && git push origin v{ver}`（AI 执行）

## 三、发布阶段

12. 安装依赖与打包 vsix 文件（`npm install` → `npm run package`）（AI 执行；如遇到 vsce / Node 版本不兼容，AI 自动降级到兼容版本，例如 `@vscode/vsce@^2.0.0`）
13. 创建 GitHub Release 并上传 vsix 附件：
    - release notes 取自 `CHANGELOG.md` 中该版本的变更说明（AI 自动提取）
    - 通过 `gh release create v{ver} ./release/logfilterpro-{ver}.vsix --title "v{ver}" --notes-file <提取的 CHANGELOG 内容>` 或等效 GitHub API 创建 Release（关联 tag `v{ver}`）并上传 `release/*.vsix` 作为附件（AI 执行）
    - 鉴权：优先使用系统中已登录的 `gh` CLI；若未登录则通过 `gh auth login` 或 git 凭证缓存 `echo "protocol=https\nhost=github.com\n" | git credential fill` 获取（AI 执行）
14. （可选）如需发布到 VS Code Marketplace：`vsce publish --packagePath ./release/logfilterpro-{ver}.vsix`，publisher 需与 `package.json` 中一致（AI 执行，使用已配置的 PAT）

## 四、AI 执行规范

- 每个阶段开始前 AI 输出当前执行概要与步骤清单，遇到需要人工确认的决策（如是否覆盖现有 tag、是否使用 squash merge）才提问，否则全自动。
- 所有 git 命令、API 调用的输出记录在对应步骤的上下文中，失败时 AI 自动修复（例如依赖冲突执行 `npm install --force`，版本不兼容降级，网络失败重试）。
- 版本号 `{ver}` 一律从用户指令提取；若指令未明确则 AI 询问。
