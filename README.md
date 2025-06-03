# Create Detached Commit

Create a commit through GitHub API, completely without `git` CLI.

- The commit will be authored by the owner of API token.

- The commit will be displayed by GitHub as "verified".

- The commit can be created on top of any other commit - not just a branch head.

- The commit won't belong to any branch. If necessary, other actions should be
  used to create or update the branch - https://github.com/amezin/create-or-update-git-ref-action.

## Inputs

### `message`

The commit message. No default value. Required input.

### `files`

Files to include in the commit, one file or pattern per line.

No default value. Required input.

Supports wildcard patterns -
see [`@actions/glob`](https://github.com/actions/toolkit/blob/main/packages/glob/README.md).

Symbolic links are not followed - symlinks themselves are added to the commit.

Relative paths are resolved against the default working directory -
`${{ github.workspace }}` or `$GITHUB_WORKSPACE`.

May include unchanged files.

> [!WARNING]
> Currently, symlinks are unintentionally followed on Windows.

> [!WARNING]
> Currently, it's not possible to delete files using this action.

### `toplevel`

Root/top-level directory of the repository.

With `files: subdir/a.txt` and `toplevel: subdir`, `a.txt` will be added to
the root directory of the repository.

_Default_: the default working directory - `${{ github.workspace }}` or `$GITHUB_WORKSPACE`.

### `parent`

Parent commit SHA.

_Default_: `${{ github.sha }}` - the commit that triggered the workflow.

### `repository`

The owner and repository name, in `owner/name` format.

_Default_: `${{ github.repository }}` - the repository where the workflow was
triggered.

### `github-token`

GitHub API token to use.

Must have `contents: write` permission.

The application or user the token belongs to will become the author of the commit.

_Default_: `${{ github.token }}`

> [!NOTE]
> With the default token, `github-actions[bot]` will be the commit author.

## Outputs

### `sha`

SHA of the created commit.

### `url`

API URL of the created commit.

### `html_url`

Browser URL of the created commit.

### `tree_sha`

SHA of the created Git tree.

### `tree_url`

API URL of the created Git tree.

## Usage example

https://github.com/amezin/pull-request-generator/blob/main/.github/workflows/make-pull-request.yml

## Currently unsupported

- Deleting files

- Conversion of line endings (should only matter on Windows)

- Symlinks on Windows

## Why not GraphQL [`createCommitOnBranch`]

This action is intended to be used by workflows that update auto-generated
files through pull requests.

Of course, you can create a branch, then use [`createCommitOnBranch`], then
create a pull request. But how to update the pull request, when something else
gets merged into `main`, and the changes in the pull request probably need
to be updated/re-generated?

With [`createCommitOnBranch`] your only option seems to be creating
a new branch for every run. You can't amend the commit, and you can't rebase
the branch and update the commit at once (in a way that won't trigger CI
for the pull request twice).

However, if the commit is initially detached, you can simply update
pull request's head branch to point to the new commit.

[`createCommitOnBranch`]: https://docs.github.com/en/graphql/reference/mutations#createcommitonbranch
