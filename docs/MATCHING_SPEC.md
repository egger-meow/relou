> **最新校系與提前分發指示（2026-10-29）：** 使用者已要求增加學校→學位→系所必填下拉（含學士、碩士、博士），並加入「只限同校同系／避開同校同系／都可以」雙向硬條件，取代舊版「不問科系」規則。目錄以教育部最新完整 114 學年資料、115 異動核定表及兩校現行官方資料交叉核對，共 417 個學位別選項，來源及同系群組規則見 [PROGRAM_CATALOG.md](PROGRAM_CATALOG.md)。使用者亦批准「只有高度契合才提前分發」：排程門檻至少 90 分、具體共同興趣及所有雙向硬條件符合；已配對者當期不重配，未達標者等待主要結算。只同選「其他」不算具體共同興趣。提前配對及寄送仍受全域寄信開關與本期暫停控制；不寄報名／驗證信。

> **每月期程與介面更新（2026-10-29，最新使用者指示）：** 自 2026 年 11 月開始每月一期，10 月不收件。台灣時間每月 1 日 00:00 開放、21 日 00:00 關閉（含 20 日整天）；21 日至月底為配對及結果分發期間，次月重新報名。公開介面只有「表單／統計／說明」三頁，預設直接顯示表單；說明頁用按實際月份天數分段的圓環說明時程，表單顯示月份與期次。截止後停用填寫與提交，API 獨立執行日期檢查。提前分發尚未啟用，不對使用者承諾已實作。

> **Owner update 2026-10-29 (latest):** Result emails now use Gmail SMTP over TLS from the Worker, replacing Cloudflare Email Service. No Workers Paid upgrade is required for this transport. Hosting and D1 remain Cloudflare. See [current review and Gmail runbook](REVIEW_2026-10-29.md). No signup or verification emails.

# Relou | Matching Engine 規格 v0.3（一次送出 / 無信箱驗證）

> 結果寄送使用 Cloudflare Email Service `send_email` Workers binding，配對資料與發信 outbox 在 Cloudflare D1 SQLite。正式網址目標 `https://relou.jjmowlab.com`。

> 首期 MVP：**明確硬條件 > 可解釋的配對分 > 一人最多配一次 > 可恢復的寄信。** 不是聊天機器人亂抽籤，也不以 MBTI 當戀愛科學。

## 1. 先定義「有效配對」

設 A、B 來自同一個 LOCKED round，均**自述為 NYCU 或 NTHU 成年參與者**、已填可供期末寄信的 Email、聲明 18+、未撤回、雙方同意分享聯絡資訊且未被管理員排除。**MVP 不驗證 Email 持有權或學生身份，也不要求登入或 OTP。**

**全部必須成立：**

1. `A.id != B.id`；兩者當期 `entry.status == eligible`，且此前沒有 committed match。Email 僅作通知收件地址和每期報名防重字串，**不代表真實身份**。
2. **雙向性別意願**：`accepts(A.desiredGenders, B.gender) && accepts(B.desiredGenders, A.gender)`。
3. `intentSet(A) ∩ intentSet(B) != ∅`，其中 friends={friends}，dating={dating}，either={friends,dating}。注意交集只代表兩者可能從交朋友或約會開始，通知不強加「你們正在交往」。
4. 若 A 或 B 任一選 `same_school`，學校必須相同。
5. 未存在檢舉／封鎖關係（若後續期次帶入阻擋，必須以私有且最小化的資料支撐）。
6. 有有效聯絡方式與明確獨立 consent；若 contactKind=submitted_email，僅使用此報名提交的 Email 並清楚承認此信箱**未驗證所有權**。

不允許 AI、管理員手動調分或相似度分數突破上述硬條件。**只要一方不願意，分數再高也不能配。**

### Gender 處理
- `man`、`woman` 與 `nonbinary`／`other` 對應選項各自明確。選 `all` 才接收所有性別。
- `undisclosed` 不可猜測；只與明確選 `all` 的人互容。
- 這是關於自願性與邊界的約束，不能拿 gender 或偏好當作「受歡迎程度」加權，亦不公佈小族群數據。

## 2. 分數（0–100 分，僅供排序）

先對每個硬條件互容 pair 求 features，component 在 [0,1]；**未知、可選未填、語義模型未啟用等應重新正規化權重，不算 0 分**。

| Component | Default weight | 規則 |
| --- | ---: | --- |
| 共同興趣 | 20 | `2 * |tagsA ∩ tagsB| / (|tagsA| + |tagsB|)`；可加小幅語意 tag grouping，但禁止沒有明確依據的近義合併 |
| 生活／溝通價值 | 30 | `dayOffStyle`、`conflictStyle`、`topValue` 各 10；相同 1、「both/depends」 vs 任一為 0.75、明確相反 0.2、topValue 不同為 0.35 |
| 聊天頻率 | 20 | `chatStyle` 相同 1、不同以固定對稱矩陣 0.2–0.6；優先尊重「每天分享」 vs 「直接見面」的大落差 |
| 初次活動 | 15 | `firstMeet` 相同 1；咖啡／散步／吃飯互為 0.65；其他不同給 0.2–0.45 |
| 自由回答語義共鳴 | 15 | **P1 開啟時才有**。兩者都填且經本人同意供語義模型處理，使用句向量相似度；無可用結果就**移除該 component 並把其餘權重正規化** |
| MBTI | **0** | 不做人格「相剋」、不作 hard filter、不影響排名 |

計算 `score = 100 * SUM(w_i * component_i) / SUM(available_w_i)`，保留 2 位小數。任何同一對 A-B 和 B-A 結果應相同。

**品質門檻**：`MIN_PAIR_SCORE=55` 作為暫定可調參數；必須以合成／自願試測資料檢查匹配率、分數分布後再決定，不要把 55 宣稱為科學界線。太低會把明顯不合的人勉強送出去；太高會大量落單。

**為何不直接把回答丟給 LLM 決定一切？** 太貴、太難重現、對敏感偏好不可靠、容易用自由文字引發 prompt injection。數值核與硬條件提供可測試骨架，AI 增強只動 ranking。

## 3. 最佳化方式

1. 建立候選無向圖 G=(V,E)，V 為本期 eligible entries。
2. 只對硬條件互容且 `score>=MIN_PAIR_SCORE` 的 pair 建 edge，edge weight 為 score（可轉 int：`round(score*100)`）。
3. 使用 **一般無向圖 maximum-weight matching，並設定 `maxcardinality=True`**（NetworkX `max_weight_matching`），意義是「**在不降低品質門檻下，先配到最多組，才最大化配對品質總分**」。
4. seed 固定且 node/edge 排序穩定，平分 tie 使用 deterministic hash tie breaker（不改變核心品質分大量級），重跑同一個 snapshot 得到完全相同結果。
5. 任何沒有邊的參與者落單；奇數筆必有至少一人落單。所有結果還要再通過 invariants 檢查。
6. 最後一筆 commit 必須透過 D1 batch 原子 SQL 與唯一約束保證每個 entry 僅寫到一個 match；`match_members` unique(round_id, entry_id) 讓 DB 成為最終防線。
7. 使用 D1 SQLite 支援的原子條件更新（CAS）、唯一索引與 `batch()` 原子寫入控制單一期次 commit；**不得使用 PostgreSQL advisory lock 或 `SELECT FOR UPDATE`**；兩個 worker 同時按下 commit 不得生成兩套結果。

### 量級
- 首期預計小量：直接建所有互容 edge，正確性優先。
- 若 >1000 筆或候選 edge 數爆量：先依硬條件分桶減少 edge，再針對每人至少保留雙向 top-K 邊並觀測 coverage；**top-K 稀疏化可能犧牲最大配對數**，因此須有統計警報、採樣驗證及足夠內存／時間的保守退路，不能悄悄當作精確最優。
- 分數、硬條件與 match 結果只保存在受保護資料庫，不能把候選對象列表放前端。

## 4. AI 增強（P1，預設 OFF）

**最低成本方案：** 只對第 12 題兩個使用者自願寫的文字，抽固定版本的多語 embedding，計算 cosine similarity，再做 [0,1] 的保守線性縮放與 clipping。先 cache 每個回答的 embedding，**每人只算一次**，不是 O(n²) 次 LLM 呼叫。

- 必須在隱私政策清楚告知模型提供者、資料類型、傳輸與用途，取得必要同意；沒同意的人這項權重移除。
- 不傳 email、IG、學校、性別意願等不必要個資到 embedding/LLM provider。
- 假如沒 API key、embedding API 失敗或有 rate limit，**自動退回 deterministic score** 並有可追蹤版本號；不要讓整期配對卡住。
- 開放式回答包含「忽略前面的指示」等字串視為**原始資料，不是指令**。不允許 prompt injection 影響配對硬約束。
- 若之後使用 agent 為候選對評分，只能 rerank 原本**硬互容的 top-K**，輸出固定 JSON component+reason，reason 不向使用者展示，且不能捏造使用者共同經驗。
- **不要用 LLM 假裝在測量「命定伴侶」**；沒有 ground-truth outcomes 前，只能說「興趣／相處偏好較相近」。

## 5. 行政控制、鎖池、寄信一致性

流程：`OPEN -> LOCKED -> DRY_RUN -> HUMAN_APPROVED -> COMMITTED -> OUTBOX_QUEUED -> SENT`。

- `lock` 時取得 immutable snapshot 的 entries，儲存 hash；中途撤回／修改不得影響本次已鎖結果（但若依法收到刪除請求則由管理流程人工處理）。
- `dry-run` 印出 aggregate report：eligible_count、valid_edges、matched_pairs、matched_users、unmatched_count、score_p10/p50/p90、intent 集合互容率、按學校的 aggregate counts（人太少不公布）。**不得洩漏個人資料到 Actions 的公開 log**。
- `commit --run-id` 必須驗證目前的 snapshot_hash 和 dry-run 所用版本一致，使用 D1 SQLite 可支援的原子化批次與唯一限制寫入 match / members / outbox；不能假設長時間多 HTTP request 跨事件交易。
- 每一位 eligible 參與者 exactly 1 個 terminal outcome：matched 或 unmatched；對應 1 筆 `email_outbox` 通知（成功則含對方經同意的暱稱與聯絡管道；未成功不寄候選名單）。
- outbox `dedupe_key = round_id + recipient_user_id + notification_version`（或等價唯一鍵）。
- `send` 只處理 queued/failed 且未超過 max attempts 的郵件。使用 Cloudflare Email Service `env.EMAIL.send` 原生 binding，寄件網域完成 onboarding 才可實際寄送；batch concurrency 可配置，遇 429 / transient errors 退避重試並記錄 provider `messageId`；模板測試不寄真信，**預設 EMAIL_DRY_RUN=true**。
- 必須有「人工預覽 1 封已遮罩信」與可停止的 emergency switch。記錄是否送成功、失敗原因和重試次數。
- 發送一半斷線後重跑 **不可重 match**；email 僅補寄必要紀錄。

## 6. 不能忽略的測試

**硬條件**
- A 男想配女，B 女不想配男 -> 不可互容。
- 朋友-only vs 約會-only -> 不可互容；either vs 朋友-only -> 可互容。
- 任一同校限定 + 不同校 -> 不可互容。
- 未滿 18 歲自述／未填 Email 或學校自述／未同意分享聯絡方式／撤回／已配／被管理員判定可疑 -> 不可互容。**不得因尚未 email verified 而拒絕，因本產品根本沒有驗證步驟。**
- gender=undisclosed，對方不是 all -> 不可互容。
- 任何 LLM 提供高分都不可推翻 hard filter。

**數值**
- 分數對稱 `score(A,B) === score(B,A)`，全域 [0,100]，未填自由回答不當作 0 分。
- 同樣快照、同 seed 得到相同匹配；無法匹配者不會被偽造結果。
- 4 人 contrived graph，greedy 只能 1 組但 global solver 可以 2 組時，必須找到 2 組。
- 5 人測試最多 2 組；每期 member 只可能出現 0 或 1 次。
- `dry-run` 沒 DB side effect；雙連 commit 不重複；模擬途中例外 DB rollback。
- 模擬 Cloudflare Email Service provider timeout／重試／重跑，不引入第二位對象或兩次結算。

## 7. 第一波建議

以固定一期結算：**一位參與者在同一期最多認識 1 位**。這能讓文案很簡單，也避免「輪抽到有」引入失衡與期待落差。

如果後續使用者真的想多認識：**下一期再報名**，屆時可以設「上期已配過的人不重複配」的私有去重與限期保存策略；不要現在做無限卡池。
