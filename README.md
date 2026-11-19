# 🕹️ Spaceship IDE（繁體中文版）

像太空駕駛員一樣，即時駕馭你的想法！

> 本專案 fork 自 [chuanqisun/spaceship](https://github.com/chuanqisun/spaceship)，將介面、模擬文字與大型語言模型的提示詞全部改為繁體中文，並讓文字引擎以「字」為單位運作，以支援不以空白分詞的中文。

![螢幕錄影](./extra/screencast.gif)

## 展示

可以在 [Instagram](https://www.instagram.com/reels/DfyQPhFtW-z/) 和 [YouTube](https://www.youtube.com/watch?v=3WmNLWUmcnY) 觀看原作者的展示影片。原版模擬器位於 [https://chuanqisun.github.io/spaceship/](https://chuanqisun.github.io/spaceship/)，也可以填入你自己的 Cerebras 與 Gemini API 金鑰切換到真實模型。金鑰只會保存在你瀏覽器的 localStorage 中，使用風險請自行承擔。

## 在本機執行

```bash
npm install
npm run dev
```

開啟終端機顯示的網址（預設為 `http://localhost:5173/spaceship/`）。左下角的「模式」按鈕可在「模擬」與「飛行」（呼叫真實 API）之間切換。

## 中文版的差異

- **以字為單位**：中文不以空白分詞，所以主旋鈕逐「字」顯示、截斷與計數，狀態列的速率單位為「字/秒」。
- **標點避頭**：「，」「。」等標點不能出現在行首，因此主旋鈕會跟著排版一起越過「字＋標點」這樣不可拆開的組合。
- **注意力框**：以 `Intl.Segmenter("zh-Hant")` 斷詞；模型回傳的片語只比對文字與數字，忽略空白、標點與全形／半形差異。
- **未來旋鈕**：維度與選項都是中文，例如「張力：放鬆 ↔ 緊繃」「寫法：對話 · 動作 · 描寫」。
- **提示詞**：續寫、關鍵片語、維度選單以及 Gemini 評分的提示詞都改為繁體中文，並要求模型以繁體中文（台灣用語）書寫。
- `extra/` 中的設計稿頁面維持原文。

## 猜想

> 在不久的將來，LLM 與決策模型將達到每秒 60 幀的互動速度。

到那時，會解鎖哪些新的互動典範？這個專案展示了那樣的未來中，一些可能而且令人嚮往的互動方式。

1. **專注監視器**：我們能否把 LLM 正在注意什麼視覺化，並藉此把人的注意力引導到重要之處？

   ![專注監視器](./extra/clips/focus-monitor.gif)

2. **注意力鎖定**：我們能否強迫 LLM 更加注意特定片語，藉此影響它之後的行為？

   ![注意力鎖定](./extra/clips/attention-lock.gif)

3. **未來向量引導**：我們能否把任務分解成多個特徵向量，分別調整後再重新組合，以影響即將生成的文字？

   ![未來引導](./extra/clips/future-steering.gif)

4. **即時重新生成**：當生成文字既便宜又快速時，我們能否透過來回拖曳來探索不同的未來？

   ![即時重新生成](./extra/clips/realtime-regeneration.gif)

（以上動畫錄自原版英文介面。）

## 設計過程

原作者大部分的實作都交給 Claude Code，但 UI/UX 親自操刀。他採用「互動式風格樣本」的方式迭代：請 AI 提供多種不同的設計選項，給予回饋，再讓它繼續迭代。設計成果可以在 [extra 頁面](https://chuanqisun.github.io/spaceship/extra/style-1.html) 看到。

為了做到即時的體驗，必須積極地進行推測式生成，並依據使用者的互動管理快取失效。例如，當主旋鈕往回移動時，必須清空後面的文字並取消進行中的請求。整個系統中有許多這類的考量，需要大量人的判斷，Claude 並不是一次就做對的。

## 理論

原作者目前專注於幫助人們即時塑造想法的系統。這個專案是他在 MIT Media Lab [即將完成的論文](https://code.chuanqisun.com/master-thesis/) 的一小步，研究語意系統與符號系統如何結合，以提升人的創造力、主體性與創作的樂趣。

## 引用

如果你以這個作品為基礎進行延伸，請引用原作：

```bibtex
@misc{sun2026spaceship,
  author       = {Sun, Chuanqi},
  title        = {Spaceship {IDE}: Steer Your Ideas in Realtime, Space Pilot Style},
  year         = {2026},
  publisher    = {GitHub},
  howpublished = {\url{https://github.com/chuanqisun/spaceship}},
  note         = {Demo: \url{https://chuanqisun.github.io/spaceship/}}
}
```

## 授權

MIT License，與原專案相同，見 [LICENSE](./LICENSE)。
