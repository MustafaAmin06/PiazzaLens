#!/usr/bin/env python3

"""
Launch a disposable Chrome session with the unpacked PiazzaLens extension loaded
and guide a manual real-browser verification of the Piazza API sync flow.

What this verifies:
- the extension loads in a real Chrome profile
- the content script injects on a Piazza class page
- a manual click on "Sync Piazza Data" triggers RPC traffic to /logic/api

This script avoids the user's normal Chrome profile.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import JavascriptException, TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


REPO_ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = REPO_ROOT / "extension"
SYNC_TIMEOUT_SECONDS = 120


def build_driver(profile_dir: Path) -> webdriver.Chrome:
    options = Options()
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-search-engine-choice-screen")
    options.add_argument("--disable-backgrounding-occluded-windows")
    options.add_argument("--disable-popup-blocking")
    options.add_argument(f"--disable-extensions-except={EXTENSION_DIR}")
    options.add_argument(f"--load-extension={EXTENSION_DIR}")
    options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
    return webdriver.Chrome(options=options)


def print_step(message: str) -> None:
    print(f"[verify] {message}", flush=True)


def wait_for_piazza_course(driver: webdriver.Chrome) -> None:
    print_step("Waiting for you to log into Piazza and open a course page...")
    deadline = time.time() + 10 * 60

    while time.time() < deadline:
        url = driver.current_url
        if "/class/" in url and "piazza.com" in url:
            print_step(f"Detected course page: {url}")
            return
        time.sleep(1)

    raise TimeoutException("Timed out waiting for a piazza.com/class/... page")


def wait_for_content_script(driver: webdriver.Chrome, allow_refresh: bool = True) -> None:
    print_step("Waiting for PiazzaLens content injection on the course page...")
    try:
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script("return Boolean(document.getElementById('piazzalens-root'));"),
            message="PiazzaLens root was not injected on the current page",
        )
        return
    except TimeoutException:
        if not allow_refresh:
            raise

    print_step("Content script not detected yet. Reloading the course page once and retrying...")
    driver.refresh()
    WebDriverWait(driver, 30).until(
        lambda d: d.execute_script("return document.readyState") == "complete",
        message="Course page did not finish loading after refresh",
    )
    WebDriverWait(driver, 30).until(
        lambda d: d.execute_script("return Boolean(document.getElementById('piazzalens-root'));"),
        message="PiazzaLens root was not injected on the refreshed course page",
    )


def clear_logs(driver: webdriver.Chrome) -> None:
    for log_type in ("browser", "performance"):
        try:
            driver.get_log(log_type)
        except Exception:
            pass


def dump_failure_diagnostics(driver: webdriver.Chrome) -> None:
    print_step(f"Current URL at failure: {driver.current_url}")
    try:
        ready_state = driver.execute_script("return document.readyState")
        print_step(f"Document readyState: {ready_state}")
    except Exception as error:
        print_step(f"Could not read readyState: {error}")

    try:
        has_root = driver.execute_script("return Boolean(document.getElementById('piazzalens-root'));")
        print_step(f"piazzalens-root present: {has_root}")
    except Exception as error:
        print_step(f"Could not inspect piazzalens-root: {error}")

    try:
        browser_logs = driver.get_log("browser")
    except Exception:
        browser_logs = []

    if browser_logs:
        print_step("Recent browser logs:")
        for entry in browser_logs[-20:]:
            print(entry.get("message", ""), flush=True)


def summarize_new_logs(driver: webdriver.Chrome, started_at: float) -> dict:
    browser_logs = []
    logic_api_requests = []

    try:
        browser_logs = driver.get_log("browser")
    except Exception:
        browser_logs = []

    try:
        perf_logs = driver.get_log("performance")
    except Exception:
        perf_logs = []

    for entry in perf_logs:
        try:
            message = json.loads(entry["message"])["message"]
        except Exception:
            continue

        if message.get("method") != "Network.requestWillBeSent":
            continue

        params = message.get("params", {})
        request = params.get("request", {})
        url = request.get("url", "")
        wall_time = params.get("wallTime")
        if wall_time and wall_time < started_at:
            continue

        if "/logic/api" not in url:
            continue

        logic_api_requests.append(
            {
                "url": url,
                "method": request.get("method"),
                "postData": request.get("postData", ""),
            }
        )

    return {
        "browser_logs": browser_logs,
        "logic_api_requests": logic_api_requests,
    }


def has_sync_signature(log_summary: dict) -> tuple[bool, str]:
    request_bodies = [item.get("postData", "") for item in log_summary["logic_api_requests"]]
    saw_feed = any("network.get_my_feed" in body for body in request_bodies)
    saw_content = any('"content.get"' in body or "content.get" in body for body in request_bodies)

    piazzalens_logs = [
        entry for entry in log_summary["browser_logs"] if "PiazzaLens" in entry.get("message", "")
    ]

    if saw_feed and saw_content:
        return True, f"observed {len(log_summary['logic_api_requests'])} /logic/api requests including feed and content fetches"

    if piazzalens_logs:
        return False, "saw PiazzaLens console logs but not the full API sync signature"

    return False, "did not observe a distinct PiazzaLens sync signature yet"


def main() -> int:
    if not EXTENSION_DIR.exists():
        print_step(f"Extension directory not found: {EXTENSION_DIR}")
        return 1

    profile_dir = Path(tempfile.mkdtemp(prefix="piazzalens-browser-"))
    print_step(f"Using temporary Chrome profile: {profile_dir}")
    driver = None

    try:
        driver = build_driver(profile_dir)
        driver.set_window_size(1440, 1000)
        driver.get("https://piazza.com")

        print_step("Chrome launched with the unpacked extension loaded.")
        print_step("In that Chrome window: log into Piazza, open a course page, then click the PiazzaLens toolbar icon and press 'Sync Piazza Data'.")
        wait_for_piazza_course(driver)
        wait_for_content_script(driver)
        print_step("Content script injection confirmed on the active course page.")

        clear_logs(driver)
        started_at = time.time()
        print_step(f"Watching Chrome logs for up to {SYNC_TIMEOUT_SECONDS} seconds for the Piazza sync RPC burst...")

        deadline = time.time() + SYNC_TIMEOUT_SECONDS
        last_reason = ""
        while time.time() < deadline:
            summary = summarize_new_logs(driver, started_at)
            verified, reason = has_sync_signature(summary)
            last_reason = reason
            if verified:
                print_step(f"Verification passed: {reason}.")
                piazzalens_logs = [
                    entry.get("message", "")
                    for entry in summary["browser_logs"]
                    if "PiazzaLens" in entry.get("message", "")
                ]
                if piazzalens_logs:
                    print_step("Relevant console logs:")
                    for line in piazzalens_logs[-10:]:
                        print(line, flush=True)
                return 0
            time.sleep(2)

        print_step(f"Verification did not complete: {last_reason}.")
        print_step("If you clicked Sync and still hit this, Piazza may be serving its own /logic/api traffic without exposing postData in performance logs.")
        return 2
    except (TimeoutException, JavascriptException, WebDriverException) as error:
        print_step(f"Verification failed: {error}")
        if driver is not None:
            dump_failure_diagnostics(driver)
        return 1
    finally:
        if driver is not None:
            print_step("Leaving Chrome open for inspection. Close it manually when done.")
        else:
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())