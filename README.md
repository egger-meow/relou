# Relou | 清交月老 💌

**一分鐘多一點點，把「聊得來」留給演算法。**

Relou 是一個清大／陽明交大成年學生的、**一人一期最多一位**的輕量配對實驗。90 秒回答幾道興趣、相處偏好與價值觀的題目，不問科系、不必照片、不強迫 MBTI。報名完成後，在該期結束時進行公平、雙向同意的配對，結果私下寄送。

## 正式網址（預計）

**https://relou.jjmowlab.com**

> 網域已選定，**目前尚未部署、未確認 DNS/HTTPS 已接通，亦未開始接受真實報名。**

## 技術架構（已定案）

- **Cloudflare Workers + Static Assets：**前端、API、網域 HTTPS；推薦 React + Vite + TypeScript + Tailwind，Hono API。
- **Cloudflare D1 (SQLite)：**使用者、驗證／session、本期報名、配對快照、結果、信件 outbox。
- **Cloudflare Email Service (Workers `send_email` binding)：**寄送驗證信和 1:1 配對結果，預設 dry-run、需要配置寄送網域／額度。這是 Cloudflare 原生寄送，不是 Nodemailer SMTP。
- **Cloudflare Turnstile + Worker rate limits：**防機器人濫用。
- **Wrangler / Worker Custom Domain：**部署到 `relou.jjmowlab.com`。
- **不使用 Supabase、Vercel 或外部資料庫**。

## 開發文件

- [Cloudflare-only 部署、D1、Auth、Email 規格](docs/CLOUDFLARE_DEPLOY.md)
- [產品、資料與運營規格](docs/PRODUCT_SPEC.md)
- [90 秒表單與題目](docs/FORM_SPEC.md)
- [互相同意與全域最優配對](docs/MATCHING_SPEC.md)
- [開發 Agent 指令](AGENTS.md)

**目前狀態：** 規格已建立；實作、測試及實際部署尚待完成。此公開 repo 不可提交任何真實報名者資料或秘密。
