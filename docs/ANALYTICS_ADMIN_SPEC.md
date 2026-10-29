> **最新校系與提前分發指示（2026-10-29）：** 使用者已要求增加學校→學位→系所必填下拉（含學士、碩士、博士），並加入「只限同校同系／避開同校同系／都可以」雙向硬條件，取代舊版「不問科系」規則。目錄以教育部最新完整 114 學年資料、115 異動核定表及兩校現行官方資料交叉核對，共 417 個學位別選項，來源及同系群組規則見 [PROGRAM_CATALOG.md](PROGRAM_CATALOG.md)。使用者亦批准「只有高度契合才提前分發」：排程門檻至少 90 分、具體共同興趣及所有雙向硬條件符合；已配對者當期不重配，未達標者等待主要結算。只同選「其他」不算具體共同興趣。提前配對及寄送仍受全域寄信開關與本期暫停控制；不寄報名／驗證信。

> **每月期程與介面更新（2026-10-29，最新使用者指示）：** 自 2026 年 11 月開始每月一期，10 月不收件。台灣時間每月 1 日 00:00 開放、21 日 00:00 關閉（含 20 日整天）；21 日至月底為配對及結果分發期間，次月重新報名。公開介面只有「表單／統計／說明」三頁，預設直接顯示表單；說明頁用按實際月份天數分段的圓環說明時程，表單顯示月份與期次。截止後停用填寫與提交，API 獨立執行日期檢查。提前分發尚未啟用，不對使用者承諾已實作。

> **介面更新（2026-10-29，最新使用者指示）：** 進站直接顯示報名表，不設宣傳首頁、Hero、插圖或行銷區塊。頂部僅「填寫表單／統計」兩頁切換；統計移至獨立頁面，表單保留必要活動資訊及可展開的隱私說明。此指示取代舊有同頁統計區的版面要求。

> **Owner update 2026-10-29 (latest):** Result emails now use Gmail SMTP over TLS from the Worker, replacing Cloudflare Email Service. No Workers Paid upgrade is required for this transport. Hosting and D1 remain Cloudflare. See [current review and Gmail runbook](REVIEW_2026-10-29.md). No signup or verification emails.

# Relou | 公開統計與管理後台 Spec v1.0
2026-10-29 | 開發必讀 | 技術主軸 Cloudflare Workers + D1 + Access

## 1. 產品目標

除了「一頁填表、按送出即完成」以外，首頁應給訪客**真實但不暴露人群組成**的活動熱度：本期收到多少份有效報名、目前第幾期、截止倒數、預計公布結果的日期，以及若有上一期才顯示的歷史成果。

後台提供主辦者簡單漂亮的統計、期次／報名／配對／通知作業中心；**一般填表者完全不需要登入，只有管理員進後台才由 Cloudflare Access 登入**。

> 不公開男生／女生比率、性別分布、性向/期待認識的性別、單校性別結構、意圖（找朋友 vs 約會）分布、MBTI／各類人口組成，也不公開個人興趣回答或相容分數。這不只是隱私要求：公開性別比例很容易造成「看比例決定報不報」、競爭／稀缺感、錯誤配對機率想像與自我強化的報名偏差，干擾活動品質。**公開頁不顯示、公開 API 不傳送、前端 JS bundle 不藏這些欄位。**

## 2. Public site: 看得到的統計

建議導覽：`Relou` / `本期配對` / `活動怎麼玩` / `常見問題／隱私`。同一個 landing 頁下面就是短表單，**不要因統計另開登入或流程**。

### 首屏資訊卡（P0）

- **本期報名數**：`本期已收到 N 份報名`，只計算該 round 目前有效且未排除／未撤回的 entry，不計被管理員標記為 spam、測試資料或重複 submit。因為使用者沒驗證身份，**用「份報名」而不是號稱已核實有 N 個真實的人**。
- **活動期次**：`Relou 第 1 期`、狀態 `報名中` / `即將開放` / `配對中` / `已結束`。
- **截止倒數**：例如 `還有 4 天 12 小時`，依台灣 Asia/Taipei 時區的 server-specified `closes_at` 顯示；不可藏截止絕對時間。
- **預計通知日**：管理員可填，未設定就說 `報名截止後統一寄送`，不可虛構精確時間。

### 下方補充（P0 有資料才顯示）

- **歷期累計**：`累計收到 N 份報名`，只有 round ≥2 才顯示，定義是有效報名筆數而非真人去重。
- **過往配對組數**：`上一期促成 N 組配對`，只有已 NOTIFIED / ARCHIVED 的歷史期次才顯示；這是**系統完成配對的組數**，不是約會成功／交往數。
- **報名時間趨勢（P1 可選）**：7 日每日新增總數，**不按任何個人特徵細分**；每日少於 10 份時隱藏或合併成較大時間桶，防止少數人行為被旁觀推估。
- **興趣榜（P1 暫不做）**：排名會誘導填答者選流行興趣、讓演算法輸入失真，所以第一期不發布興趣 top-N；若以後真的需要，審核最低 k 門檻與過度稀疏類別。

### 絕對不能公開的資訊

- 男女人數、性別比、誰想認識什麼性別、男女配對比、各校性別比。
- 每個人的答案、Email、IG、身份/性別／意向、自由文字、候選 pair 或詳細分數。
- 校別分布、極小族群計數、尚未結算的預測配對率或可能成功率。
- 無資料時不可用假數字「已有 100 人加入」；顯示真實 0、活動尚未開放，或不顯示無意義歷史模塊。
- 宣稱「N 位已驗證學生」或「保證配對」：因沒有登入／信箱／在校驗證，這類文案是錯的。

### 公開 endpoint

`GET /api/public/stats`

```json
{
  "round": {
    "slug": "round-1",
    "title": "Relou 第 1 期",
    "status": "OPEN",
    "closesAt": "2026-11-05T15:59:00.000Z",
    "notificationTargetAt": null
  },
  "activeSubmissionCount": 86,
  "lifetimeSubmissionCount": null,
  "previousRoundPairCount": null,
  "asOf": "2026-10-29T01:00:00.000Z"
}
```

上面數字都是**示意 JSON，不可直接當正式 UI 值或假塞 seed**。欄位為 allowlist 序列化，**永遠不要回傳 DB 原始 `rows`、性別／意向或其他敏感 breakdown**。維持 30–120 秒 HTTP / edge cache，可接受最多約兩分鐘延遲；頻繁爬取無法從反覆查詢得知誰剛加入。跨期狀態要顯示當前期次，不可拿所有表的筆數充作本期。

## 3. 管理後台：Cloudflare Access 驗證，只針對主辦者

**建議（省維護）**：同一個 Cloudflare Worker + D1，部署兩個 Workers Custom Domains：
- `https://relou.jjmowlab.com`：**PUBLIC**，訪客可直接填寫／看公開統計。
- `https://admin.relou.jjmowlab.com`：**PRIVATE**，整個 hostname 由 **Cloudflare Zero Trust Access（Self-hosted application）** 保護，只有管理員指定的**完整 email allowlist** 可登入。

不需要單獨架另一台機器、另一個資料庫、自己的密碼管理或另一套後端。**整個 admin hostname 都保護**，減少只設定 `/admin` 卻漏掉 `/api/admin/*` 的可能。Cloudflare Workers Custom Domain 可在同一 Worker 綁多個 hostname；實際 SSL 和 DNS 必須帳戶部署測試，不可假裝完成。

**登入方式**：Cloudflare Access 的 Email One-time PIN（僅管理員）或現有 IdP SSO（若帳戶已連且更方便）。建議一期先用主辦者指定的一個完整 email allowlist，不用一個可讓整個 `@nycu.edu.tw` 登入的 email domain rule。Cloudflare Zero Trust 的 OTP 需要在帳戶中啟用/配置，請依當前官方文件。**這個 OTP 是管理後台專用，完全不會出現在一般人的報名流程。**

**雙重防線不可省**：

1. Cloudflare Access self-hosted app policy：只有指定的管理員 email 可登入 `admin.relou.jjmowlab.com`。
2. Workers **仍驗證** `Cf-Access-Jwt-Assertion` 的簽章及 `iss`、`aud`、expiry 和管理員完整 email allowlist，使用 JWKS 公鑰、處理 key rotation；不可只檢查 header 存在、cookie 存在或 JWT payload 字串，也不可將 admin secret 放前端。

Worker 依 `Host` 路由：
- 公開 host `relou.jjmowlab.com` 的 `/api/admin/*` 與 `/admin*` 一律 404/403，**即使有人偽造 header** 也不能經 public host 直接訪問管理入口。
- 管理 host `admin.relou.jjmowlab.com` 上的 `/api/admin/*` 和 admin UI 先通過以上 JWT 檢查；缺失時 401。
- 對任何 `workers.dev`、preview hostname 的 admin 路由也要拒絕，以防繞開 Access policy。
- 所有管理 API server-side 授權；不要依賴「隱藏按鈕」當授權。操作要檢查 state + anti-CSRF/Origin + 變更審計。
- Admin 允許以匿名匯總統計為主；個別報名查閱（必要的檢舉／清除流程）要獨立 permission 並留下 audit，預設遮罩 email 和 IG。
- Admin email 不要寫死在 public GitHub repo；由 Wrangler secret `ADMIN_EMAIL_ALLOWLIST` 與 Cloudflare Access policy 設定。Access JWT 所需的 `CF_ACCESS_TEAM_DOMAIN`／`CF_ACCESS_AUD` 設到 server-only secret/config。
- 避免把 Worker 整體啟用 Access 的保護導致公開報名也跳管理員登入；**只保護 admin hostname**。

## 4. Admin UI：簡易但真的能營運

建議路徑：管理 host `/` 就是 dashboard，tabbed navigation，手機可用但桌面操作為主。

### Tab 1：總覽 Dashboard（P0）
- 大 KPI：`本期有效報名`、`今日新增`、`已排除/可疑`、`距截止剩餘`。
- 報名趨勢：每日新增（7/14 天切換）與累積線圖，從 `entries.created_at` D1 GROUP BY 算得，預設 Asia/Taipei；不用對每次 pageview 寫 D1。
- 目前狀態：`OPEN/LOCKED/MATCHED/NOTIFIED`；資料更新時間 / 公開看板同步狀態。
- 行動優先：若期次到期但尚未 lock、可疑大量送出、Email sender 尚未配置等，顯示警示而不是隱藏。

### Tab 2：報名統計（P0）
- 送出成功、有效、排除、疑似灌單、同 email 重複攔阻總數（若事件計數器已實作；**沒有紀錄不能顯示 0 冒充**）。
- 不展示精細性別比例作為公開內容；管理端為檢查硬條件可查看**內部互容率/候選邊數與匿名失配原因**，首期不需要做一張性別占比圖。
- 實際為了反濫用需要個案檢視時才點擊 **人工審核** 開啟遮罩 email 的受限清單，逐筆取消資格 + 註記理由。不得下載明文所有資料的 csv 作預設動作。

### Tab 3：配對管理（P0）
- 管理員手動 `Lock round`、`Dry-run`、`Preview report`、`Commit matching`；這幾步不可在公開使用者 API 觸發。
- 聚合：候選有效人數、滿足雙向硬條件的 pair edges、配對組數、落單人數、配對率、平均/中位相容分、分數分布、異常或被排除人數。
- 結算前後必須有審核摘要與確認對話框，提醒不可隨便改後重寄。只顯示受保護 aggregate stats，不洩漏每組詳細聯絡資訊給前端瀏覽。
- 同一 locked snapshot / seed dry-run 結果相同；重新 dry-run 不 commit；commit 必須 idempotent。

### Tab 4：信件通知（P0）
- Outbox 統計：queued / sending / sent / failed / suppressed、最近失敗原因摘要、每日寄件額度／完成度（若能由 Cloudflare Email Service 取得真實資料；不能用假 quota）。
- `Preview email`（遮罩）、`Send results`（**需二次確認、正式寄送預設關閉**）、`Retry failed`、`Pause sending`。
- 無法寄信或尚未 onboard Email Service 時顯示 `寄送功能尚未配置` 而不是灰綠色假完成。
- 一人一封、dry-run 不實際寄送、遭誤填收件者有退訂／反映處理通道。

### Tab 5：期次與設定（P0）
- 建立/修改下一期（Round title, opens_at, closes_at, notification_target_at, match quality threshold；時間顯示 Asia/Taipei，資料庫存 UTC）；保存前 server-side 驗證。
- 當前期次 OPEN/LOCKED/ARCHIVED 控制；公開頁會依這個真實狀態同步。
- 最簡操作說明、資料保存期/清除工作、公開 support contact（由管理員可配置或 env 管理）。
- 最低必要 admin audit log：誰、何時、對哪一期執行何種變更；不記完整答卷或聯絡方式。

**P1 有餘力再做**：漏斗（真正有 client-side privacy-safe event tracking 才加 views/start/completed）；來源標記 UTM 聚合、過去期次比較、進階負載／寄信趨勢。不能因為畫 dashboard 就在頁面加入一堆追蹤 cookies 或敏感曝光。

## 5. API、資料與效能

- Public `GET /api/public/stats`：只回預定 aggregate 欄位，安全快取；即使有人反覆輪詢也不揭露性別或小樣本拆分。
- Admin `GET /api/admin/dashboard?round=...`, `GET /api/admin/rounds`, `GET /api/admin/matching/preview?round=...`, `GET /api/admin/mail/status?round=...`。
- Admin actions `POST /api/admin/round/lock`, `POST /api/admin/matching/dry-run`, `POST /api/admin/matching/commit`, `POST /api/admin/mail/send`, `POST /api/admin/mail/retry`, `POST /api/admin/mail/pause`, `POST /api/admin/round/settings`；Zod validation、JWT authorization、CSRF/Origin、state machine constraints 和 operation idempotency。
- `entries` 至少需要 (round_id, status, created_at) index；`matches`、`email_outbox` 適當 round/status indexes。初期在 D1 直接 aggregate 足夠；若流量較大，用短期 cache/snapshot 而不是每次掃全表。
- 若要完整阻擋濫用，可用 Cloudflare Turnstile + Workers rate limiting primitives（依當前文件/帳戶確認），IP 的原始識別盡量避免留存。若需要近似審計事件，只留可限時刪除的 hash/聚合計數。
- `activeSubmissionCount` 不能受 demo seed 影響，demo data 與 production D1 database 永遠分離。測試不可真寄信。
- 若使用 Cloudflare Web Analytics，可獨立看流量，但它不是報名數資料來源；沒有追蹤就不要虛構 funnel conversion。
- API 不可回傳 gender count、school ratio、intent ratio、MBTI/興趣分布或個人資料，即使前端不顯示也不行。

## 6. 重要測試 / 上線檢查

1. 一般用戶在公開域名 **不登入、不驗證 Email** 仍能看統計 + 一次送表單完成。
2. `GET /api/public/stats` 的 JSON 僅允許安全欄位，不含 sex/gender, desiredGenders, contact, email、個人資料。
3. 把相同 IP 不同身份測試資料提交後，統計只反映真正合法 active entries；撤銷／排除／鎖池後數字正確。
4. Admin host 未登入會由 Cloudflare Access 擋下；公開 host/worker.dev 直接請求任何 admin API 都是 401/403/404。
5. 即使偽造 `Cf-Access-Jwt-Assertion` header 或拿其他 Cloudflare Access application JWT，也不能進後台（簽章、issuer、aud、email allowlist 都須檢查）。
6. Access 登入只允許完整 allowlisted 管理員 email，不能使用整個學校信箱 domain 這種過寬規則；管理員登入**不影響**參與者一頁表單。
7. 未經批准不能 LOCK/COMMIT/SEND/RETRY；重複點擊或 worker retry 不應造成重配或重寄。
8. 報名狀態/配對/寄信故障能從後台判斷，不顯示虛構資料；所有操作有必要的審計與遮罩。
9. Cloudflare Email Service sender onboarding 與 domain DNS/HTTPS 都要在公開服務前實測；沒有帳戶權限只做程式/文件，不可宣稱已上線。

## 7. 雲端管理員設置（部署者照做）

- [ ] Cloudflare Workers 綁兩個 custom domains：`relou.jjmowlab.com`（公眾）及 `admin.relou.jjmowlab.com`（管理）。
- [ ] Cloudflare Zero Trust > Access > Applications > 建立 **Self-hosted** 應用，保護**整個** `admin.relou.jjmowlab.com`，不保護一般 `relou.jjmowlab.com`。
- [ ] 設定 Login method：官方 Cloudflare identity provider 或 One-time PIN，按帳戶實際可用方案啟用；Allow 僅指定 1–少數**完整**管理員 Email。
- [ ] 取得 Cloudflare Access `Application Audience (AUD)` 與 team domain `iss`，透過 Wrangler secrets/config 配置 Worker，驗證 JWT 簽名與 claim。
- [ ] 測試公開域名仍能無登入報名，管理域名直接進入會先要求 Access 登入，公開域名、preview、workers.dev 都無法繞過後台驗證。
- [ ] 管理 UI 連後台 API 使用同源 admin host，D1 單一 binding，Email 寄送預設 dry-run。
- [ ] 設定、驗收並測試 Cloudflare Email Service 實際發信權限後才開 Round 1。

官方參考（部署時以最新為準）：
- Cloudflare Workers Custom Domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Protect a Worker with Access: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Cloudflare Access self-hosted apps: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/
- Cloudflare One-time PIN login: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- Verify Access JWT in Worker: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
