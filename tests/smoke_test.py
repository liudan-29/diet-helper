from pathlib import Path

from playwright.sync_api import sync_playwright


APP_URL = Path(__file__).parents[1].joinpath("index.html").as_uri()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.goto(APP_URL)
        page.wait_for_load_state("networkidle")

        assert page.get_by_role("heading", name="你现在 想吃点什么？").count() == 1
        assert page.locator("#restaurantName").inner_text() == "胡记锅贴"

        page.get_by_role("button", name="晚餐").click()
        page.get_by_role("button", name="给我挑一家 ↗").click()
        assert "晚餐" in page.locator("#resultTitle").inner_text()

        page.get_by_role("button", name="换一家").click()
        assert page.locator("#restaurantName").inner_text() == "青禾小馆"

        page.get_by_role("button", name="定位到附近").click()
        assert "已定位" in page.locator("#locationText").inner_text()
        browser.close()


if __name__ == "__main__":
    main()
