# 便利貼造型工作流程（Illustrator 直接輸出）

## 最簡單方式：Illustrator 輸出即可用

1. **畫布**：建立 1000×1000 px 的 artboard（1:1）
2. **形狀**：繪製你想要的造型，務必**有填色**（填色區域 = 可見區域）
3. **匯出**：檔案 → 匯出 → 匯出為 → 選 SVG
4. **放置**：放到 `public/svg/shapes/` 資料夾
5. **註冊**：在 `app/data/shapes.ts` 的 `STICKY_NOTE_SHAPES` 加上一筆 `{ id: '造型名稱', svg: '/svg/shapes/檔名.svg' }`

完成。**不需要**加 clipPath、不需要寫程式轉換座標。

## 關鍵規則

| 項目 | 說明 |
|------|------|
| 比例 | 1:1（1000×1000 建議） |
| 填色 | 形狀必須有填色，遮罩會取填色區域 |
| 格式 | Illustrator 預設 SVG 輸出即可 |

## 範例：round.svg

`<rect width="1000" height="1000" rx="100" ry="100"/>` 這種 Illustrator 輸出的 SVG 可直接使用。
