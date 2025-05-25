import { isUtf8 } from 'node:buffer';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { inspect } from 'node:util';

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

class Repository {
    constructor(octokit, repository) {
        const [owner, repo, ...extra] = repository.split('/')

        if (!owner || !repo || extra.length) {
            throw new Error(
              `Invalid repository '${repository}'. Expected format {owner}/{repo}.`
            )
        }

        Object.assign(this, {
            octokit,
            owner,
            repo,
        });
    }

    async createBlob(content, encoding = 'base64') {
        const { octokit, owner, repo } = this;

        const { data } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content,
            encoding,
        });

        const { sha } = data;

        core.info(`Created blob ${sha}`);

        return sha;
    }

    async createTree(parent, tree) {
        const { octokit, owner, repo } = this;

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

function encode(buffer) {
    const encoding = isUtf8(buffer) ? 'utf-8' : 'base64';

    return {
        content: buffer.toString(encoding),
        encoding,
    };
}

function readFile(path) {
    const stat = fs.lstatSync(path);

    if (stat.isSymbolicLink()) {
        return {
            path,
            mode: '120000',
            ...encode(fs.readlinkSync(path, { encoding: 'buffer' })),
        };
    } else {
        return {
            path,
            mode: (stat.mode & fs.constants.S_IXUSR) ? '100755' : '100644',
            ...encode(fs.readFileSync(path)),
        };
    }
}

async function uploadBlob(blob, repo) {
    const { content, encoding, ...properties } = blob;

    if (encoding === 'utf-8') {
        return {
            content,
            ...properties,
        };
    }

    const sha = await repo.createBlob(content, encoding);

    return {
        sha,
        ...properties,
    };
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

    const blobs = files.map(readFile);
    const entries = await Readable.from(blobs).map(blob => uploadBlob(blob, repo)).toArray();
    const tree = await repo.createTree(parent, entries);

    await repo.createCommit(parent, tree, message);
} catch (error) {
    core.setFailed(`${error?.message ?? error}`);
    core.debug(inspect(error));
}
