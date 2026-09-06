# T01–T33 整合走查记录

- 日期：2026-09-06
- 模型：自动化覆盖剧本 / 规则兜底与 fake advisor。浏览器走查确认第 IV 卷、选席、可达区间、90% 非阻断警告、what-if 与举证清单；本机已配置的军师端点连接失败，UI 正确显示 502 错误，因此未完成真实军师庭审观感检查。
- 范围：逐条复核并整合 `T01`–`T33`；保留工作区原有实现，只补缺陷。

## 验收状态边界

- **代码验收：完成。** 自动化覆盖规则版、剧本模式、fake advisor、信息隔离、玩家等待/并发发言、简报注入、复盘 turn_id 数据链和旁观字节兼容。
- **外部模型真人走查：阻塞。** 当前军师端点无法连接；未把真实模型的文风、延迟、卡片观感或叙事质量记为通过。

## 自动化

在本机（Windows）执行任务要求的命令：

```text
cd backend; .venv/Scripts/python -m pytest -q
# 147 passed, 1 warning

cd ../frontend
npm run lint    # oxlint exit 0
npm test        # 16 files / 48 tests passed
npm run build   # tsc -b && vite build exit 0
```

新增测试文件齐全：

`test_seat_models` `test_seat_evidence` `test_seat_analysis` `test_seat_game` `test_seat_scoring` `test_seat_api` `test_seat_advisor` `test_seat_prompts` `test_seat_blind` `test_seat_runtime` `test_seat_turn` `test_seat_debrief` `test_seat_export`

前端席位用例在 `useCaseDraft.test.ts`、`useCourt.test.ts`。

## 清单对照

| # | 项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 旁观开庭：显灵 / 宝箱 / 押注 / 休庭续庭 / 导出不变；SSE 无 `seat awaiting_player cards debrief` | 自动化通过 | `test_spectator_export_*` 与改动前 fixture 逐字节相等；`test_spectator_and_ai_seat_have_no_awaiting`；`test_spectator_has_no_debrief`；`test_seat_session_interject_409_spectator_ok`（旁观仍可 interject）。旁观整场 mock 会话事件集合不含上述四类。 |
| 2 | 导入示例案情后旁观开庭 | 自动化覆盖导入草稿入局，未做浏览器点击 | `useCaseDraft.test.ts` 导入回填；旁观行为同上。 |
| 3 | 入局无模型：选女儿、可达区间、最低 90%「不现实」、红线、what-if、规则版策略 | 自动化通过 | `test_analyze_warns_when_floor_is_unrealistic`；`test_strategy_degrades_without_provider`；`useCaseDraft.test.ts` 席位 / 诉求。 |
| 4 | 庭审切「我」、横幅与输入、勾放弃份额、当庭事实、复盘、导出报告 | 自动化通过 | `test_speak_replays_player_turn_and_records_admission`（`waive_share`）；`test_no_advisor_emits_empty_cards`；`test_scripted_seat_session_emits_debrief_*`；`test_seat_export_contains_report_sections_and_aligned_tables`。 |
| 5 | 等待态刷新 / 重启后端不自动续跑，`/speak` 后续跑 | 自动化通过 | `test_restart_stays_awaiting_then_speak_resumes`；`test_awaiting_player_is_resumable_but_not_autospawned`。 |
| 6 | 真实军师推演、禁/增简报、改对手诉求需重算 | 未做真人点击 | `test_strategy_with_fake_advisor`、`test_generate_briefs_*` 覆盖生成与隔离；需本机供应商再点一次。 |
| 7 | 开庭后 AI 代理围绕简报发言 | fake advisor 自动化通过；真人观感阻塞 | `test_fake_llm_player_receives_and_uses_own_brief` 验证私有简报进入 AI 发言链路且玩家 AI 不产生自认。 |
| 8 | 协商切「我」→ 2~3 张卡 → 用这张不自动勾自认 → 改由 AI | 部分自动化 | `test_fake_advisor_cards_and_regenerate`（卡不含自动 `admit_neglect`）；`test_speak_meta_extract_ignores_model_admissions`；`test_delegate_uses_mock_speech`。 |
| 9 | 闭庭 `debrief`、叙事、turn_id、导出完整 | 数据链自动化通过；真人文案阻塞 | `test_debrief_saves_item_rationales_and_only_valid_turn_ids` 验证理由、合法 turn_id、记分卡与前端跳转契约；导出见 T30。 |
| 10 | 执行官五处提示词不含诉求 / 简报 | 通过 | `test_executor_prompts_are_seat_blind`：`executor_prompt_samples()` 共 5 段，不含「简报」与 `seat_secret_strings()`。 |
| 11 | 对手简报不含玩家自由文本哨兵 | 通过 | `test_opponent_brief_hides_player_and_edited_secrets`：`SENTINEL_PLAYER_ONLY` / `PLAYER_REDLINE_SECRET` 不在对手 brief 提示词中。 |

## 发现并修复

1. **Windows pytest 临时目录锁死**  
   上一轮被中断的 pytest 占用 `backend/tmp/pytest/test_restart_stays_awaiting_th0/heirarena.db`，下一轮在 session setup 的 `rmtree` 上出现 17 个 `PermissionError`（106 passed / 17 errors，无断言失败）。  
   修复：每次运行改用系统临时目录下的独立进程目录，并用 `backend/pytest.ini` 将收集范围限定到 `tests/`，避免历史 `backend/tmp/pytest*` ACL/锁文件让精确命令在收集阶段失败。最终全量 **144 passed**。

2. **T31 均衡穷举**  
   `GameTables.equilibrium` 不再是空列表；「猫比儿子亲」用例在 200ms 内给出稳定行或带 note 的最佳回应；>6 继承人截断说明写入 `note`。

3. **T30 旁观导出不变量**  
   任务开始前冻结 `tests/fixtures/spectator_export.md` 与 `spectator_export_verdict.md`；入局报告插在免责声明之前；`_normalize_meta` 只透传 `by: human`。

4. **T29 闭庭切 Tab**  
   `CourtroomPage` 在现有裁决跳转之后，收到 `debrief` 再切到「入局」一次，Tab 金色圆点提示。

5. **T20 策略包在开庭前被意外清空**  
   `cleanDraft()` 复用了“案情变更即作废策略”的裁剪路径，导致已生成并编辑的 `seat.strategy` 在 `createSession` 请求前变成 `null`。现将引用清理与策略作废分开，提交清理会保留有效策略。

6. **T13 席位失效与分析请求循环**  
   成员改为已故时只作废策略、没有退出非法席位；重复写入相同推断诉求又会改变草稿引用，触发 `useSeatAnalysis` 连续请求。现统一重校验席位，并对相同推断结果保持状态引用不变。

7. **T24 部分 meta 不会补齐**  
   玩家只手选动作时，旧逻辑把它当成“不需要抽取”，目标与资产诉求丢失。现按 Pydantic v2 `model_fields_set` 只补缺失字段，并保留用户明确填写的字段与自认。

8. **T28/T30 结构与来源约束**  
   军师软目标分数原先未限制在 `0..1`；玩家亲自发言也未写入 `by=human`，导出无法统计人工回合。现增加 Schema 约束并标记人工来源。

9. **PxlKit 一致性**  
   入局组件中的原生操作按钮和 Lucide 操作图标已改为 PxlKit 按钮/图标按钮，保持严格组件规范。

10. **玩家自认与份额不变量**  
   AI 代说玩家的 mock/LLM admissions 现在一律丢弃；只有 `/speak` 表单显式勾选走受控参数才能保留玩家自认。`concede` 只保留谈判动作与统计语义，不再形成第四类份额事实。

11. **复盘评分与理由引用**  
   soft score 只接受真实软目标索引；军师理由改为结构化 kind/index/reason/turn_ids，成员、索引和 turn_id 均在编排器中核验，合法引用写入 `ScorecardPart.detail/turn_ids`。

12. **提示词派生数据隔离**  
   对手简报不再接收由全员私有目标推导的联盟、竞争和收益表；隔离测试覆盖目标资产、模板红线、软目标、自由文本及派生表。

13. **并发发言与 Card Schema**  
   `/speak` 与等待中切 AI 共用会话级异步锁，两个并发请求只有一个能 claim 回合，另一个稳定 409；`CardOut.action` 收紧为 TS `Action` 同款封闭枚举。

14. **入局报告完整性**  
   报告会重新确定性补齐临时推断诉求，并完整列出 strategy 的举证责任、说明与全部证据项目。

15. **军师评分集合完整性**  
   军师输出必须精确覆盖每位成员全部软目标和自定义红线索引；遗漏、额外成员、非法索引和非规范重复索引均触发军师复盘降级。记分卡层仍以全部目标为固定分母，部分输入不会抬高分数。

16. **发言 claim 原子回滚**  
   `/speak` 在写入 `running + pending` 后若持久化或任务启动失败，会恢复原 `awaiting_player`、pending 和 task，并再次持久化恢复态。测试确认玩家随后只能成功重试一次，后续重复提交稳定 409。

17. **组件交互与单条举证责任**  
   what-if 单条证据抽屉显示匹配的举证责任与说明；组件级测试覆盖 SeatDock 显式自认请求、SpeechCards 用卡不自动自认、DebriefPanel turn_id 跳转和 WhatIfPanel 举证责任。

18. **空/缺失评分映射防御**  
   即使军师适配层被替换或返回缺失类别，只要成员配置了软目标或自定义红线，编排器都会向 scoring 传入空映射，以完整目标集计 0 分，而不是退回“不适用”。覆盖整个映射为空、成员缺失、类别缺失三种情况。

19. **等待态切 AI 的完整原子性**  
   `PUT /seat human=false` 现在先完成 pending、持久化和任务启动，再发布 `seat` 事件；任一步失败都会恢复 `awaiting_player`、`human=true`、空 pending 与原 task，并持久化恢复态。失败时没有残留前端事件，随后重试只发布一次成功事件。

## 仍需本机点一次（有军师）

清单 **6、7、9 的叙事跳转** 依赖真实供应商或 Codex Bridge。自动化已覆盖规则版 / fake advisor 路径，但不能代替一次真人开庭观感确认。
