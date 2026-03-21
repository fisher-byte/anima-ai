# 版本备份说明：anima-base 灵思自动入库 + 匹配降权

本文件用于在 **GitHub 上打「强标注」标签（annotated tag）** 时附带的说明摘要；与 `package.json` 中的 `version` 可一致或单独使用标签名（例如 `v0.5.49-lingsi-anima-auto`）。

---

## 本版主要变更（大颗粒）

1. **anima-base 批量入库管线**  
   - 新增 `scripts/animaBaseAutoDiscovery.ts`：扫描 `people/product/lenny-rachitsky` 与 `zhang-xiaolong` 下未在精选 `SOURCE_SPECS` 中出现的 `.md`，生成 `src-auto-*` 来源与 `unit-auto-*` 决策单元。  
   - `scripts/extract-lingsi-seeds.ts` 合并精选 + 自动；支持环境变量 `ANIMA_BASE`、`LINGSI_AUTO_INGEST`。

2. **Persona 来源池**  
   - `decision-personas.json` 中的 `evidenceSources` **仍仅含精选来源**，避免自动来源撑爆 persona 清单。

3. **匹配策略**  
   - `src/shared/lingsiDecisionEngine.ts`：对 `unit-auto-*` 在 `scoreDecisionUnit` 中 **降权**（避免自动单元挤掉 Top 3 精选匹配）。

4. **评测与基线**  
   - `scripts/lingsiEvalPrompts.ts`：与 `evaluate-lingsi` 共用的题集。  
   - `npm run lingsi:evaluate:lite`：离线轻量评测（仅匹配统计），输出 `reports/lingsi-eval-lite.json`、`docs/lingsi-eval-lite.md`。  
   - 完整 LLM 评测仍为 `npm run lingsi:evaluate` / `lingsi:evaluate:zhang`（需本地 API）。

5. **文档**  
   - `docs/dev-guide.md`：补充 anima-base 与 `LINGSI_AUTO_INGEST` 说明。

---

## 建议在 GitHub 上的操作

在**已提交**本版代码的仓库中：

```bash
# 强标注标签（把说明写进 tag message，GitHub 上可见）
git tag -a v0.5.49-lingsi-anima-auto -m "LingSi: anima-base auto-ingest + unit-auto match penalty; see docs/releases/RELEASE_ANIMA_BASE_AUTO_INGEST.md"

git push origin v0.5.49-lingsi-anima-auto
```

也可在 GitHub 网页 **Releases** 里从该 tag 建 Release，把本文件内容贴进 Release description。

---

## 日后如何回退？

### 方式 A：整仓回到该标签之前的提交（只读历史 / 新开分支）

```bash
git fetch origin
git checkout v0.5.49-lingsi-anima-auto   # 分离头指针，适合查看
# 或基于标签开分支：
git checkout -b fix/from-before-auto v0.5.49-lingsi-anima-auto^
```

把 `v0.5.49-lingsi-anima-auto^` 换成「自动入库合并前」的 **确切 commit**（若标签打在合并提交上，用 `git log` 找父提交）。

### 方式 B：只撤销「种子大文件」相关提交（保留其它代码改动）

若其它代码要保留，仅希望 **seeds 回到精选-only**：

```bash
LINGSI_AUTO_INGEST=0 npm run lingsi:extract
git add seeds/lingsi/
git commit -m "chore(lingsi): regenerate seeds without auto-ingest"
```

或从旧提交 **只检出** 种子文件：

```bash
git checkout <旧commit> -- evocanvas/seeds/lingsi/decision-units.json evocanvas/seeds/lingsi/decision-source-manifest.json
# 再按需运行 generate / 测试
```

### 方式 C：`git revert` 某次合并提交

若自动入库是一次独立 merge commit：

```bash
git revert -m 1 <merge_commit_sha>
```

---

## 相关路径速查

| 路径 | 作用 |
|------|------|
| `scripts/animaBaseAutoDiscovery.ts` | 扫描与自动生成 spec/seed |
| `scripts/extract-lingsi-seeds.ts` | 合并精选 + 自动并写 seeds |
| `src/shared/lingsiDecisionEngine.ts` | `unit-auto-*` 匹配降权 |
| `seeds/lingsi/decision-units.json` | 单元（体积可能很大） |
| `docs/lingsi-eval-lite.md` | 轻量评测结果（运行 lite 后更新） |

---

*文档随版本迭代可继续补充「轻量评测快照日期」「完整评测报告链接」。*
