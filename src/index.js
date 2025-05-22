import * as fs from 'node:fs';
import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

function getRepo() {
    const qualified = core.getInput('repository', { required: true });
    const [owner, repo, ...extra] = qualified.split('/')

    if (!owner || !repo || extra.length) {
        throw new Error(
          `Invalid repository '${qualified}'. Expected format {owner}/{repo}.`
        )
    }

    return { owner, repo };
}

async function createTree(octokit, owner, repo, parent, files) {
    const tree = files.map(path => {
        const stat = fs.lstatSync(path);

        if (stat.isSymbolicLink()) {
            return {
                path,
                type: 'blob',
                mode: '120000',
                content: fs.readlinkSync(path, { encoding: 'utf-8' }),
            }
        }

        return {
            path,
            type: 'blob',
            mode: (stat.mode & fs.constants.S_IXUSR) ? '100755' : '100644',
            content: fs.readFileSync(path, { encoding: 'utf-8' }),
        }
    });

    const { data } = await octokit.rest.git.createTree({
        owner,
        repo,
        base_tree: parent,
        tree,
    });

    const { sha, url } = data;

    core.setOutput('tree_sha', sha);
    core.setOutput('tree_url', url);

    return sha;
}

async function createCommit(octokit, owner, repo, parent, tree, message) {
    const { data } = await octokit.rest.git.createCommit({
        owner,
        repo,
        parents: [parent],
        tree,
        message,
    });

    const { sha, url, html_url } = data;

    core.setOutput('sha', sha);
    core.setOutput('url', url);
    core.setOutput('html_url', html_url);

    core.info(`Created commit ${html_url}`);
}

try {
    const { owner, repo } = getRepo();
    const parent = core.getInput('parent', { required: true });
    const files = core.getMultilineInput('files', { required: true });
    const message = core.getInput('message', { required: true });
    const token = core.getInput('github-token', { required: true });

    const octokit = getOctokit(token);
    const tree = await createTree(octokit, owner, repo, parent, files);
    await createCommit(octokit, owner, repo, parent, tree, message);
} catch (error) {
    core.setFailed(`${error?.message ?? error}`);
}
