import { INTERESTS } from '../shared/schema';
import type { EntryRow } from '../shared/schema';

const supportLine = (support: string) => support
  ? '如果你沒有報名、收到錯誤通知或需要處理資料，請聯絡：' + support
  : '如果你沒有報名或需要更正／刪除資料，請聯絡活動主辦者的官方公告管道。';

export function resultEmail(person: EntryRow, other: EntryRow | null, support: string) {
  const hello = person.nickname + '，你好！\n\n';
  if (!other) return {
    subject: 'Relou｜本期配對結果',
    text: hello + '這一期沒有找到同時符合雙方意願的配對對象。謝謝你的參與！這不代表你不適合任何人，也不會自動延續報名至下一期。\n\n' + supportLine(support)
  };
  const contact = other.contact_kind === 'instagram'
    ? 'Instagram：' + other.contact_value + '\nhttps://www.instagram.com/' + encodeURIComponent(other.contact_value.replace(/^@/,'')) + '/'
    : 'Email：' + other.contact_value;
  const interests = (row: EntryRow): string[] => {
    try {
      const answers = JSON.parse(row.answers_json) as {interests?:unknown};
      return Array.isArray(answers.interests) ? answers.interests.filter((v): v is string =>
        typeof v==='string' && (INTERESTS as readonly string[]).includes(v) && v!=='其他') : [];
    } catch {return [];}
  };
  const shared = interests(person).filter(tag=>interests(other).includes(tag));
  const icebreaker = shared.length ? '你們的共同興趣：'+shared.join('、')+'。可以從這些話題開始聊。' : '可以先問問對方最近喜歡的活動。';
  return {
    subject: 'Relou｜你們配對成功了 💌',
    text: hello + '這一期你和「' + other.nickname + '」配對成功！\n\n對方同意分享的聯絡方式：\n' +
      contact + '\n\n'+icebreaker+'請尊重對方意願，對方沒有回覆也不代表有義務繼續互動。\n\n' + supportLine(support)
  };
}
export function maskedPreview(subject: string) {
  return { subject, text: '（隱私遮罩）此處不顯示收件者、IG 或配對內容；實際信件僅由後端從 outbox 寄出。' };
}
