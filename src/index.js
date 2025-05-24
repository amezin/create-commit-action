import { isUtf8 } from 'node:buffer';
import * as fs from 'node:fs';

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';

class Blob {
    #content;
    #encoding;
    #sha;

    constructor(content, encoding) {
        this.#content = content;
        this.#encoding = encoding;
    }

    get sha() {
        return this.#sha;
    }

    get encoding() {
        return this.#encoding;
    }

    content(encoding = 'utf-8') {
        if (this.encoding !== encoding) {
            throw new Error('Encoding mismatch');
        }

        return this.#content;
    }

    async upload(repository) {
        this.#sha = await repository.createBlob(this.#content, this.#encoding);

        return this.#sha;
    }

    get inline() {
        return this.encoding === 'utf-8';
    }

    static from(buffer) {
        if (typeof buffer === 'string') {
            return new Blob(buffer, 'utf-8');
        }

        if (isUtf8(buffer)) {
            return new Blob(buffer.toString('utf-8'), 'utf-8');
        }

        return new Blob(buffer.toString('base64'), 'base64');
    }

    json() {
        const { sha } = this;

        if (sha) {
            return { sha };
        }

        return { content: this.content() };
    }
}

class Entry {
    #path;
    #type;
    #mode;

    constructor(path, type, mode) {
        this.#path = path;
        this.#type = type;
        this.#mode = mode;
    }

    get path() {
        return this.#path;
    }

    get type() {
        return this.#type;
    }

    get mode() {
        return this.#mode;
    }

    json() {
        const { path, type, mode } = this;

        return { path, type, mode };
    }
}

class BlobEntry extends Entry {
    #blob;

    constructor(path, mode, blob) {
        super(path, 'blob', mode);

        if (!(blob instanceof Blob)) {
            blob = Blob.from(blob);
        }

        this.#blob = blob;
    }

    get blob() {
        return this.#blob;
    }

    get sha() {
        return this.blob.sha;
    }

    get inline() {
        return this.blob.inline;
    }

    async upload(repository) {
        await this.blob.upload(repository);

        return this.json();
    }

    json() {
        return {
            ...super.json(),
            ...this.blob.json(),
        };
    }

    static fromFile(path) {
        const stat = fs.lstatSync(path);

        if (stat.isSymbolicLink()) {
            return new BlobEntry(path, '120000', fs.readlinkSync(path));
        }

        return new BlobEntry(
            path,
            (stat.mode & fs.constants.S_IXUSR) ? '100755' : '100644',
            fs.readFileSync(path)
        );
    }
}

class Repository {
    #octokit;
    #owner;
    #repo;

    constructor(octokit, repository) {
        const [owner, repo, ...extra] = repository.split('/')

        if (!owner || !repo || extra.length) {
            throw new Error(
              `Invalid repository '${repository}'. Expected format {owner}/{repo}.`
            )
        }

        this.#octokit = octokit;
        this.#owner = owner;
        this.#repo = repo;
    }

    get octokit() {
        return this.#octokit;
    }

    get owner() {
        return this.#owner;
    }

    get repo() {
        return this.#repo;
    }

    async createBlob(content, encoding) {
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

    async createTree(base_tree, entries) {
        const { octokit, owner, repo } = this;

        for (const entry of entries) {
            if (!entry.inline) {
                await entry.upload(this);
            }
        }

        const { data } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree,
            tree: entries.map(entry => entry.json()),
        });

        const { sha, url, tree } = data;

        core.setOutput('tree_sha', sha);
        core.setOutput('tree_url', url);

        core.startGroup(`Created tree ${sha}`);
        core.info(JSON.stringify(tree, undefined, ' '));
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

    const tree = await repo.createTree(
        parent,
        files.map(path => BlobEntry.fromFile(path))
    );

    await repo.createCommit(parent, tree, message);
} catch (error) {
    core.setFailed(`${error?.message ?? error}`);
    core.debug(error.stack);
}
