"""Playwright checks for the Traditional Chinese edition, run against the dev server in simulator mode."""

import json
import re

import pytest
from playwright.sync_api import sync_playwright

URL = "http://localhost:5173/spaceship/"
HAN = re.compile(r"[一-鿿]")
LATIN = re.compile(r"[A-Za-z]")
STORY_OPENINGS_ZH = re.findall(r'"([^"]+)"', open(__file__.replace("tests", "src").replace("test_zh.py", "story/openings.ts"), encoding="utf-8").read())


@pytest.fixture()
def page():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        page = browser.new_context(viewport={"width": 1280, "height": 800}).new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(URL)
        page.wait_for_function("document.querySelector('#status .zone') !== null")
        wait_for_buffer(page)
        yield page
        assert errors == [], errors
        browser.close()


def wait_for_buffer(page, at_least=200):
    page.wait_for_function(
        "min => Number(document.querySelector('[data-field=words] small')?.textContent.slice(1)) >= min", arg=at_least
    )


def column(page):
    return page.evaluate(
        """() => {
            const element = document.querySelector('#text')
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return { left: rect.left, top: rect.top + parseFloat(style.paddingTop), width: rect.width, line: parseFloat(style.lineHeight) }
        }"""
    )


def point_at(page, line, x):
    col = column(page)
    return col["left"] + x, col["top"] + (line + 0.5) * col["line"]


def knob_center(page):
    box = page.locator("#pointer").bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def drag_knob(page, x, y, steps=10):
    page.mouse.move(*knob_center(page))
    page.mouse.down()
    page.mouse.move(x, y, steps=steps)
    page.mouse.up()


def shown_text(page):
    return page.evaluate("document.querySelector('#text').textContent")


def shown_count(page):
    return int(re.match(r"\d+", page.locator("[data-field=words] b").text_content()).group())


def field(page, name):
    return int(page.locator(f"[data-field={name}] b").text_content())


def highlight_texts(page, name):
    return page.evaluate("name => [...(CSS.highlights.get(name) ?? [])].map(range => range.toString())", name)


def test_interface_is_chinese(page):
    assert page.evaluate("document.documentElement.lang") == "zh-Hant"
    assert "模擬" in page.locator("#mode-toggle").text_content()
    assert "開" in page.locator("#sound-toggle").text_content()
    assert "字/秒" in page.locator("[data-field=rate]").text_content()
    assert not LATIN.search(page.locator("#tray").text_content().replace("ms", ""))

    page.locator("#sound-toggle").click()
    assert "關" in page.locator("#sound-toggle").text_content()

    page.locator("#mode-toggle").click()
    dialog = page.locator("#live-keys")
    assert dialog.evaluate("dialog => dialog.open")
    assert HAN.search(dialog.locator("h2").text_content())
    assert HAN.search(dialog.locator("#live-keys-note").text_content())
    dialog.get_by_role("button", name="中止").click()
    assert not dialog.evaluate("dialog => dialog.open")
    assert HAN.search(page.locator("#pointer").get_attribute("aria-label"))


def test_story_is_chinese_counted_by_character(page):
    col = column(page)
    drag_knob(page, *point_at(page, 3, col["width"] / 2))
    lines = shown_text(page).split("\n")
    text = "".join(lines)

    assert len(lines) == 4
    assert not re.search(r"\s", text), "Chinese text has no spaces, and lines are joined without any"
    assert not LATIN.search(text)
    assert len(HAN.findall(text)) > 80
    assert shown_count(page) == len(text), "the tray counts characters"

    widths = page.evaluate(
        """lines => {
            const context = document.createElement('canvas').getContext('2d')
            context.font = getComputedStyle(document.querySelector('#text')).font
            return lines.map(line => context.measureText(line).width)
        }""",
        lines,
    )
    assert all(width <= col["width"] + 0.5 for width in widths)
    assert all(width > col["width"] - 3 * 11 for width in widths[:3]), "full lines fill the column"

    painted = page.evaluate(
        """() => {
            const node = document.querySelector('#text').firstChild
            const range = document.createRange()
            let start = 0
            return node.data.split('\\n').map(line => {
                range.setStart(node, start)
                range.setEnd(node, start + line.length)
                start += line.length + 1
                return range.getBoundingClientRect().width
            })
        }"""
    )
    assert all(abs(dom - canvas) < 1 for dom, canvas in zip(painted, widths)), (painted, widths)


def test_offsets_skip_line_breaks(page):
    result = page.evaluate(
        """async () => {
            const { rangeAt, textOffsetOf } = await import('/spaceship/src/text/text-offsets.ts')
            const element = document.createElement('div')
            element.textContent = '一二三\\n四五\\n六'
            const node = element.firstChild
            const of = range => [range.startOffset, range.endOffset, range.toString()]
            return {
                lastOfLine: of(rangeAt(element, { start: 2, end: 3 })),
                firstOfLine: of(rangeAt(element, { start: 3, end: 4 })),
                acrossBreak: of(rangeAt(element, { start: 2, end: 4 })),
                acrossTwo: of(rangeAt(element, { start: 1, end: 6 })),
                atEnd: of(rangeAt(element, { start: 6, end: 6 })),
                offsets: [0, 3, 4, 5, 7, 8].map(i => textOffsetOf(element, node, i)),
            }
        }"""
    )
    assert result["lastOfLine"] == [2, 3, "三"], "ends before the line break"
    assert result["firstOfLine"] == [4, 5, "四"], "starts after the line break"
    assert result["acrossBreak"] == [2, 5, "三\n四"]
    assert result["acrossTwo"] == [1, 8, "二三\n四五\n六"]
    assert result["atEnd"][:2] == [8, 8]
    assert result["offsets"] == [0, 3, 3, 4, 5, 6]


def test_knob_reveals_one_character_at_a_time(page):
    start = point_at(page, 0, 40)
    drag_knob(page, *start)
    page.mouse.move(*knob_center(page))
    page.mouse.down()
    counts = []
    for dx in range(0, 121):
        page.mouse.move(start[0] + dx, start[1])
        counts.append(shown_count(page))
    page.mouse.up()

    steps = [after - before for before, after in zip(counts, counts[1:])]
    assert all(0 <= step <= 2 for step in steps), steps
    assert 9 <= counts[-1] - counts[0] <= 13, counts


def test_dragging_back_keeps_the_text_before_the_knob(page):
    drag_knob(page, *point_at(page, 2, 200))
    before = "".join(shown_text(page).split("\n"))
    page.wait_for_timeout(300)
    drag_knob(page, *point_at(page, 0, 60))
    kept = shown_text(page)
    assert 4 <= len(kept) <= 6 and before.startswith(kept)

    page.wait_for_timeout(300)
    wait_for_buffer(page)
    drag_knob(page, *point_at(page, 2, 200))
    after = "".join(shown_text(page).split("\n"))
    assert after.startswith(kept)
    assert after != before, "the text past the knob was generated again"
    assert abs(len(after) - len(before)) <= 3


def test_pressing_ahead_pulls_the_knob_to_the_hand(page):
    drag_knob(page, *point_at(page, 0, 40))
    start = shown_count(page)
    target = point_at(page, 2, 150)
    page.mouse.move(*target)
    page.mouse.down()
    # The knob stops where the hand's line would end: up to a character short of it when the next one cannot leave the "，" after it.
    page.wait_for_function(
        "([x, y]) => { const r = document.querySelector('#pointer').getBoundingClientRect(); return Math.abs(r.x + r.width / 2 - x) < 24 && Math.abs(r.y + r.height / 2 - y) < 9 }",
        arg=list(target),
        timeout=15000,
    )
    page.mouse.up()
    assert shown_count(page) - start > 60
    assert len(shown_text(page).split("\n")) == 3


def test_double_click_reveals_attention_boxes_on_chinese_words(page):
    drag_knob(page, *point_at(page, 3, 200))
    page.mouse.dblclick(*knob_center(page))
    page.wait_for_function("document.querySelectorAll('#rail .bracket').length >= 3")

    keywords = highlight_texts(page, "attention-word") + highlight_texts(page, "attention-word-active")
    assert len(keywords) >= 3
    assert all(HAN.search(keyword) for keyword in keywords), keywords
    assert all(len(keyword.replace("\n", "")) <= 4 for keyword in keywords), keywords
    page.wait_for_function("count => document.querySelector('[data-field=boxes] b').textContent === String(count)", arg=len(keywords))

    text = "".join(shown_text(page).split("\n"))
    shades = [shade.replace("\n", "") for shade in highlight_texts(page, "attention-shade-1")]
    assert shades and all(shade in text for shade in shades), shades


def test_selecting_text_makes_an_attention_box(page):
    drag_knob(page, *point_at(page, 2, 200))
    text = "".join(shown_text(page).split("\n"))
    page.mouse.move(*point_at(page, 0, 11 * 20 + 2))
    page.mouse.down()
    page.mouse.move(*point_at(page, 1, 11 * 5 + 2), steps=8)
    page.mouse.up()
    page.wait_for_function("document.querySelectorAll('#rail .bracket').length === 1")

    (shade,) = highlight_texts(page, "attention-shade-1")
    per_line = round(column(page)["width"] // 11)
    assert "\n" in shade, "the box spans the line break"
    shade = shade.replace("\n", "")
    assert shade in text
    assert text[20:per_line + 5].strip("，。") in shade, "the box covers the whole selection, but for punctuation at its ends, which is no word"
    assert len(shade) <= per_line + 5 - 20 + 6, "rounded out to whole words only"
    assert field(page, "boxes") == 1


def test_future_knob_offers_chinese_dimensions(page):
    drag_knob(page, *point_at(page, 1, 200))
    x, y = knob_center(page)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.up()
    page.mouse.down()
    page.wait_for_selector(".future")
    page.wait_for_function("document.querySelectorAll('#future-hud text').length >= 5")
    names = page.evaluate("[...document.querySelectorAll('#future-hud text')].map(node => node.textContent).filter(Boolean)")
    assert len(names) >= 5 and all(HAN.search(name) and not LATIN.search(name) for name in names), names

    page.mouse.move(x, y + 170, steps=12)
    page.wait_for_selector(".future[data-tuned]")
    readout = page.locator("#future-hud text[data-readout]").text_content()
    assert "：" in readout and HAN.search(readout) and not LATIN.search(readout), readout
    page.mouse.up()

    label = page.locator(".future > span").text_content()
    assert "：" in label and not LATIN.search(label), label
    assert HAN.search(page.locator(".future").get_attribute("aria-label"))
    assert field(page, "steering") == 1


CONTINUATION = "有一艘老舊的太空船停在港口，船長瑪拉每天晚上都會爬上甲板，望向遙遠的星光。她相信總有一天，引擎會再次發出低語。"
ATTENTION_LINES = ["船長[瑪拉]每天晚上", "望向遙遠的[星光]", "她相信總有一天,引擎會再次[發出]低語"]
DIMENSION_LINES = ["張力: 放鬆 | 緊繃", "焦點：瑪拉｜老船長｜敘事者", "語氣: 詼諧 | 溫柔 | 沉重 | 奇幻", "無效: a | b", "節奏: 緊湊 | 鋪陳", "寫法: 對話 | 動作 | 描寫"]


def sse(text, size=7):
    chunks = [text[i : i + size] for i in range(0, len(text), size)]
    return "".join(f"data: {json.dumps({'choices': [{'delta': {'content': chunk}}]}, ensure_ascii=False)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"


@pytest.fixture()
def live_page():
    requests = []

    def cerebras(route):
        body = json.loads(route.request.post_data)
        system, user = body["messages"][0]["content"], body["messages"][1]["content"]
        requests.append(body)
        if "挑出接下來的文字最依賴的關鍵片語" in system:
            reply = "\n".join(ATTENTION_LINES)
        elif "軸線清單" in system:
            reply = "\n".join(DIMENSION_LINES)
        else:
            story = user.split("目前的故事\n", 1)[-1]
            reply = story[-3:] + CONTINUATION * 4
        route.fulfill(status=200, headers={"Content-Type": "text/event-stream; charset=utf-8"}, body=sse(reply))

    def gemini(route):
        questions = json.loads(route.request.post_data)["questions"]
        answers = {
            key: {"type": "score", "score": 2, "probabilities": {}, "legend": {}, "confidence": 1}
            if question["type"] == "score"
            else {"type": "noul", "noul": 0.5, "confidence": 1}
            for key, question in questions.items()
        }
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"answers": answers, "usage": {}}))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        context.add_init_script("localStorage.setItem('cerebras-api-key', 'test'); localStorage.setItem('gemini-api-key', 'test')")
        context.route("https://api.cerebras.ai/**", cerebras)
        context.route("https://generativelanguage.googleapis.com/**", gemini)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(URL + "?live=true")
        page.wait_for_function("document.querySelector('#status .zone') !== null")
        wait_for_buffer(page)
        yield page, requests
        assert errors == [], errors
        browser.close()


def test_live_mode_in_chinese(live_page):
    page, requests = live_page
    assert "飛行" in page.locator("#mode-toggle").text_content()
    story_request = next(body for body in requests if "續寫這個故事" in body["messages"][0]["content"])
    opening = story_request["messages"][1]["content"]
    assert opening in STORY_OPENINGS_ZH

    drag_knob(page, *point_at(page, 4, 300))
    text = "".join(shown_text(page).split("\n"))
    assert text.startswith(opening + CONTINUATION), "the echoed end of the opening is dropped"

    page.mouse.dblclick(*knob_center(page))
    page.wait_for_function("document.querySelectorAll('#rail .bracket').length === 3")
    keywords = highlight_texts(page, "attention-word") + highlight_texts(page, "attention-word-active")
    for bracketed in ["瑪拉", "星光", "發出"]:
        assert any(bracketed[0] in keyword for keyword in keywords), (bracketed, keywords)
    shades = "/".join(shade.replace("\n", "") for shade in highlight_texts(page, "attention-shade-1"))
    for phrase in ["船長瑪拉每天晚上", "望向遙遠的星光", "引擎會再次發出低語"]:
        assert phrase in shades, (phrase, shades)

    x, y = knob_center(page)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.up()
    page.mouse.down()
    page.wait_for_function("document.querySelectorAll('#future-hud text').length >= 5")
    names = page.evaluate("[...document.querySelectorAll('#future-hud text')].map(node => node.textContent).filter(Boolean)")
    assert ["張力", "焦點", "語氣", "節奏", "寫法"] == [name for name in names if name in ["張力", "焦點", "語氣", "節奏", "寫法", "無效"]], names
    page.mouse.move(x, y + 170, steps=12)
    page.wait_for_selector(".future[data-tuned]")
    page.mouse.up()
    assert page.locator(".future > span").text_content().startswith("語氣：")

    page.wait_for_function(
        "() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('cerebras')).length >= 4", timeout=5000
    )
    page.wait_for_timeout(500)
    steered = [body["messages"][1]["content"] for body in requests if "控制項" in body["messages"][0]["content"]]
    assert steered, "a steered continuation was requested"
    message = steered[-1]
    assert "關鍵片語\n" in message
    assert re.search(r"\[瑪拉?\]", message), "a box keyword is one word, and the segmenter may split an unknown name"
    assert re.search(r"控制項\n語氣：\S+（選項：詼諧、溫柔、沉重、奇幻）（(輕微|中等|強烈)）", message), message
    assert "目前的故事\n" + opening in message
