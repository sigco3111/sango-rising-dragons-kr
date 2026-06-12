# 三國・起龍

單人遊玩的**三國志策略／角色扮演混合型**網頁遊戲，以 **Phaser 3 + TypeScript + Vite** 打造。

時值西元190年，漢室傾頹。選擇一位群雄，經營城池、招攬名將、指揮戰術戰鬥——攻佔天下二十座名城中的**十二座**，一統三國！

## 啟動方式

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 產出正式版至 dist/
npm run preview  # 預覽正式版
```

## 玩法說明

**戰略層（大地圖）**
- 每回合為一個月。每回合可使用的 **⚡ 指令點** = 3 + 城池數÷2。
- 點選我方城池下達指令：
  - 🌾 **開墾／🪙 通商／🧱 築城** — 發展經濟與守備（400金）。
  - ⚔ **徵兵** — 兵力+1,500（200金+300糧）。
  - 🔍 **搜索** — 派將領尋訪城中在野人才（依政治）。趙雲、郭嘉、許褚等名將就藏身各地。
  - 🎯 **操練** — 將領獲得經驗。
  - 🚩 **出征** — 派至多3名將領率兵前往相鄰城池。我方城池＝調防；敵城＝開戰。
- 部隊每月消耗糧草，斷糧會導致士卒逃亡。
- 留意**歷史事件**：討董聯盟、傳國玉璽、呂布弒主、三顧茅廬……

**戰術戰鬥**
- 回合制棋盤戰鬥：選擇部隊→移動（藍色）→攻擊（紅框）→或施放**✦ 將領戰技**（突擊、單挑、火計、箭雨、鼓舞、鐵壁、神射）。
- 兵種相剋：🛡 步兵剋 🐎 騎兵剋 🏹 弓兵剋步兵。
- 地形效果：林地減傷（但怕火計！）、丘陵增攻並延長弓兵射程、河川阻擋移動。
- 守軍享有城牆加成；攻城方若14回合內未能取勝即告失敗。
- 將領透過戰鬥獲得經驗升級；寶物（赤兔馬、青龍偃月刀……）可強化能力。
- 嫌麻煩也可以選擇**自動結算**。

遊戲**每回合自動存檔**（localStorage），標題畫面可「繼續上次的征途」。

## 內容擴充——自己動手加內容

所有遊戲資料都是 [public/data](public/data) 內的純 JSON。載入器讀取 `manifest.json` 後依序合併各內容包（以 id 為鍵，後者覆蓋前者），新增武將、事件或調整平衡完全不需改程式碼：

```
public/data/
  manifest.json          { "packs": ["base", "mypack"] }
  base/
    factions.json   cities.json   officers.json
    skills.json     items.json    events.json
  mypack/                ← 只需放入要新增／修改的檔案
    officers.json        ← 新武將，或覆寫既有 id 的數值
    events.json          ← 新的劇情事件
```

事件觸發條件支援：`minTurn`、`maxTurn`、`month`、`once`、`chance`、`faction`、`notFaction`、`ownsCity`、`officerFree`、`factionAlive`；效果支援 `gold`、`food`、`troopsHome`、`recruit`、`item`、`itemBest`、`exile`、`weakenFaction`、`expAll` 等。

## 美術素材

- 戰鬥單位（步兵／騎兵／弓兵）為自製 **SVG 像素圖**，產生器在 [tools/gen-pixel-art.mjs](tools/gen-pixel-art.mjs)，執行 `node tools/gen-pixel-art.mjs` 即可重新產出。
- 其餘美術與音效：[Kenney](https://kenney.nl)（CC0）— Cartography Pack、Medieval RTS、Interface Sounds、Impact Sounds、RPG Audio、Music Loops。
- 遊戲引擎：[Phaser 3](https://phaser.io)。
