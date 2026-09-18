import os
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to app
        page.goto('http://localhost:1420')

        # Let it load to set initial state
        page.wait_for_selector('.navbar', state='visible', timeout=10000)

        # We can dismiss the modal by clicking the 'Skip for now' button.
        try:
             time.sleep(1)
             page.click('text="Skip for now"', timeout=2000, force=True)
             print("Dismissed modal via 'Skip for now' text")
        except Exception:
            pass

        try:
             time.sleep(1)
             page.click('text="I\'ve reviewed this"', timeout=2000, force=True)
             print("Dismissed modal via 'I've reviewed this' text")
        except Exception:
            pass

        time.sleep(1)

        os.makedirs('/tmp/verification', exist_ok=True)
        screenshot_path = '/tmp/verification/nav_en.png'
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == '__main__':
    run()
