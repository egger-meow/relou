# Relou | 清交月老 💌

**90 秒填完，按下送出就成功報名。**

Relou 是清大／陽明交大校園的成人單期 1:1 配對實驗。以幾道興趣、相處方式與價值觀的題目，為有意願的人找一位可能聊得來的對象。不問科系、不用照片、MBTI 不強制。

## 核心使用流程（不可擅自增加關卡）

**開啟 https://relou.jjmowlab.com → 填寫單頁表單（包含收件 Email）→ 按「送出」→ 畫面顯示報名成功。** 

- **沒有註冊、登入、OTP、magic link、Email 驗證、收信確認或第二次點擊確認。**
- Email 只用來在本期配對結算後收到結果，**不驗證收件者是否持有它**；學校校域僅可做字面格式篩選，不能宣稱身份已驗證。
- 請填可收信的信箱，填錯可能收不到結果。送出後不要求使用者開信，亦不強迫寄立即確認信。
- 後端 D1 記錄成功入池並回應 receipt。防濫用用 Turnstile、限速、honeypot、每期 Email 唯一鍵、管理端黑名單；不以驗證信取代這些措施。
- 一期最多配一個，期末批次寄信；不提供公開候選者資料。

## 網域與部署

**https://relou.jjmowlab.com** （正式目標，尚未確認部署）

- Cloudflare Workers + Static Assets：React / Vite / TypeScript UI，Hono API
- Cloudflare D1 SQLite：一頁表單報名、分期資料、配對與 Email outbox
- Cloudflare Email Service：**只寄期末配對通知／必要營運通知，不寄 OTP 或驗證信**
- Cloudflare Turnstile + Worker rate limits：機器人防護
- 不用 Supabase、Vercel、登入系統或外部資料庫

## 開發規格

- [單頁問卷](docs/FORM_SPEC.md)
- [產品與流程](docs/PRODUCT_SPEC.md)
- [配對引擎](docs/MATCHING_SPEC.md)
- [Cloudflare-only 部署](docs/CLOUDFLARE_DEPLOY.md)
- [Agent 工作指令](AGENTS.md)

**狀態：** 規格已建立，目前尚未確認網站實際部署或開始正式收件。本 repo 禁止提交真實參與者資料與 API secrets。
