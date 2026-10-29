> **介面更新（2026-10-29，最新使用者指示）：** 進站直接顯示報名表，不設宣傳首頁、Hero、插圖或行銷區塊。頂部僅「填寫表單／統計」兩頁切換；統計移至獨立頁面，表單保留必要活動資訊及可展開的隱私說明。此指示取代舊有同頁統計區的版面要求。

> **Owner update 2026-10-29 (latest):** Result emails now use Gmail SMTP over TLS from the Worker, replacing Cloudflare Email Service. No Workers Paid upgrade is required for this transport. Hosting and D1 remain Cloudflare. See [current review and Gmail runbook](REVIEW_2026-10-29.md). No signup or verification emails.

# Relou | 90 秒單頁表單 v0.2（無信箱驗證）

> **一頁完成、一次送出。沒有 email OTP、magic link、帳號註冊、登入、收信確認。** 不問科系、不問年級、不要求照片或長自介。Email 直接放在表單最後（或開頭），僅供期末寄配對結果，任何可收信地址都可以。姓名/學校是自述，**沒有做身分或在校驗證**。

## A. UX 硬規則

- 進站 -> **單頁一次填寫** -> 按「送出報名」 -> D1 寫入 -> 顯示「報名成功」；流程結束。
- 不拆成「先填 email -> 去收驗證信 -> 回網站 -> 填表」；不寄立即確認／驗證信，也不要求再次點擊。
- Cloudflare Turnstile 優先無感，碰到風險時才挑戰；儘量不造成額外關卡。
- **學校自述**：NYCU / NTHU。Email 可 Gmail、Outlook 或學校信箱，不依 email domain 核實學校或歸屬。這會有假報風險，不能宣稱「僅真實學生通過」。
- **Email**：必要的期末通知收件地址，不提供 email 確認流程；提示「請檢查拼寫，填錯可能收不到結果」。僅驗證 Email **格式**，這不是 Email **持有驗證**。
- 開放期數、截止日從後端載入。不提供登入後本人報名狀態與公開搜尋報名者功能。
- 一份表單包含必要的 18+ 勾選、資料使用同意、聯絡方式分享同意（不可預勾），點送出即一起送入 API。
- 為避免無登入下冒名改資料，既有相同 normalized email + round 報名不允許未授權覆寫；需要人工協助修正/撤回時提供主辦者聯絡方式（不要給任何人「只輸 email 即可刪資料」的 API）。

## B. 問題清單

| # | 表單問題 | 選項 / 限制 | 必填 | 用途 |
| - | - | - | - | - |
| 1 | **你是哪一校？** | 陽明交大／清大（自述） | 是 | 同校限定檢查（自述，非身分認證） |
| 2 | **想怎麼稱呼你？** | 暱稱 2–16 字 | 是 | 結果信稱呼，**不參與匹配分** |
| 3 | **你的性別？** | 男／女／非二元／其他／不想說 | 是 | 雙向意願判斷，不以性別加分 |
| 4 | **你願意認識誰？** | 男／女／非二元或其他／都可以（可複選） | 是 | 雙向硬條件 |
| 5 | **來 Relou 想遇見？** | 新朋友／約會看看／都可以 | 是 | 雙向意圖硬條件 |
| 6 | **跨校 OK 嗎？** | 同校優先（硬限定）／清交都可以 | 是 | 雙向硬條件 |
| 7 | **最近喜歡什麼？** | 1–4：運動健身／籃球／羽球／音樂／電影影集／遊戲／咖啡探店／美食／戶外旅行／攝影／閱讀／科技 AI／其他（短字） | 是 | 興趣共同話題 |
| 8 | **放假時你比較…** | 先規劃／隨興／都行 | 是 | 相處節奏 |
| 9 | **意見不同時希望…** | 先聽懂彼此／直接說清楚／看情況 | 是 | 溝通方式 |
| 10 | **理想相處頻率…** | 常常分享小事／有話深聊／比較愛見面 | 是 | 訊息節奏 |
| 11 | **第一次互動想…** | 咖啡／散步／運動或活動／吃東西／先線上聊 | 是 | 共同活動 |
| 12 | **一段關係最重要的是…** | 真誠溝通／彼此自在／一起成長／相同熱愛 | 是 | 價值觀 |
| 13 | **最近讓你著迷的是？** | 0–100 字，一句即可 | 否 | 結果信話題摘要 / P1 語義 |
| 14 | **MBTI？** | 16 型／不知道／跳過 | 否 | 彩蛋，配對 **0 分權重** |
| 15 | **結果要寄去哪裡？** | Email 格式，常用收信地址（例如 Gmail OK） | 是 | **只有期末結果通知** |
| 16 | **配對成功後，對方要怎麼找到你？** | **IG 帳號（主選項，推薦）**：填 `@username`；**我沒有 IG／想用 Email**：選擇分享本次填寫的收件 Email。擇一即可 | 是 | 期末僅提供給唯一配對對象；須另外勾選未預勾的分享同意 |

其中題目 1–12 是大量一鍵作答的 chips。題目 13/14 可直接跳過；不要為了補字數拖延完成時間。可在使用者測試後合併或刪掉低訊息量題目，把平均完成目標壓在 90 秒內。


### 聯絡方式的兩個角色（必須嚴格分開）

- **收結果 Email**：每人必填，活動結算後系統寄信給本人。**不會因為填了 Email，就自動分享給配對對象。**
- **想給對方的聯絡方式**：以 **Instagram 帳號為主要選項**，輸入 `@username`（可接受沒有 `@` 的 username，後端正規化；IG 文字長度/字元需驗證，不允許任意 URL 注入）。沒有 IG 或不想提供 IG 的人，可主動選「使用我剛才填的 Email」。兩者擇一，絕不在沒有明確選取的情況下分享 Email。
- 這只是一個表單內的選擇，**不須開 Instagram 驗證、不需登入社群、不新增第二關**。IG 可能打錯或非本人，這是無驗證模式的已知風險，表單提示再次確認帳號。
- 結果 Email 範例：「🎉 你與小魚配對成功！共同話題：音樂、咖啡。對方同意分享的聯絡方式：IG @littlefish（附安全組成的 profile link）。」對方只看到指定的 IG；只有明確選 Email 時才看到 Email。
- 沒有選聯絡方式或未勾選獨立分享同意，就不接受送出，避免系統配對後卻無法讓雙方認識。

### 送出時的勾選

- `adultAttested`: 「我已滿 18 歲」。
- `shareContactConsent`: 「若成功配對，我同意將自己**選定的聯絡方式**提供給唯一配對對象。」**未預勾**。
- `privacyConsentVersion`: 「我已閱讀活動的資料使用與刪除說明。」**未預勾**。內容應清楚說明可能誤填 email 或冒名造成誤寄風險，以及聯絡窗口。
- 這些勾選是**表單內的同意欄位**，不是額外驗證步驟。

## C. 顯示文案

首頁：**「清交月老 Relou」**；「沒有科系、沒有長自介。90 秒，認識一個可能聊得來的人。」

Email 欄提示：**「只用來寄這期的配對結果，不用驗證。請填你會收信的 Email，並檢查有沒有打錯。」**

送出成功：
> **已收到你的報名 💌**
> 你已加入第 X 期。截止後會統一配對，結果寄到你填的 Email。這期最多配到 1 位，也可能因雙向條件沒有合適對象而落單。
> **不必再做任何事，也不用開信箱驗證。**

重複 / 異常請採不揭露 email 存在狀態的泛用提示，不能回傳原始報名資料。正式使用者如需撤回或更正，顯示主辦者聯絡方式及人工核對流程。不要自動寄「有人填了你的 email」信造成灌信。

## D. TypeScript/Zod 參考

```ts
type Gender = "man" | "woman" | "nonbinary" | "other" | "undisclosed";
type Intent = "friends" | "dating" | "either";
type CampusPreference = "same_school" | "either_school";
type ContactKind = "instagram" | "submitted_email"; // Email is unverified

type RelouAnswersV2 = {
  schoolClaimed: "NYCU" | "NTHU";
  nickname: string;
  gender: Gender;
  desiredGenders: ("man" | "woman" | "nonbinary_or_other" | "all")[];
  intent: Intent;
  campusPreference: CampusPreference;
  interests: string[];     // 1..4
  dayOffStyle: "plan" | "spontaneous" | "both";
  conflictStyle: "listen" | "direct" | "depends";
  chatStyle: "often" | "deep" | "meet";
  firstMeet: "cafe" | "walk" | "sports" | "food" | "chat_first";
  topValue: "honesty" | "ease" | "growth" | "passion";
  openAnswer?: string;     // 0..100
  mbti?: string | null;    // always 0 matching weight
  notificationEmail: string;
  contactKind: ContactKind;
  contactValue?: string;   // IG when selected; email is notificationEmail
  adultAttested: true;
  shareContactConsent: true;
  privacyConsentVersion: string;
};
```

後端 email normalization 至少要處理 trim + domain casefold，避免錯誤地改寫 local-part；不要做 Gmail dot stripping 等猜測性轉換。用 `UNIQUE(round_id, normalized_email)` 防重；**並不能防止假信箱、冒名、同真人多信箱**。伺服端 Escape 所有顯示文字並作惡意輸入檢查，不能把自由回答當 agent 指令。Cloudflare Turnstile token 必須 server-side 驗證，通過後才准寫入。

## E. 合成資料案例

1. NYCU/男/想認識女/約會/跨校可以/籃球+音樂/咖啡。
2. NTHU/女/想認識男/都可以/跨校可以/運動+音樂/咖啡。
3. NYCU/女/想認識女/交朋友/只同校/閱讀+電影。
4. NTHU/男/想認識男/交朋友/只同校/攝影+遊戲。
5. NYCU/非二元/願認識全部/都可以/跨校可以/AI+音樂。

測試使用 `example.invalid` 或 mock 收件器，不寄到真實電子信箱，不得把真實使用者資料推上 GitHub。


### 自填其他興趣

選取「其他」後顯示三個選填短文字欄位，每項最多 30 字；未選「其他」時不提交自填內容。允許全部留白。資料以 `customInterests` 陣列保存在私人 `answers_json`，不出現在公開統計，不直接參與分數，也不將原文加入結果信。原本 100 字自由回答維持選填。
