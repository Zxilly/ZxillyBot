import type {Probot} from "probot";
import type {ProbotOctokit} from "probot";
import {acceptableConclusions, mergePR} from "../merge.js";

interface CheckPayload {
    id: number;
    conclusion: string | null;
    pull_requests: { number: number }[];
}

const handleCheckCompleted = async (
    label: string,
    check: CheckPayload,
    octokit: ProbotOctokit,
    log: (msg: string) => void,
    owner: string,
    repo: string,
) => {
    log(`${label} ${check.id} completed`);

    if (check.pull_requests.length === 0) {
        log(`No pull requests found for ${label} ${check.id}`);
        return;
    }

    if (!acceptableConclusions(check.conclusion)) {
        log(`${label} ${check.id} is not successful, ${check.conclusion}`);
        return;
    }

    for (const cpr of check.pull_requests) {
        await mergePR(octokit, log, owner, repo, cpr.number);
    }
}

export function registerCheckHandlers(app: Probot) {
    app.on("check_run.completed", async (context) => {
        await handleCheckCompleted(
            "Check run",
            context.payload.check_run,
            context.octokit,
            context.log.info,
            context.payload.repository.owner.login,
            context.payload.repository.name,
        );
    })

    app.on("check_suite.completed", async (context) => {
        await handleCheckCompleted(
            "Check suite",
            context.payload.check_suite,
            context.octokit,
            context.log.info,
            context.payload.repository.owner.login,
            context.payload.repository.name,
        );
    })
}
