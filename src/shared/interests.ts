export const INTEREST_GROUPS = [
  {
    "label": "球類運動",
    "tags": [
      "籃球",
      "羽球",
      "排球",
      "桌球",
      "網球",
      "足球",
      "棒球",
      "壘球",
      "撞球",
      "保齡球",
      "高爾夫"
    ]
  },
  {
    "label": "健身與戶外",
    "tags": [
      "運動健身",
      "重量訓練",
      "跑步",
      "游泳",
      "瑜珈",
      "皮拉提斯",
      "舞蹈",
      "登山",
      "健行",
      "攀岩",
      "自行車",
      "滑板",
      "露營",
      "衝浪",
      "潛水",
      "滑雪"
    ]
  },
  {
    "label": "音樂",
    "tags": [
      "音樂",
      "華語流行",
      "西洋流行",
      "日語音樂",
      "韓語音樂",
      "獨立音樂",
      "搖滾",
      "嘻哈",
      "爵士",
      "古典音樂",
      "電子音樂",
      "演唱會",
      "音樂祭",
      "唱歌",
      "吉他",
      "鋼琴",
      "樂團演奏"
    ]
  },
  {
    "label": "影視與動漫",
    "tags": [
      "電影影集",
      "劇情片",
      "喜劇片",
      "懸疑推理",
      "科幻電影",
      "恐怖片",
      "紀錄片",
      "台劇",
      "日劇",
      "韓劇",
      "歐美影集",
      "動畫",
      "漫畫",
      "Cosplay"
    ]
  },
  {
    "label": "遊戲",
    "tags": [
      "遊戲",
      "電腦遊戲",
      "主機遊戲",
      "手機遊戲",
      "桌遊",
      "角色扮演遊戲",
      "射擊遊戲",
      "策略遊戲",
      "音樂遊戲",
      "模擬經營",
      "解謎遊戲",
      "電競賽事",
      "密室逃脫"
    ]
  },
  {
    "label": "飲食與生活",
    "tags": [
      "咖啡探店",
      "美食",
      "甜點",
      "烘焙",
      "料理",
      "茶",
      "夜市小吃",
      "餐廳探索",
      "穿搭",
      "美妝",
      "香水",
      "植物園藝",
      "貓",
      "狗"
    ]
  },
  {
    "label": "旅行與攝影",
    "tags": [
      "戶外旅行",
      "國內旅行",
      "海外旅行",
      "城市散步",
      "背包旅行",
      "公路旅行",
      "攝影",
      "底片攝影",
      "人像攝影",
      "風景攝影",
      "錄影剪輯"
    ]
  },
  {
    "label": "閱讀與創作",
    "tags": [
      "閱讀",
      "小說",
      "散文",
      "詩",
      "推理小說",
      "奇幻小說",
      "歷史",
      "心理學",
      "哲學",
      "寫作",
      "繪畫",
      "設計",
      "手作",
      "陶藝",
      "展覽",
      "劇場",
      "博物館"
    ]
  },
  {
    "label": "科技與探索",
    "tags": [
      "科技 AI",
      "程式設計",
      "人工智慧",
      "機器人",
      "電子製作",
      "天文",
      "科普",
      "語言學習",
      "Podcast",
      "志工服務"
    ]
  },
  {
    "label": "其他",
    "tags": [
      "其他"
    ]
  }
] as const;
export const INTERESTS = INTEREST_GROUPS.flatMap(group => [...group.tags]);

// Broad legacy labels describe their category; related subtopics are weaker than exact matches.
const BROAD_INTERESTS=new Set(['運動健身','音樂','電影影集','遊戲','美食','戶外旅行','攝影','閱讀','科技 AI']);
export function interestSimilarity(a:readonly string[],b:readonly string[]):number {
 const clean=(tags:readonly string[])=>new Set(tags.filter(t=>t!=='其他'&&(INTERESTS as readonly string[]).includes(t)));
 const x=clean(a),y=clean(b);
 let total=0,domains=0;
 for(const group of INTEREST_GROUPS) {
  if(group.label==='其他')continue;
  const left=group.tags.filter(t=>x.has(t)),right=group.tags.filter(t=>y.has(t));
  if(!left.length&&!right.length)continue;
  domains++;
  // One contribution per domain, regardless of how many overlapping tags were selected.
  let best=0;
  for(const l of left)for(const r of right)best=Math.max(best,l===r?1:BROAD_INTERESTS.has(l)||BROAD_INTERESTS.has(r)?0.6:0.25);
  total+=best;
 }
 return domains?total/domains:0;
}
