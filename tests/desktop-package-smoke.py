"""Verify the delivered portable executable, without modifying player data."""
import json
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, Error

root = Path(__file__).resolve().parents[1]
exe = root / 'release' / 'PitchLab-1.0.0-Windows-x64.exe'
process = subprocess.Popen([str(exe), '--remote-debugging-port=9227'])
try:
    for attempt in range(60):
        try:
            with urllib.request.urlopen('http://127.0.0.1:9227/json/version', timeout=1) as response:
                json.load(response)
            break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError('Packaged desktop did not start its browser')
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp('http://127.0.0.1:9227', timeout=15000)
        page = browser.contexts[0].pages[0]
        page.wait_for_selector('[data-view="match"]')
        page.wait_for_function("document.title.includes('桌面版')")
        assert page.evaluate('PitchDefaultData.players.length') == 579
        page.locator('[data-view="match"]').click()
        assert page.locator('#calculateBtn').is_visible()
        page.screenshot(path=str(root / 'release' / 'packaged-preview.png'))
        print('Portable exe passed: loaded desktop title, 579 player versions, match UI.')
        session = browser.new_browser_cdp_session()
        try:
            session.send('Browser.close')
        except Error as error:
            # Electron can close its CDP connection before acknowledging shutdown.
            if 'closed' not in str(error).lower():
                raise
    process.wait(timeout=15)
finally:
    if process.poll() is None:
        process.terminate()
