# Salesforce org (Agentforce Developer Edition)

- **Login URL:** https://orgfarm-ded8b55b3b-dev-ed.develop.my.salesforce.com
- **Username:** miles.stauffer.37951dd00185@agentforce.com
- **CLI alias:** `kb` (set during Phase 0 login)

Password lives in Miles's password manager / .env.local — never in this file.

## One-time login (Miles runs this — opens a browser)

    ! sf org login web --alias kb --set-default --instance-url https://orgfarm-ded8b55b3b-dev-ed.develop.my.salesforce.com

After that, the CLI and the Salesforce MCP server both reuse the stored token — no password needed again.
