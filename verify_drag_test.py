from playwright.sync_api import Page, expect, sync_playwright

def test_charts_localized(page: Page):
    page.goto("http://localhost:1420/")
    page.wait_for_timeout(1000)

    # Click "Car Parameters"
    page.get_by_text("Car Parameters").click()
    page.wait_for_timeout(1000)

    # We should see the Dyno chart, we can scroll down to it
    page.evaluate("window.scrollBy(0, 1000)")
    page.wait_for_timeout(500)

    page.screenshot(path="car_params.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_charts_localized(page)
        except Exception as e:
            print("Error: ", e)
        finally:
            browser.close()
