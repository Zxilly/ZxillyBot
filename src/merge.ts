import type {ProbotOctokit} from "probot";

export const acceptableConclusions = (conclusion: string | null) => {
    return conclusion === "success" || conclusion === "skipped";
}

const checkBranchProtection = async (
    octokit: ProbotOctokit,
    log: (msg: string) => void,
    owner: string,
    repo: string,
    branch: string,
    headSha: string,
    prNumber: number,
): Promise<boolean> => {
    let protection;
    try {
        const resp = await octokit.rest.repos.getBranchProtection({
            owner,
            repo,
            branch,
        });
        protection = resp.data;
    } catch (e: unknown) {
        if (e instanceof Error && "status" in e && (e as { status: number }).status === 404) {
            log(`No branch protection rules for ${branch}, proceeding`);
            return true;
        }
        throw e;
    }

    if (protection.required_status_checks) {
        const {data: combinedStatus} = await octokit.rest.repos.getCombinedStatusForRef({
            owner,
            repo,
            ref: headSha,
        });

        if (combinedStatus.state !== "success") {
            log(`Pull request ${prNumber}: combined status check state is "${combinedStatus.state}", required "success"`);
            for (const status of combinedStatus.statuses) {
                if (status.state !== "success") {
                    log(`  Status "${status.context}" is "${status.state}"`);
                }
            }
            return false;
        }
    }

    if (protection.required_pull_request_reviews) {
        const requiredCount = protection.required_pull_request_reviews.required_approving_review_count ?? 1;

        const {data: reviews} = await octokit.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: prNumber,
        });

        const approvals = reviews.filter(
            (r) => r.state === "APPROVED"
        ).length;

        if (approvals < requiredCount) {
            log(`Pull request ${prNumber}: has ${approvals} approvals, requires ${requiredCount}`);
            return false;
        }
    }

    if (protection.required_conversation_resolution) {
        // REST API cannot determine thread resolution status precisely;
        // log a warning and let the merge API enforce this rule.
        log(`Pull request ${prNumber}: branch "${branch}" requires conversation resolution, deferring to merge API`);
    }

    log(`Pull request ${prNumber}: branch protection checks passed for ${branch}`);
    return true;
}

export const mergePR = async (octokit: ProbotOctokit, log: (msg: string) => void, owner: string, repo: string, pr: number) => {
    const pull = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pr,
    })

    const data = pull.data;
    if (data.state !== "open") {
        log(`Pull request ${data.number} is not open`);
        return;
    }

    if (data.merged) {
        log(`Pull request ${data.number} is already merged`);
        return;
    }

    if (data.draft) {
        log(`Pull request ${data.number} is a draft`);
        return;
    }

    if (!data.rebaseable) {
        log(`Pull request ${data.number} is not rebaseable`);
        return;
    }

    if (!data.user) {
        log(`Pull request ${data.number} has no user`);
        return;
    }

    if (data.user.login !== "dependabot[bot]") {
        log(`Pull request ${data.number} is not from dependabot`);
        return;
    }

    const check_runs = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: data.head.ref,
    })

    if (check_runs.data.total_count === 0) {
        log(`No check runs found for pull request ${data.number}`);
        return;
    }

    if (!check_runs.data.check_runs.every((cr) => acceptableConclusions(cr.conclusion))) {
        for (const cr of check_runs.data.check_runs) {
            if (!acceptableConclusions(cr.conclusion)) {
                log(`Check run ${cr.id} is not successful, ${cr.conclusion}`);
                log(`Check run ${cr.id} has status ${cr.status}`);
                log(`Check run ${cr.id} has url ${cr.url}`);
            }
        }
        return;
    }

    if (!await checkBranchProtection(octokit, log, owner, repo, data.base.ref, data.head.sha, data.number)) {
        return;
    }

    const {data: {merged, message}} = await octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: data.number,
        merge_method: "rebase",
    })

    if (merged) {
        log(`Pull request ${data.number} merged successfully`);
    } else {
        log(`Pull request ${data.number} failed to merge: ${message}`);
    }
}

export const mergeAllPRsInRepo = async (octokit: ProbotOctokit, log: (msg: string) => void, fullname: string) => {
    const [owner, repo] = fullname.split("/");

    const prs = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "open",
        per_page: 100,
    })

    log(`Found ${prs.data.length} pull requests for ${owner}/${repo}`);

    for (const lpr of prs.data) {
        await mergePR(octokit, log, owner, repo, lpr.number);
    }
}
