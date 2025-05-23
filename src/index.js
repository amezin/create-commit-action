import { isUtf8 } from 'node:buffer';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

function readOnlyProperties(properties) {
    return Object.fromEntries(
        Object.entries(properties).map(
            ([name, value]) => [name, { value }]
        )
    );
}

class Repository {
    constructor(octokit, repository) {
        const [owner, repo, ...extra] = repository.split('/')

        if (!owner || !repo || extra.length) {
            throw new Error(
              `Invalid repository '${repository}'. Expected format {owner}/{repo}.`
            )
        }

        Object.defineProperties(this, readOnlyProperties({
            octokit,
            owner,
            repo,
        }));
    }

    async createBlob(buffer, encoding = 'base64') {
        const { octokit, owner, repo } = this;
        const { data } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: buffer.toString(encoding),
            encoding,
        });

        const { sha } = data;

        core.info(`Created blob ${sha}`);

        return sha;
    }

    async createFile(path) {
        const type = 'blob';

        const stat = fs.lstatSync(path);

        if (stat.isSymbolicLink()) {
            return {
                path,
                type,
                mode: '120000',
                content: fs.readlinkSync(path),
            }
        }

        const mode = (stat.mode & fs.constants.S_IXUSR) ? '100755' : '100644';
        const buffer = fs.readFileSync(path);

        if (isUtf8(buffer)) {
            return {
                path,
                type,
                mode,
                content: buffer.toString('utf-8'),
            };
        }

        return {
            path,
            type,
            mode,
            sha: await this.createBlob(buffer),
        };
    }

    async createTree(parent, files) {
        const { octokit, owner, repo } = this;
        const tree = await Readable.from(files).map(path => this.createFile(path)).toArray();

        const { data } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: parent,
            tree,
        });

        const { sha, url } = data;

        core.setOutput('tree_sha', sha);
        core.setOutput('tree_url', url);

        core.startGroup(`Created tree ${sha}`);
        core.info(JSON.stringify(data.tree, undefined, ' '));
        core.endGroup();

        return sha;
    }

    async createCommit(parent, tree, message) {
        const { octokit, owner, repo } = this;
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
}

try {
    const parent = core.getInput('parent', { required: true });
    const files = core.getMultilineInput('files', { required: true });
    const message = core.getInput('message', { required: true });
    const token = core.getInput('github-token', { required: true });

    const repo = new Repository(
        getOctokit(token),
        core.getInput('repository', { required: true }),
    );

    const tree = await repo.createTree(parent, files);
    await repo.createCommit(parent, tree, message);
} catch (error) {
    core.setFailed(`${error?.message ?? error}`);
}
