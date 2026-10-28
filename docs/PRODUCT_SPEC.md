# Relou | 產品與實作規格 v0.1

> 2026-10-29。**核心命題：讓清大／陽明交大已成年學生，花約 90 秒填寫一張真正有用的表單，在一期配對中遇見至少有話題、且彼此願意認識的人。**
>
> 本檔是可直接交給 coding agent 執行的 MVP 規格。表單逐題與配對演算法見另外兩份文件。還沒有配置生產環境、沒有開放收件。

## 0. 已定決策（MVP 不再反覆討論）

| 議題 | MVP 決策 | 理由 |
| --- | --- | --- |
| Google 表單 vs 自建 | **自建單頁響應式 Web form** | 品牌、手機體驗、後續驗證／修改／狀態／隱私／配對的控制權；工程量仍小 |
| 對象 | **18 歲以上、以 NYCU / NTHU 學生 email 驗證的參與者** | 保持同溫層及基本信任；具體 domain allowlist 需核實並可設定 |
| 科系／年級 | **一律不問科系**；也不要求學生證、長自介或照片 | 沒必要的篩選偏見與填寫成本 |
| 一次 vs 持續 | **一期一配、一期一次批次結算**，不即時在池中反覆翻牌 | 可控公平性、簡單、避免重複配對與寄信 |
| 一人配幾次 | **每期最多 1 位配對對象**；未配上不可無聲自動滾至下一期 | 清楚的預期與個資使用範圍 |
| 配對引擎 | **硬條件雙向滿足 + 可解釋的數值評分 + 最大權重配對**；語義分析為可關閉的增強層 | 可測試、可審計、無 API 也可跑 |
| 寄信 | **SMTP transactional sender + outbox + 重試** | 與使用者要求一致；避免發一半卻重配 |
| 上線型態 | 先一波（Round 1），人工設定截止和按下 dry-run / confirm / send | 不為首期過度建設自動化 |

**成功定義：** 首期收件、確認資格、可靠結算及通知完整閉環，而不是號稱「AI 能預測愛情」。

## 1. 使用者體驗與流程

1. 首頁只有一個清晰 CTA：「加入這期配對」。文案可用「不用填科系、不用寫作文，約 90 秒找到聊得來的可能」；**90 秒指表單回答時間，不包含 email 驗證**。
2. 使用者輸入學校信箱，寄一次性登入驗證連結（Supabase Auth magic link/OTP）；通過後在同頁填寫短表單。非白名單 domain 不接受；白名單必須依學校實際有效學生信箱域名核實，不猜測所有人都使用相同 domain。
3. 表單：彼此是否願意認識的硬條件 + 興趣 + 溝通／生活方式 + 1 題短自由回答 + MBTI 非必填（**0 分權重**）。詳細題目、選項與分數對應在 FORM_SPEC.md。
4. 送出即顯示已加入本期，提供剩餘報名時間、同帳號修改／撤回本期報名；鎖池後不可修改。
5. 到期後關閉收件、驗證資格並執行配對 dry-run。操作員看到總報名數／有效數／可配對數／落單數／最低與中位相容分／寄信需求量；人為確認後才固定結果。
6. 以 SMTP 依據不可重複的通知紀錄寄送「成功配對」或「這期沒有適合的雙向配對」。成功信包含暱稱、共同話題摘要、**參與者明確同意分享的聯絡管道**。預設不向對方公開驗證用學校 email。
7. 如沒配對，顯示「這期尚未找到互相符合條件的人」而不是標籤或分數；願意參與下一期必須再次確認。不要揭露他人報名資訊、候選名單或拒絕原因。

## 2. Round 生命週期

- 狀態：DRAFT -> OPEN -> LOCKED -> MATCHED -> NOTIFIED -> ARCHIVED。
- Round 1 報名期間 **建議 5-7 天**，由管理者設定，不在程式中寫死日期；先暖身招募，達到一定池量再結算。
- OPEN：可加入／修改／取消；LOCKED：所有有效資料 snapshot，杜絕競態與偷偷改偏好。
- MATCHED 後同一 round 的 participant 不可再次被配對；通知失敗**只補寄、不重新跑配對**。
- 結算必須以資料庫交易／冪等鎖執行，run_id + input_snapshot_hash 可稽核。dry-run 不寫真實 match／outbox。
- 下一期只能用本人明確新同意的資料或重新送出；不能默認把失配者永久放在池子裡。

## 3. 資料結構（推薦）

- `rounds`: id, slug, title, status, opens_at, closes_at, matched_at, notified_at, settings_json, created_at。
- `profiles`: auth_user_id (PK), school, nickname, gender (可空), verified_school_email（**後端私人欄位**）, contact_type, contact_value, contact_share_consent, adult_attested, created_at, updated_at。
- `entries`: id, round_id, auth_user_id, status, answer_version, answers_json, enrolled_at, withdrawn_at, consent_version, unique(round_id, auth_user_id)。在配對時以 immutable snapshot 建立凍結資料。
- `match_runs`: id, round_id, algorithm_version, seed, snapshot_hash, mode (dry_run / committed), metrics_json, created_at, committed_at。
- `matches`: id, round_id, run_id, score, score_components_json (管理端專用), created_at。
- `match_members`: match_id, round_id, entry_id, **unique(round_id, entry_id)**，每個 match 恰好兩名不同 entry；交易內一次寫完。
- `email_outbox`: id, round_id, recipient_user_id, template_type, dedupe_key UNIQUE, payload_json (避免存不必要敏感資訊), state (queued/sending/sent/failed), attempts, last_error, next_attempt_at, sent_at。
- `audit_events`: action, actor, round_id, meta, created_at；不得記錄密碼、token 或完整明文回答。
- `safety_reports`（輕量選配但建議有）: reporter_id, match_id, reason, created_at, resolution。
- 所有使用者資料表都設置正確 RLS；若含 email／聯絡方式的資料在 exposed schema，需採 private schema 或限定 service role + 對應 owner RLS，不得讓使用者讀到其他人的 entry。**不要以 user_metadata 作為管理員或學校身分授權依據**。
- 儲存最少資料，不蒐集出生年月日、電話、學生證影本、照片或地理位置。

## 4. 最小技術架構

- 前端：Next.js App Router + TypeScript + Tailwind CSS，mobile-first，同一頁表單 + 狀態頁。視覺不要照抄原 Threads 案例；純中文、清爽、可愛但不幼稚。
- 身分與資料：Supabase Auth school-email OTP / magic link + Supabase Postgres；使用 publishable key 在前端，service role 只放伺服器端／CI secrets。
- 後端：Next.js server actions / route handlers 驗證會話、input schema (Zod)、server-side domain eligibility、提交／修改與撤回。
- 配對：**Python + NetworkX CLI**（或充分測試過的同等最大權重 matching 函式庫），以保證能解一般無向圖非二分圖；Python 只用於離線批次任務，不需常駐 FastAPI 服務。
- 發信：SMTP transport（Nodemailer 或 Python smtplib）連 outbox，限制速率與重試；寄信工作用一次性管理命令／GitHub Actions workflow_dispatch 執行即可。
- 部署：Vercel + Supabase；`.env.example` 列所有必要變數，但不存秘密。GitHub Actions 密鑰請用 repo secrets；所有生產副作用需在使用者配置完成後才啟用。
- 未提供 Supabase project、SMTP 帳密與 Vercel 時仍需能 build、lint、跑測試及示範 fake data；不能假裝真實寄信成功。
- 實作時先檢查當前官方 Supabase changelog、Auth／RLS 文件並鎖定套件版本，別依賴過時 API。

## 5. API / 操作面

公開：
- `GET /api/round/current`：只傳公開的本期狀態、截止時間，不傳參與者名單。
- `POST /api/entry`：已驗證校園 email + 18+ + 反濫用 + Zod 校驗；同人本期 UPSERT。
- `GET /api/entry/me`：只讀本人報名與狀態。
- `DELETE /api/entry/me`：OPEN 期間退出，已寄給別人的聯絡方式無法撤回，介面需告知。
- `POST /api/report`：已認證且曾配對的人可檢舉，限速。

管理：
- MVP 可不做 dashboard，以管理命令為主：`round open`、`round lock`、`match --dry-run`、`match --commit --run-id`、`mail --preview`、`mail --send`、`mail --retry`、`round archive`。
- 私有管理 CLI 需檢查 admin key / GitHub Actions protected secrets；**不暴露公網「一鍵寄送」未認證 API**。
- 每次執行 log 統計，成功／失敗都可重入；必須可安全復原。

## 6. 信件與可送達性

- 驗證信交給 Supabase Auth（正式上線前配置自己的 SMTP 並測試）；通知信由 outbox 使用環境配置的 SMTP 寄出。
- 郵件不能露出整批收件人；**一封只寄一位**；明確標註「你參加的是哪一期」。
- 成功通知僅揭露對方同意分享的聯絡方法，例如 IG handle；**驗證用學校信箱預設不顯示**。若使用者選擇 email 作為聯絡方式，必須額外勾選同意，否則不可配對。
- 通知含 shared topic 作為破冰提示，但不洩漏私密自由回答全文、不顯示演算法相容分。
- 若是落單信：避免「你不受歡迎」式文案，寫為「這一期尚未有符合雙向意願的配對」。
- 發信 state + dedupe_key 保證重跑不大量重寄；傳送 SMTP 有網路不確定性，超時需先查回執／log 避免重複，並設 exponential backoff + manual retry。
- SMTP 需 TLS、SPF / DKIM / DMARC 與 sender domain 驗證。**不要用私人 Gmail SMTP 硬寄數千封**；大批寄送前評估服務商限制和額度；提供 `EMAIL_DRY_RUN=true` 預設。

## 7. 安全、隱私、信任（P0）

- 僅允許 18+，由使用者明確自我聲明；網站不能聲稱已獨立完成年齡查驗。
- 只有校園 email 的驗證身分才能報名，email allowlist 可配置。避免任意外部 email、假帳號與速率攻擊。
- 不公開名單、回答、真實姓名／信箱／聯絡方式；不建公開結果牆；成功配對僅雙方各自收到一封通知。
- 同意條款明示：用途、資料欄位、蒐集目的、一次性配對、是否公開聯絡方式、寄信方式、主辦者聯絡方式、刪除政策；個資資訊以台灣相關規定檢核，未完成隱私頁不得公開收件。
- 同意分享聯絡方式必須是**獨立且未預勾選**，拒絕則不能參加直接交換聯絡方式的配對。
- 放入檢舉／封鎖及安全須知（避免直接分享地址、第一次見面選公開場合）；主辦者可將疑似濫用帳號排除本期及後續期次。
- 使用 Turnstile 或同等 CAPTCHA、IP/email 限速、蜜罐欄位，不在 client 暴露服務密鑰。
- 適度留存：未啟用／未驗證報名定期清理；活動結束後 30 天清除自由回答及非必要 entry，除非有明確再參與同意；若有檢舉，按最小必要期間保存案件資料。提供刪除請求方法。
- 公開 repo 只能放假資料，沒有真实試填參與者的 PII，亦不記錄配對 scoring debug 明文到公開 CI logs。

## 8. 實驗與追蹤

漏斗 metrics（只看總量且避免暴露少數群體）：
- landing view -> email OTP sent -> school verified -> form started -> form completed -> consent eligible。
- 每期有效人數、雙向硬條件互容率、配對率、落單率、分數分布、寄信交付率與失敗率。
- 自願回饋：是否有開啟對話／破冰話題是否有幫助（非 P0；不追蹤私人訊息）。
- 分析時只用匯總匿名資料，不上傳整包完整個資給未經確認的模型廠商。

## 9. P0 / P1 / 非目標

**P0 必須上線**
- [ ] 首頁 + 驗證校園信箱 + 表單 + 本人狀態／撤回
- [ ] 18+、配對意向、雙向偏好、聯絡分享明確同意
- [ ] Round 管理與鎖池 + 雙向硬篩選 + 每人至多 1 配對 + dry-run
- [ ] SMTP outbox／成功信／落單信／重試與冪等
- [ ] schema migrations + RLS/授權 + rate limiting + 隱私／安全說明
- [ ] 測試、README、部署操作手冊、`.env.example`

**P1 有時間才做**
- [ ] 開放式回答 embedding 相似度（優先於全量 LLM 對談）
- [ ] 只對 top-K 候選用便宜 LLM rerank，配額／cache／隱私政策皆先備妥
- [ ] 小型 admin dashboard、活動結果圖表、更多回饋

**明確不做（MVP）**
- ❌ App、社群動態、聊天室、付費、照片、科系、人格精準預測、戀愛成功率宣稱
- ❌ 多人同時多重配對、無限池內持續重配、推播、公開排名、交友檔案瀏覽
- ❌ 以 MBTI 直接預測相容性或對任何人口群貼標籤

## 10. 驗收條件

1. 正常手機從連結進站、驗證學校信箱後能在約 90 秒完成表單（不含點信驗證），完全不要求科系。
2. 同一位使用者無法在一個 round 報名兩次、被配兩次或收到多份不同配對。
3. 任一性別／意向／校區硬條件不雙向互容時，**配對率必為 0**；有可用候選時可以被正確配上。
4. 跑 dry-run 10 次皆不修改 DB 配對紀錄或寄真信；commit 兩次回傳同一結果而非新增配對。
5. 收件者 A 的信不會出現除了其唯一配對對象以外的其他參與者資訊；只有經明確同意的聯絡方式才會傳給對方。
6. 發信被中斷後恢復可只補發待寄郵件；測試至少覆蓋一次 SMTP 假失敗。
7. Auth、RLS、非校園 domain 拒絕、報名鎖池、撤回、惡意輸入、未成年自述等有自動測試。
8. 本地 demo 使用合成資料完整演示：建立期次 -> 報名 -> 鎖池 -> dry-run -> commit -> email dry-run。
9. 無 SMTP / Supabase / Vercel secrets 時仍可在 CI build + lint + unit test；不能將 demo 誤顯為正式可用。
10. 在正式開放前人工測過真正 verification email、SMTP 實收、DKIM SPF、管理者復原流程、隱私頁與刪除聯絡窗口。

## 11. 宣傳實驗

- 主渠道：Dcard 清大／陽明交大相關校版、社團及校園二手／黑市社群，尊重版規，不大量重複洗版。
- 第一篇貼文聚焦「免科系、90 秒、一次配對」，公開本期截止日、何時通知、是否限清交、18+、個資處理頁，搭配獨立 landing URL。
- 先收有意願者並觀察成交流程，首期不是強調 AI 華麗，而是**配得準、寄得到、沒有被亂公開個資**。
