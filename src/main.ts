import { isUtf8, type Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { inspect } from 'node:util';

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import * as glob from '@actions/glob';
import { requestLog } from '@octokit/plugin-request-log';

type BlobEncoding = 'base64' | 'utf-8';

type BlobContent = {
    content: string;
    encoding: BlobEncoding;
};

type BlobInline = {
    content: string;
};

type BlobRef = {
    sha: string;
};

type TreeEntry = {
    path: string;
    mode: '100755' | '100644' | '120000';
};

class Repository {
    private readonly octokit: ReturnType<typeof getOctokit>;
    private readonly owner: string;
    private readonly repo: string;

    constructor(octokit: ReturnType<typeof getOctokit>, repository: string) {
        const [owner, repo, ...extra] = repository.split('/');

        if (!owner || !repo || extra.length) {
            throw new Error(
                `Invalid repository '${repository}'. Expected format {owner}/{repo}.`
            );
        }

        this.octokit = octokit;
        this.owner = owner;
        this.repo = repo;
    }

    async createBlob(content: string, encoding: BlobEncoding = 'base64') {
        const { octokit, owner, repo } = this;

        const { data } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content,
            encoding,
        });

        return data.sha;
    }

    async createTree(
        base_tree: string,
        tree: Array<TreeEntry & (BlobRef | BlobInline)>
    ) {
        const { octokit, owner, repo } = this;

        const { data } = await octokit.rest.git.createTree({
            owner,
            repo,
            base_tree,
            tree,
        });

        return data;
    }

    async createCommit(parent: string, tree: string, message: string) {
        const { octokit, owner, repo } = this;

        const { data } = await octokit.rest.git.createCommit({
            owner,
            repo,
            parents: [parent],
            tree,
            message,
        });

        return data;
    }
}

function encode(buffer: Buffer): BlobContent {
    const encoding = isUtf8(buffer) ? 'utf-8' : 'base64';

    return {
        content: buffer.toString(encoding),
        encoding,
    };
}

function readFile(path: string): TreeEntry & BlobContent {
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
            mode: stat.mode & fs.constants.S_IXUSR ? '100755' : '100644',
            ...encode(fs.readFileSync(path)),
        };
    }
}

function makeRelative<Entry extends TreeEntry>(toplevel: string, entry: Entry) {
    const { path, ...properties } = entry;

    return {
        path: relative(toplevel, path).replaceAll(sep, '/'),
        ...properties,
    };
}

async function uploadBlob(
    blob: BlobContent & TreeEntry,
    repo: Repository,
    maxInlineBlobSize: number
): Promise<TreeEntry & (BlobRef | BlobInline)> {
    const { content, encoding, ...properties } = blob;

    if (encoding === 'utf-8' && content.length <= maxInlineBlobSize) {
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

function parseFileSize(value: string): number {
    const match = value.match(/^\s*(\d+)\s*([kKmM])?\s*$/);

    if (!match) {
        throw new Error(`Invalid size ${value}`);
    }

    return (
        Number.parseInt(match[1], 10) *
        ({
            k: 1000,
            K: 1000,
            m: 1000000,
            M: 1000000,
        }[match[2]] ?? 1)
    );
}

async function run() {
    const log = {
        debug: core.isDebug()
            ? console.debug.bind(console)
            : (..._args: unknown[]) => {},
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };

    const token = core.getInput('github-token', { required: true });
    const parent = core.getInput('parent', { required: true });
    const message = core.getInput('message', { required: true });
    const toplevel = resolve(core.getInput('toplevel', { required: true }));
    const repository = core.getInput('repository', { required: true });

    const maxInlineBlobSize = parseFileSize(
        core.getInput('max-inline-blob-size', { required: true })
    );

    const globber = await glob.create(
        core.getInput('files', { required: true }),
        {
            followSymbolicLinks: false,
            implicitDescendants: true,
            matchDirectories: false,
        }
    );

    const files = await globber.glob();
    const blobs = files
        .map(readFile)
        .map(entry => makeRelative(toplevel, entry));

    const github = getOctokit(token, { log }, requestLog);
    const repo = new Repository(github, repository);

    const entries = await Readable.from(blobs)
        .map((blob: BlobContent & TreeEntry) =>
            uploadBlob(blob, repo, maxInlineBlobSize)
        )
        .toArray();

    const tree = await repo.createTree(
        parent,
        entries as (TreeEntry & (BlobRef | BlobInline))[]
    );

    core.setOutput('tree_sha', tree.sha);
    core.setOutput('tree_url', tree.url);

    const commit = await repo.createCommit(parent, tree.sha, message);

    core.setOutput('sha', commit.sha);
    core.setOutput('url', commit.url);
    core.setOutput('html_url', commit.html_url);

    core.info(`Created commit ${commit.html_url}`);
}

run().catch((error: unknown) => {
    core.setFailed(String(error));
    core.debug(inspect(error));
});
