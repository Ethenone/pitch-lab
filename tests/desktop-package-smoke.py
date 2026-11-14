"""Verify the delivered portable executable, without modifying player data."""
import json
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, Error

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
exe = root / 'release' / f'PitchLab-{version}-Windows-x64.exe'
if not exe.exists():
    exe = root / 'release' / f'v{version}' / exe.name
process = subprocess.Popen([str(exe), '--remote-debugging-port=9227', '--disable-gpu'])
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
        assert page.evaluate('PitchDefaultData.players.length') == 938
        page.locator('[data-view="match"]').click()
        assert page.locator('#calculateBtn').is_visible()
        page.locator('#ocrOpen').click()
        assert '开发中' in page.locator('#ocrOpen').inner_text()
        assert '功能不稳定' in page.locator('#ocrDevelopmentNotice').inner_text()
        page.wait_for_function("document.querySelector('#ocrStatus').textContent.includes('OCR 可用')", timeout=45000)
        assert page.locator('#ocrStart').is_visible()
        page.screenshot(path=str(root / 'release' / 'packaged-preview.png'))
        print('Portable exe passed: loaded desktop title, 938 player versions, match UI.')
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
