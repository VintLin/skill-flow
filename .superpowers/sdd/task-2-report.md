状态: DONE

变更文件:
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportLogic.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeDiagnostic.swift`
- `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportToastDiagnosticsFormatterTests.swift`
- `.superpowers/sdd/task-2-report.md`

运行的测试命令和结果:
1. `swift test --package-path apps/desktop-mac --filter ImportScreenContainerTests`
   - 首次红灯，确认旧行为仍输出不带数字 issue code 的 warning，且失败 toast 泄漏内部码 / bridge 码。
2. `swift test --package-path apps/desktop-mac --filter ImportScreenContainerTests`
   - 通过，69 tests, 0 failures。
3. `swift test --package-path apps/desktop-mac --filter ImportToastDiagnosticsFormatterTests`
   - 通过，3 tests, 0 failures。
4. `swift test --package-path apps/desktop-mac --filter DesktopIssuePresentationCatalogTests`
   - 通过，3 tests, 0 failures。
5. `swift test --package-path apps/desktop-mac --filter DesktopLocalizationTests`
   - 通过，21 tests, 0 failures。

自审结论:
- `ImportLogic` 已改为统一经 `DesktopIssuePresentationCatalog` 生成 import warning / failure toast，不再向用户暴露 `IMPORT_*` 或 `BRIDGE_*` 内部码。
- selector drift warning 现在显示数字 issue code `103`。
- `IMPORT_SELECTOR_NOT_FOUND` 失败路径现在显示数字 issue code `101`。
- `ImportToastDiagnosticsFormatter` 只输出 issue code 与 catalog 允许的安全上下文，不再输出内部错误码或 bridge 码。
- 新增 / 更新的本地化 key 已覆盖 `en`、`zh-Hans`、`ja`，并验证 issue code 参数能正确注入。

concerns:
- 无。

---

Reviewer fix 2:

状态: DONE

修复结论:
- `IMPORT_SELECTOR_NOT_FOUND` 与 `IMPORT_SELECTOR_AMBIGUOUS` 的失败路径已改为失败 toast key，分别映射到 `toast.import.failed.selection_not_found` / `toast.import.failed.selection_ambiguous`，不再错误复用 success/warning 文案。
- bridge import 失败在 `catch` 路径下会优先读取 `BridgeClientError.commandFailed(..., response:)` 中的 `response.errors.first?.code`，统一经 `DesktopIssuePresentationCatalog` 映射为数字 issue code；`BRIDGE_REQUEST_INVALID` 现在显示 `502`，不会回退到不带 `%@` 的 `bridge.error.invalid_response` 或 `bridge.error.command_failed_default`。
- 新增测试已从“包含数字”提升为“失败文案正确 + 数字正确 + 不泄漏内部码”。

变更文件:
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/DesktopIssuePresentation.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportLogic.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopIssuePresentationCatalogTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- `.superpowers/sdd/task-2-report.md`

运行的测试命令和结果:
1. `swift test --package-path apps/desktop-mac --filter DesktopIssuePresentationCatalogTests`
   - 通过，3 tests, 0 failures。
2. `swift test --package-path apps/desktop-mac --filter ImportScreenContainerTests`
   - 通过，70 tests, 0 failures。
3. `swift test --package-path apps/desktop-mac --filter DesktopLocalizationTests`
   - 通过，21 tests, 0 failures。
4. `swift test --package-path apps/desktop-mac --filter ImportToastDiagnosticsFormatterTests`
   - 通过，3 tests, 0 failures。

concerns:
- 无。
