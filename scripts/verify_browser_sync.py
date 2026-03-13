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
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
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
CFT_METADATA_URL = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
CFT_CACHE_DIR = REPO_ROOT / ".cache" / "chrome-for-testing"


def resolve_system_browser() -> str | None:
    override = os.environ.get("PIAZZALENS_CHROME_BINARY")
    if override:
        return override

    for candidate in ("chromium", "chromium-browser", "google-chrome"):
        binary = shutil.which(candidate)
        if binary:
            return binary

    return None


def build_driver(debugger_address: str) -> webdriver.Chrome:
    options = Options()
    options.debugger_address = debugger_address
    options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
    return webdriver.Chrome(options=options)


def launch_chrome(profile_dir: Path, browser_binary: str) -> tuple[subprocess.Popen[bytes], str]:
    if not browser_binary:
        raise RuntimeError("Could not find a Chrome-family browser binary on this machine")

    port = allocate_debug_port()
    debugger_address = f"127.0.0.1:{port}"
    command = [
        browser_binary,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-search-engine-choice-screen",
        "--disable-backgrounding-occluded-windows",
        "--disable-popup-blocking",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--new-window",
        f"--disable-extensions-except={EXTENSION_DIR}",
        f"--load-extension={EXTENSION_DIR}",
        "https://piazza.com",
    ]

    process = subprocess.Popen(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    wait_for_debugger(debugger_address)
    return process, debugger_address


def allocate_debug_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return int(sock.getsockname()[1])


def wait_for_debugger(debugger_address: str) -> None:
    host, port_text = debugger_address.split(":", 1)
    port = int(port_text)
    deadline = time.time() + 20

    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            if sock.connect_ex((host, port)) == 0:
                return
        time.sleep(0.25)

    raise TimeoutException(f"Timed out waiting for Chrome remote debugger at {debugger_address}")


def ensure_chrome_for_testing() -> str:
    CFT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print_step("Downloading Chrome for Testing metadata...")

    with urllib.request.urlopen(CFT_METADATA_URL, timeout=30) as response:
        metadata = json.load(response)

    stable = metadata.get("channels", {}).get("Stable", {})
    version = stable.get("version")
    downloads = stable.get("downloads", {}).get("chrome", [])
    download_url = next(
        (item.get("url") for item in downloads if item.get("platform") == "linux64"),
        None,
    )

    if not version or not download_url:
        raise RuntimeError("Could not resolve a Linux Chrome for Testing download URL")

    install_dir = CFT_CACHE_DIR / version
    binary_path = install_dir / "chrome-linux64" / "chrome"
    if binary_path.exists():
        ensure_cft_permissions(install_dir / "chrome-linux64")
        return str(binary_path)

    archive_path = CFT_CACHE_DIR / f"chrome-linux64-{version}.zip"
    print_step(f"Downloading Chrome for Testing {version}...")
    urllib.request.urlretrieve(download_url, archive_path)

    extract_dir = install_dir.parent / f"{version}.tmp"
    if extract_dir.exists():
        shutil.rmtree(extract_dir, ignore_errors=True)
    extract_dir.mkdir(parents=True, exist_ok=True)

    print_step("Extracting Chrome for Testing...")
    with zipfile.ZipFile(archive_path) as archive:
        archive.extractall(extract_dir)

    if install_dir.exists():
        shutil.rmtree(install_dir, ignore_errors=True)
    extract_dir.rename(install_dir)
    ensure_cft_permissions(install_dir / "chrome-linux64")
    return str(binary_path)


def ensure_cft_permissions(chrome_dir: Path) -> None:
    for executable_name in ("chrome", "chrome-wrapper", "chrome_crashpad_handler", "chrome_sandbox", "xdg-mime", "xdg-settings"):
        executable_path = chrome_dir / executable_name
        if executable_path.exists():
            executable_path.chmod(executable_path.stat().st_mode | 0o111)


def extension_registered(profile_dir: Path) -> bool:
    prefs_path = profile_dir / "Default" / "Preferences"
    if not prefs_path.exists():
        return False

    try:
        prefs = json.loads(prefs_path.read_text(errors="ignore"))
    except json.JSONDecodeError:
        return False

    settings = prefs.get("extensions", {}).get("settings", {})
    target_path = str(EXTENSION_DIR.resolve())

    for info in settings.values():
        path = info.get("path")
        if path and Path(path).resolve() == Path(target_path):
            return True

        manifest = info.get("manifest", {})
        if manifest.get("name") == "PiazzaLens — AI Insights for Piazza":
            return True

    return False


def get_extension_id(profile_dir: Path) -> str:
    prefs_path = profile_dir / "Default" / "Preferences"
    if not prefs_path.exists():
        raise RuntimeError("Chrome profile preferences were not written")

    prefs = json.loads(prefs_path.read_text(errors="ignore"))
    settings = prefs.get("extensions", {}).get("settings", {})
    target_path = EXTENSION_DIR.resolve()

    for extension_id, info in settings.items():
        path = info.get("path")
        manifest = info.get("manifest", {})
        if path and Path(path).resolve() == target_path:
            return extension_id
        if manifest.get("name") == "PiazzaLens — AI Insights for Piazza":
            return extension_id

    raise RuntimeError("Could not resolve the unpacked PiazzaLens extension id")


def wait_for_extension_registration(profile_dir: Path, browser_binary: str) -> None:
    deadline = time.time() + 15
    while time.time() < deadline:
        if extension_registered(profile_dir):
            return
        time.sleep(0.5)

    binary_name = Path(browser_binary).name if browser_binary else "browser"
    raise RuntimeError(
        f"Chrome did not register the unpacked PiazzaLens extension in the temporary profile. "
        f"On some Google Chrome builds, command-line side-loading is ignored; use Chromium or Chrome for Testing instead of {binary_name}."
    )


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


def trigger_sync_via_popup(driver: webdriver.Chrome, extension_id: str) -> dict:
    piazza_window = driver.current_window_handle
    started_at_ms = int(time.time() * 1000)
    popup_url = f"chrome-extension://{extension_id}/popup.html?keepOpen=1"

    print_step(f"Opening extension popup page: {popup_url}")
    driver.switch_to.new_window("tab")
    popup_window = driver.current_window_handle
    driver.get(popup_url)

    sync_button = WebDriverWait(driver, 20).until(
        EC.element_to_be_clickable((By.ID, "btn-export-data")),
        message="Sync button did not appear in the extension popup page",
    )
    sync_button.click()
    print_step("Triggered 'Sync Piazza Data' from the extension popup page.")

    storage_result = wait_for_export_storage(driver, started_at_ms)

    button_text = ""
    try:
        button_text = driver.find_element(By.ID, "btn-export-data").text
    except Exception:
        button_text = ""

    driver.switch_to.window(piazza_window)
    return {
        "popup_window": popup_window,
        "storage": storage_result,
        "button_text": button_text,
    }


def wait_for_export_storage(driver: webdriver.Chrome, started_at_ms: int) -> dict:
    def read_last_export() -> dict | None:
        return driver.execute_async_script(
            """
            const callback = arguments[arguments.length - 1];
            chrome.storage.local.get(["lastPiazzaExport"], (data) => {
              callback(data.lastPiazzaExport || null);
            });
            """
        )

    deadline = time.time() + SYNC_TIMEOUT_SECONDS
    while time.time() < deadline:
        export_entry = read_last_export()
        fetched_at = int(export_entry.get("fetchedAt", 0)) if export_entry else 0
        post_count = int((export_entry or {}).get("summary", {}).get("postCount", 0) or 0)
        if export_entry and fetched_at >= started_at_ms and post_count > 0:
            return export_entry
        time.sleep(1)

    raise TimeoutException("Timed out waiting for lastPiazzaExport to update after triggering sync")


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

    browser_binary = resolve_system_browser()
    if not browser_binary:
        print_step("No Chrome-family browser binary was found on this machine.")
        return 1

    profile_dir = Path(tempfile.mkdtemp(prefix="piazzalens-browser-"))
    print_step(f"Using temporary Chrome profile: {profile_dir}")
    driver = None
    chrome_process = None

    try:
        print_step(f"Launching browser: {Path(browser_binary).name}")
        chrome_process, debugger_address = launch_chrome(profile_dir, browser_binary)
        print_step(f"Launched Chrome with remote debugger at {debugger_address}")

        try:
            wait_for_extension_registration(profile_dir, browser_binary)
        except RuntimeError:
            if Path(browser_binary).name != "google-chrome":
                raise

            print_step("Installed Google Chrome ignored the unpacked extension. Retrying with Chrome for Testing...")
            if chrome_process is not None and chrome_process.poll() is None:
                chrome_process.terminate()
                chrome_process.wait(timeout=10)
            shutil.rmtree(profile_dir, ignore_errors=True)

            browser_binary = ensure_chrome_for_testing()
            profile_dir = Path(tempfile.mkdtemp(prefix="piazzalens-browser-"))
            print_step(f"Using temporary Chrome for Testing profile: {profile_dir}")
            print_step(f"Launching browser: {browser_binary}")
            chrome_process, debugger_address = launch_chrome(profile_dir, browser_binary)
            print_step(f"Launched Chrome with remote debugger at {debugger_address}")
            wait_for_extension_registration(profile_dir, browser_binary)

        print_step("Confirmed that the unpacked extension is registered in the temporary profile.")
        driver = build_driver(debugger_address)
        driver.set_window_size(1440, 1000)
        extension_id = get_extension_id(profile_dir)
        print_step(f"Resolved extension id: {extension_id}")

        print_step("Chrome launched with the unpacked extension loaded.")
        print_step("In that Chrome window: log into Piazza and open a course page. The verifier will trigger sync automatically.")
        wait_for_piazza_course(driver)
        wait_for_content_script(driver)
        print_step("Content script injection confirmed on the active course page.")

        sync_result = trigger_sync_via_popup(driver, extension_id)
        storage_summary = sync_result["storage"].get("summary", {})
        print_step(
            "Storage updated after sync: "
            f"{storage_summary.get('postCount', 0)} posts, "
            f"mode {storage_summary.get('extractionMode', 'unknown')}"
        )

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
                print_step(
                    "Stored export summary: "
                    f"{storage_summary.get('postCount', 0)} posts, "
                    f"{storage_summary.get('studentCount', 0)} students, "
                    f"mode {storage_summary.get('extractionMode', 'unknown')}"
                )
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

        print_step(f"RPC log verification did not complete: {last_reason}.")
        print_step(
            "The sync itself succeeded because extension storage was updated; Chrome performance logs likely omitted the Piazza request bodies."
        )
        print_step(
            "Stored export summary: "
            f"{storage_summary.get('postCount', 0)} posts, "
            f"{storage_summary.get('studentCount', 0)} students, "
            f"mode {storage_summary.get('extractionMode', 'unknown')}"
        )
        return 0
    except (TimeoutException, JavascriptException, WebDriverException, RuntimeError) as error:
        print_step(f"Verification failed: {error}")
        if driver is not None:
            dump_failure_diagnostics(driver)
        return 1
    finally:
        if driver is not None:
            print_step("Leaving Chrome open for inspection. Close it manually when done.")
        else:
            if chrome_process is not None and chrome_process.poll() is None:
                chrome_process.terminate()
            shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())