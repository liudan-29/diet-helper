import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://localhost:4173"
SCREENSHOT_PATH = Path(os.environ.get("TEMP", PROJECT_ROOT)) / "diet-helper-v1-smoke.png"
EDGE_PATH = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def wait_for_server(process):
    deadline = time.time() + 12
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError("服务端提前退出")
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError("服务端启动超时")


def run():
    environment = os.environ.copy()
    environment["AMAP_MCP_KEY"] = ""
    process = subprocess.Popen(
        ["node", "server.js"],
        cwd=PROJECT_ROOT,
        env=environment,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        wait_for_server(process)
        results = {}
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path=str(EDGE_PATH) if EDGE_PATH.exists() else None,
            )
            context = browser.new_context(
                viewport={"width": 390, "height": 844},
                geolocation={"latitude": 39.908823, "longitude": 116.39747},
                permissions=["geolocation"],
            )
            page = context.new_page()
            console_errors = []
            page_errors = []
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            page.goto(BASE_URL, wait_until="networkidle")
            page.locator("[data-module-target]").first.wait_for()
            assert page.locator("[data-module-target]").count() == 4
            results["navigation_entries"] = 4

            page.get_by_role("button", name="自己做", exact=True).click()
            page.locator("#cookingIngredients").fill("番茄，鸡蛋")
            page.locator("#cookingMinutes").fill("30")
            page.locator("#cookingPartySize").fill("2")
            page.locator("#generatePlanButton").click()
            page.locator("[data-cook-action='record']").wait_for()
            plan_title = page.locator("#cookingResult h2").inner_text()
            assert plan_title
            results["cooking_plan"] = plan_title

            page.locator("[data-cook-action='record']").click()
            page.locator("#recordEditorView").wait_for()
            assert page.locator("#recordTitle").input_value() == plan_title
            page.locator("#saveRecordButton").click()
            page.locator("#recordList > *").first.wait_for()
            assert plan_title in page.locator("#recordList").inner_text()
            results["record_saved"] = True

            page.get_by_role("button", name="我的", exact=True).click()
            page.locator("#profileBudget").fill("60")
            page.locator("#profilePartySize").fill("2")
            page.locator("#saveProfileButton").click()
            page.wait_for_function(
                "document.querySelector('#profileMessage').textContent.trim().length > 0"
            )
            assert "1" in page.locator("#dataCounts").inner_text()
            results["profile_saved"] = True

            page.get_by_role("button", name="去哪吃", exact=True).click()
            page.locator("#locationButton").click()
            page.wait_for_function(
                "document.querySelector('#locationText').textContent.includes('1km')"
            )
            page.locator("#recommendButton").click()
            page.locator("#restaurantCard").wait_for()
            assert page.locator("#restaurantName").inner_text().strip()
            page.locator("#restaurantDetailButton").click()
            page.locator("#modalRoot").wait_for()
            page.locator("#modalClose").click()
            results["restaurant_recommendation"] = page.locator(
                "#restaurantName"
            ).inner_text()

            page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
            horizontal_overflow = page.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )
            assert horizontal_overflow is False
            results["mobile_overflow"] = horizontal_overflow

            desktop = context.new_page()
            desktop.set_viewport_size({"width": 1440, "height": 1000})
            desktop.goto(BASE_URL, wait_until="networkidle")
            shell_width = desktop.locator(".app-shell").bounding_box()["width"]
            assert shell_width <= 522
            results["desktop_shell_width"] = shell_width
            desktop.close()

            results["console_errors"] = console_errors
            results["page_errors"] = page_errors
            assert console_errors == []
            assert page_errors == []
            context.close()
            browser.close()
        results["screenshot"] = str(SCREENSHOT_PATH)
        print(json.dumps(results, ensure_ascii=False, indent=2))
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


if __name__ == "__main__":
    run()
