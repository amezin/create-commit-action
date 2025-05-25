const { isUtf8 } = require('node:buffer');
const fs = require('node:fs');
const { resolve, relative, sep } = require('node:path');
const { Readable } = require('node:stream');
const { inspect } = require('node:util');

const core = require('@actions/core');
const { getOctokit } = require('@actions/github');
const glob = require('@actions/glob');
const { requestLog } = require('@octokit/plugin-request-log');

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

        return data.sha;
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

function makeRelative(toplevel, entry) {
    const { path, ...properties } = entry;

    return { path: relative(toplevel, path).replaceAll(sep, '/'), ...properties };
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

async function run() {
    const log = {
        debug: core.isDebug() ? console.debug.bind(console) : new Function(),
        info: console.info.bind(console),
    };

    const token = core.getInput('github-token', { required: true });
    const parent = core.getInput('parent', { required: true });
    const message = core.getInput('message', { required: true });
    const toplevel = resolve(core.getInput('toplevel', { required: true }));
    const repository = core.getInput('repository', { required: true })

    const globber = await glob.create(
        core.getInput('files', { required: true }),
        {
            followSymbolicLinks: false,
            implicitDescendants: true,
            matchDirectories: false,
        }
    );

    const files = await globber.glob();
    const blobs = files.map(readFile).map(entry => makeRelative(toplevel, entry));

    const github = getOctokit(token, { log }, requestLog);
    const repo = new Repository(github, repository);
    const entries = await Readable.from(blobs).map(blob => uploadBlob(blob, repo)).toArray();
    const tree = await repo.createTree(parent, entries);

    await repo.createCommit(parent, tree, message);
}

async function runWithErrorHandling() {
    try {
        await run();
    } catch (error) {
        core.setFailed(`${error?.message ?? error}`);
        core.debug(inspect(error));
    }
}

runWithErrorHandling()
