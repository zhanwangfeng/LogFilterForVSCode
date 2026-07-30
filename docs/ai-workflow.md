# Development Workflow

1. `git checkout main`
2. `git checkout -b dev{ver}`（ver 由开发者人为指定）
3. 编写 `docs/design.{ver}.md`
4. 修改代码
5. 等待开发者测试通过
6. 更新所有 md 文档中关于该版本的变更说明（CHANGELOG.md 及涉及的功能文档）
7. `git push origin dev{ver}`
8. 等待开发者 merge 到 main
9. `git checkout main && git pull`
10. `git tag v{ver}` && `git push origin v{ver}`
11. 打包vsix