# Create Detached Commit

Create a commit through GitHub API, completely without `git` CLI.

- The commit will be authored by the owner of API token.

- The commit will be displayed by GitHub as "verified".

- The commit can be created on top of any other commit - not just a branch head.

- The commit won't belong to any branch. If necessary, other actions should be
  used to create or update the branch - https://github.com/amezin/create-or-update-git-ref-action.

## Usage

See [`action.yml`](./action.yml).

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
