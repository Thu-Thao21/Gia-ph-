# -*- coding: utf-8 -*-
import os
import sys
import time
import pytest
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports", "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def pytest_addoption(parser):
    parser.addoption(
        "--headless-mode",
        action="store_true",
        default=False,
        help="Run browser in headless mode (default: headed for visual observation)",
    )
    parser.addoption(
        "--base-url",
        action="store",
        default="http://localhost:5173",
        help="Base URL for testing frontend",
    )

@pytest.fixture(scope="session")
def base_url(request):
    return request.config.getoption("--base-url")

@pytest.fixture(scope="function")
def driver(request):
    """
    Function-scoped driver for test isolation.
    Opens visible Chrome browser on desktop by default so user can visually observe tests.
    """
    options = Options()
    # Tắt hoàn toàn chế độ chạy ngầm để hiển thị trực tiếp giao diện Chrome trên màn hình
    # if is_headless:
    #     options.add_argument("--headless=new")
    
    options.add_argument("--start-maximized")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(8)

    yield driver

    # Take screenshot if test failed
    if hasattr(request.node, "rep_call") and request.node.rep_call.failed:
        test_name = request.node.name
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(SCREENSHOT_DIR, f"{test_name}_{ts}.png")
        try:
            driver.save_screenshot(filepath)
            print(f"\n[Screenshot saved on failure] {filepath}")
        except Exception:
            pass

    driver.quit()

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    rep = outcome.get_result()
    setattr(item, "rep_" + rep.when, rep)
