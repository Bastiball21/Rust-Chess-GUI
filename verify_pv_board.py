from playwright.sync_api import sync_playwright

def verify_pv_board():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen for console logs
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PageError: {exc}"))

        try:
            print("Navigating to localhost:1420...")
            page.goto("http://localhost:1420")

            # Wait a bit to let React render
            page.wait_for_timeout(5000)

            # Take screenshot anyway to see what is happening (error screen?)
            page.screenshot(path="debug_screenshot.png")
            print("Saved debug_screenshot.png")

            # Check if we can find the element
            if page.locator("text=Stockfish 16").count() > 0:
                print("Found Stockfish 16")
                page.screenshot(path="pv_board_verification.png")
                print("Saved pv_board_verification.png")
            else:
                print("Stockfish 16 NOT found")

        except Exception as e:
            print(f"Script Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_pv_board()
