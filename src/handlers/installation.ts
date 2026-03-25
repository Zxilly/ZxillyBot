import type {Probot} from "probot";
import {mergeAllPRsInRepo} from "../merge.js";

export function registerInstallationHandlers(app: Probot) {
    app.on("installation_repositories.added", async (context) => {
        context.log.info(`Installation ${context.payload.installation.id} added repositories`);

        const repos = context.payload.repositories_added;

        for (const repo of repos) {
            await mergeAllPRsInRepo(
                context.octokit,
                context.log.info,
                repo.full_name,
            )
        }
    })

    app.on("installation.created", async (context) => {
        context.log.info(`Installation ${context.payload.installation.id} created`);

        const repos = context.payload.repositories;

        if (!repos) {
            context.log.info(`No repositories found for installation ${context.payload.installation.id}`);
            return;
        }

        for (const repo of repos) {
            await mergeAllPRsInRepo(
                context.octokit,
                context.log.info,
                repo.full_name,
            )
        }

        context.log.info(`Finished merging all pull requests for installation ${context.payload.installation.id}`);
    })
}
