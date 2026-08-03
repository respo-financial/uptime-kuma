module.exports = {
    apps: [
        {
            name: "uptime-kuma",
            script: "./server/server.js",
            env: {
                // Skip health checks while the laptop has no network (macOS scutil --nwi)
                UPTIME_KUMA_SKIP_CHECKS_WHEN_OFFLINE: "1",
            },
        },
    ],
};
