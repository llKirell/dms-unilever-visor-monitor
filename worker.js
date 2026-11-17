const REPOSITORY = "llKirell/dms-unilever-visor-monitor";
const WORKFLOW_FILE = "refresh-productividad.yml";

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatchRefresh(env, controller.cron));
  },
};

async function dispatchRefresh(env, cron) {
  const token = env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    console.error("Falta el secreto GITHUB_ACTIONS_TOKEN en Cloudflare Workers.");
    return;
  }

  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dms-unilever-cloudflare-cron",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(`GitHub workflow dispatch fallo (${response.status}): ${detail}`);
    return;
  }

  console.log(`Refresh Productividad enviado a GitHub (${cron} UTC).`);
}
