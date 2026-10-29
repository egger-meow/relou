> **Owner update 2026-10-29 (latest):** Result emails now use Gmail SMTP over TLS from the Worker, replacing Cloudflare Email Service. No Workers Paid upgrade is required for this transport. Hosting and D1 remain Cloudflare. See [current review and Gmail runbook](REVIEW_2026-10-29.md). No signup or verification emails.

# Relou | Product Spec v0.3：一張表單、一次送出

> **最後確認的使用者要求（2026-10-29）：不需驗證 Email、不需登入、不要點信箱確認。填好表單按一次「送出」，看到成功畫面，即為本期報名完成。**
>
> 正式網址目標：https://relou.jjmowlab.com。Cloudflare Workers + Static Assets + D1 + Cloudflare Email Service，無 Supabase 或 Vercel。正式服務尚未部署／開放，見 [CLOUDFLARE_DEPLOY.md](CLOUDFLARE_DEPLOY.md)。

## 0. 產品原則與決策

| 項目 | MVP 決策 |
| --- | --- |
| 產品 | 清交成人校園自願參與的一期一位 1:1 配對實驗 |
| 首頁流程 | **一頁填寫 -> 一次送出 -> 當場成功** |
| 帳號 / email | **不建立帳號、不登入、不發驗證信、不使用 OTP / magic link，不要求寄信點確認** |
| 信箱用途 | 收取**結算後配對結果**；任何常見有效格式 Email 皆可，不強制學校信箱 |
| 校園範圍 | 自填 NYCU 或 NTHU；**因無身份驗證，屬自我聲明，不能宣稱已核實為在校生** |
| 年齡 | 須自行勾選已滿 18 歲；不做身分證檢查 |
| 科系 / 年級 | **不問科系／年級／學號**，不要求照片或長自介 |
| 表單重點 | 雙向意向、興趣、相處／價值觀、短自由回答可選、MBTI 可選且 0 分 |
| 配對 | 一期一次 batch 結算，雙向硬條件 + 品質分 + 全域最大配對數後總分最大化 |
| 配對次數 | 一期最多配一位，落單不自動保留至下期 |
| 結果／聯絡方式 | **每人填「收結果 Email」+「要分享給對方的聯絡方式」**。預設推薦 IG 帳號，沒有 IG 才選主動分享 Email。期末寄信到前者，信中包含對方明示同意分享的後者；不可因為填了 Email 就自動公開給對方 |
| 信件技術 | Cloudflare Email Service + D1 outbox；**只寄結果／必要營運通知，不寄入池驗證信或立即確認信** |
| 管理 | Round 1 人工開關池、人工 dry-run / commit / send |

**關鍵取捨：** 單頁無驗證的代價是無法證明信箱屬於誰、校園身分為真或達成「同一真人唯一帳號」。不能寫成「已驗證信箱」或「清交認證」。以低摩擦招生 + 反機器人／人工營運降低風險，不可誤把 email 格式檢查當持有驗證。

## 1. 唯一參與者流程

1. 從 Dcard / 校園社群點入 Relou 單頁：清楚標示本期截止與通知日、每人一期最多一位、無法保證一定配到。
2. **同頁回答全部問題**：學校（清大／陽明交大，自述）、暱稱、Email（任意可收信地址）、偏好、興趣、價值觀和可選短回答／MBTI。聯絡管道可以選 IG 帳號或本人自填的 Email；只在明確同意分享後加入配對。**不需要先填 Email 等信，沒有兩階段流程。**
3. 勾選「我已滿 18 歲」「我了解可能分享所選聯絡方式」「我了解本次資料使用與保存」；這些是**在表單內**勾選，不是寄到 Email 的驗證。
4. 按一次「送出」：前端 Zod / server-side validation、Turnstile 及速率限制，Worker 原子寫入 D1。回傳報名成功頁；**不寄任何立即確認／驗證信、不要求其他點擊**。
5. 截止前禁止外部透過查 email 獲得別人的個資或覆寫報名。重複提交相同 round + 正規化 email 時，DB 唯一約束防止第二份報名，API 對外回覆不得洩露此信箱是否已存在；**不能讓未經身分驗證者只靠輸入別人 email 就修改／撤回紀錄**。如須更正/撤回，首頁提供主辦者聯絡方法，以人工方式審核處理。
6. 管理者截止時鎖池，審核異常大量／重複／無效資料，配對 dry-run，確認結果再 commit。
7. 期末 Cloudflare Email Service 批次寄**結果通知**至自填 Email。成功者僅獲知自己唯一配對對象經明示同意的聯絡方式及破冰話題；落單者收到不貼標籤的通知。通知包含誤收信處理/退訂或主辦者聯絡資訊。
8. 下一期需要再次填寫與同意。第一期不做登錄後個人中心／即時配對狀態頁。

### 透明提示（表單上直接可見）

「信箱只用來收到這期的配對結果，不需要驗證。請確認拼寫正確，填錯可能收不到通知。學校資訊由你自行填寫，平台不會驗證學生身分。」

## 2. 報名與 Round 狀態

`DRAFT -> OPEN -> LOCKED -> MATCHED -> NOTIFIED -> ARCHIVED`。

- 開放報名建議約 5–7 天，截止日管理員設定。
- OPEN：接受一次性提交；不做使用者登入；提交後不可透過公共 API 查詢/修改/撤回他人的資料。
- LOCKED：管理員凍結 eligible entries 的快照與 hash，除依法刪除請求等管理處置之外不可修改配對候選資料。
- MATCHED：同一 entry 每期最多出現於一組 match，SQLite 唯一約束做底線。
- NOTIFIED：outbox 寄送完成或清楚記錄部分失敗；重試不改配對。
- 不自動留池續期；若有手動撤回／誤收信／申訴，依隱私說明與可驗明申請者的人工流程辦理。

## 3. Cloudflare D1 SQLite schema

- `rounds(id, slug, status, opens_at, closes_at, settings_json, ...)`
- `entries(id, round_id, normalized_email, school_claimed, nickname, gender, contact_type, contact_value, adult_attested, contact_share_consent, privacy_consent_version, answers_json, status, submitted_at, ...)`，**unique(round_id, normalized_email)**；只存必要資訊，不假設 email owner verified。
- `match_runs(id, round_id, snapshot_hash, seed, algorithm_version, mode, metrics_json, committed_at, ...)`
- `matches(id, round_id, run_id, score, score_components_json, ...)`
- `match_members(match_id, round_id, entry_id, unique(round_id, entry_id))`
- `email_outbox(id, round_id, entry_id, template_type, dedupe_key UNIQUE, payload_json, state, attempts, provider_message_id, sent_at, ...)`
- `admin_audit_events(action, actor, round_id, meta, created_at)`
- `suppression/abuse_reports` optional private operational tables。
- **不需要 `users`、`auth`、`sessions` 或 `otp_tokens`。** 沒登入就不做使用者 owner API；D1 binding 只能在 Worker server；admin 操作透過 Cloudflare Access 或保護金鑰執行。
- Email/IG/自由回答不得公開或出現在 CI logs。過期資料定期清理，首期可於完成後 30 天刪除非必要回答，主辦者應在隱私頁寫明確期限。

## 4. 實作架構

- UI：React + Vite + Tailwind + TypeScript，mobile-first 單頁表單 + 送出結果頁 + 目的/隱私頁。
- API：Cloudflare Workers + Hono + Zod，`GET /api/round/current`（只公開期次資料），`POST /api/entry`（**唯一使用者寫入 API**）。
- Form backend：校名自述、正常 email 格式檢查（可以 Gmail，不需校園 domain）、server-side Turnstile、rate limit、蜜罐欄位、來源檢查、18+／同意欄位校驗、D1 unique。
- 不提供無登入的 `GET /api/entry/me`、`PATCH /api/entry/:id`、`DELETE /api/entry/:id`，更不能以 email 查出既有資料。
- Admin：私有 CLI/受 Cloudflare Access 保護的 APIs：`round open/lock`, `match dry-run/commit`, `mail preview/send/retry`, `round archive`。
- Matcher：一般無向圖 maximum-cardinality then maximum-weight matching。可先用 Python NetworkX **離線管理工具**，或具備等價測試的 TypeScript solver；不可簡化成不保證品質的貪婪演算法。
- Data：D1 SQLite migrations、原子 `batch()` + CAS + UNIQUE，注意 D1 不能假設 PostgreSQL lock/transaction。
- Email：Cloudflare Email Service native `send_email` binding + `EMAIL_DRY_RUN=true` 預設，outbox 可補寄但避免重複；SMTP/DKIM 實際可用性需查帳戶並確認 sender onboarding。
- Deploy：Wrangler Cloudflare Worker custom domain `relou.jjmowlab.com`，需真實設定 D1 ID／sender／Turnstile secrets，不能假裝已經部署。

## 5. 安全、隱私、信任

- **沒有 Email 驗證的風險需明示：** 使用者可填錯 Email；惡意者可能填入別人的 Email，造成誤寄；學校也只是自述。反機器人 + 人工審核只能降低，不可能證明真實所有權。
- 以 Turnstile（盡量無感）、IP 和 email rate limits、honeypot、每期 Email 唯一鍵、可疑大量新增／快速提交流量的人工審查，降低灌單。
- **不得因為沒有驗證就自動放寬隱私保護。** 寄出前人工審查不尋常資料；一封只有一個收件者；最小化分享對象個資；在結果信加入「如果你沒有報名」的聯絡/刪除指示。
- 只收必要 Email、暱稱、學校自述、配對答案、選定聯絡方式和同意紀錄；不收電話、照片、實名、學號、生日或地址。
- 聯絡方式分享同意不得預勾選；個資告知包含配對用法、收件用途、分享範圍、保存期、主辦者聯絡方式。資料不得交由未經告知的 AI 服務處理。
- 禁止公開參與者清單或每人分數；不能聲稱匹配能保證戀愛成功。
- 未成年人不能參加（自述 18+）；放入檢舉／安全說明與後續聯繫管道。

## 6. 成功指標

- 使用者約 90 秒內直接填完 -> 送出 -> 看見報名成功（**0 封事前驗證信、0 次額外點擊**）。
- 任一同 Email 本期不能產生兩份 eligible entries；用 email 字串只是防重，不是認證唯一真人。
- 所有候選配對都符合雙向意向（性別／朋友或約會／同校偏好）；每期一人最多一組；評分對稱可測。
- dry-run 不能寫 matches/outbox；相同快照與 seed 重跑結果一致；重複 commit 不產生第二次配對。
- 無法因未驗證的公共使用者 API 查到、修改或刪除別人答案。
- 配對信只含唯一互配對象自願共享的資訊；SMTP/provider 失敗可追蹤恢復，預設不寄真信。
- 無 Cloudflare secrets 仍可在本地運行 demo、測試及 build；正式域名及發信要經實際檢查。
- 完整行動版、繁體中文、沒有科系欄、沒有 email 登入／驗證。

## 6A. 公開統計與管理後台（P0 新增需求）

**完整設計見 [ANALYTICS_ADMIN_SPEC.md](ANALYTICS_ADMIN_SPEC.md)，實作優先級為 P0。**

- 公開首頁在表單附近顯示**真實**「本期已收到 N 份報名」、第幾期、狀態、截止倒數、預計結果通知日；過往配對組數/累計人次只在有真實歷史資料時顯示。因未驗證人身分，數量定義為「有效報名份數」，不是「經驗證學生人數」。
- 公開**不顯示、也不透過公開 API 輸出**男女數量/比例、各性別偏好、校別比例、相處或約會意圖構成、MBTI 族群數量及個人答案。這可能誘發因性別比率而自我篩選報名、造成錯誤的競爭感，亦有小群體隱私風險。
- 管理後台為單獨 `https://admin.relou.jjmowlab.com`，**同一 Cloudflare Worker/D1** 但全域由 Cloudflare Zero Trust Access 保護，僅精確指定的管理者 Email 可透過 Access 登入。一般 `relou.jjmowlab.com` 仍不登入。
- Worker 必須驗證 Admin Access JWT 簽章、issuer、audience、expiry、允許 Email；公開/preview/workers.dev host 上任何 admin 路由都拒絕。
- 後台功能：本期有效報名/每日新增/可疑筆數及每日趨勢、round 開關、配對 dry-run 聚合與確認 commit、email outbox 等待/成功/失敗/重試及安全寄送、期次設定與操作稽核；禁止在後台偷偷開未認證公眾資料讀取端點。
- 若缺 Cloudflare Access 帳戶設定，仍要實作受保護 UI/API 並附有 Cloudflare 手動設定清單；不得假設已開通、不得擅自用使用者登入方案替代。
- 公開統計數字源於 Cloudflare D1 active entry SQL，短暫快取，不能假造數據；性別統計首期後台也**不是必要 P0 dashboard 圖**。

## 7. P0 / P1 / 不做

P0：單頁報名（Email 在同頁）＋單次送出成功、D1、Turnstile、18+、同意、round management、batch matcher、Email Service 期末通知與 dry-run、測試及部署手冊。

P1：自由文字 embedding（使用者知情同意、可關閉）、小型管理儀表板、可選追蹤回饋。

不做：登入註冊、Email OTP／magic link、事前確認信、個人 dashboard、聊天、照片、科系、無限配對池、匹配分數公開。
