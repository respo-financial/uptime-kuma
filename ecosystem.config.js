module.exports = {
    apps: [
        {
            name: "uptime-kuma",
            script: "./scripts/pm2-docker.sh",
            interpreter: "bash",
            cwd: __dirname,
            autorestart: true,
            max_restarts: 10,
            min_uptime: "10s",
            // Host Node version does not matter — the container has Node 20+.
        },
    ],
};
