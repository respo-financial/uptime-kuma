const { execFile } = require("child_process");
const { promisify } = require("util");
const { log } = require("../src/util");

const execFileAsync = promisify(execFile);

/** @type {{ available: boolean, checkedAt: number }} */
let cache = {
    available: true,
    checkedAt: 0,
};

/**
 * Whether monitor checks should be skipped when the host is offline.
 * Set UPTIME_KUMA_SKIP_CHECKS_WHEN_OFFLINE=1 to enable.
 * @returns {boolean}
 */
function isEnabled() {
    return process.env.UPTIME_KUMA_SKIP_CHECKS_WHEN_OFFLINE === "1";
}

/**
 * @returns {number}
 */
function getCacheTtlMs() {
    const parsed = parseInt(process.env.UPTIME_KUMA_INTERNET_CHECK_CACHE_SECONDS, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed * 1000;
    }
    return 30 * 1000;
}

/**
 * Parse `scutil --nwi` (macOS System Configuration network state).
 * @param {string} stdout
 * @returns {boolean}
 */
function parseMacNwiReachable(stdout) {
    const ipv4Section = stdout.split("IPv6 network interface information")[0] || stdout;

    if (/No IPv4 states found/i.test(ipv4Section)) {
        return false;
    }

    const summaryReach = ipv4Section.match(/REACH\s*:\s*flags\s+\S+\s+\((Reachable|Not Reachable)\)/i);
    if (summaryReach) {
        return summaryReach[1].toLowerCase() === "reachable";
    }

    const ifaceReach = ipv4Section.match(/reach\s+:\s+\S+\s+\((Reachable|Not Reachable)\)/i);
    if (ifaceReach) {
        return ifaceReach[1].toLowerCase() === "reachable";
    }

    return false;
}

/**
 * macOS: ask the OS whether the machine has a reachable IPv4 network path.
 * @returns {Promise<boolean>}
 */
async function checkMacNetworkReachable() {
    const { stdout } = await execFileAsync("/usr/sbin/scutil", ["--nwi"], { timeout: 5000 });
    return parseMacNwiReachable(stdout);
}

/**
 * Linux: use NetworkManager connectivity state when available.
 * @returns {Promise<boolean>}
 */
async function checkLinuxNetworkReachable() {
    try {
        const { stdout } = await execFileAsync("nmcli", ["-t", "-f", "CONNECTIVITY", "g"], { timeout: 5000 });
        const state = stdout.trim().toLowerCase();
        return state === "full" || state === "limited";
    } catch {
        const { stdout } = await execFileAsync("ip", ["route", "get", "1.1.1.1"], { timeout: 5000 });
        return /1\.1\.1\.1/.test(stdout);
    }
}

/**
 * @returns {Promise<boolean>}
 */
async function isMachineNetworkReachable() {
    if (process.platform === "darwin") {
        return checkMacNetworkReachable();
    }
    if (process.platform === "linux") {
        return checkLinuxNetworkReachable();
    }

    log.warn(
        "internet-connectivity",
        `Skipping host-offline checks: unsupported platform ${process.platform}`
    );
    return true;
}

/**
 * Returns false when the host has no usable network (cached briefly).
 * When the feature is disabled, always returns true.
 * @returns {Promise<boolean>}
 */
async function isHostInternetAvailable() {
    if (!isEnabled()) {
        return true;
    }

    const now = Date.now();
    if (now - cache.checkedAt < getCacheTtlMs()) {
        return cache.available;
    }

    try {
        const available = await isMachineNetworkReachable();

        if (available) {
            if (!cache.available) {
                log.info("internet-connectivity", "Host network connection restored");
            }
            cache = { available: true, checkedAt: now };
            return true;
        }

        if (cache.available) {
            log.warn("internet-connectivity", "Host has no network connection, skipping monitor checks");
        }
        cache = { available: false, checkedAt: now };
        return false;
    } catch (e) {
        log.debug("internet-connectivity", `Network check failed: ${e.message}`);
        // If the OS check fails, keep running monitors (fail open)
        cache = { available: true, checkedAt: now };
        return true;
    }
}

/**
 * @returns {void}
 */
function resetCacheForTests() {
    cache = { available: true, checkedAt: 0 };
}

module.exports = {
    isHostInternetAvailable,
    isEnabled,
    resetCacheForTests,
    parseMacNwiReachable,
};
