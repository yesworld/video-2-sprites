#!/bin/sh
set -eu

cd -- "$(dirname -- "$0")"

repo_url=$(git remote get-url --push origin)
if ! author_name=$(git config --get user.name) || ! author_email=$(git config --get user.email); then
  printf '%s\n' 'Set Git user.name and user.email before deploying.' >&2
  exit 1
fi

npm run build

if [ ! -f dist/index.html ]; then
  printf '%s\n' 'Build output dist/index.html is missing.' >&2
  exit 1
fi

deploy_dir=$(mktemp -d /tmp/video-2-sprites-pages.XXXXXX)
trap 'rm -rf -- "$deploy_dir"' EXIT
trap 'exit 1' HUP INT TERM

git init -q -b gh-pages "$deploy_dir"
git -C "$deploy_dir" remote add origin "$repo_url"
branch_ref=$(git -C "$deploy_dir" ls-remote --heads origin refs/heads/gh-pages)
if [ -n "$branch_ref" ]; then
  git -C "$deploy_dir" fetch -q --depth=1 origin refs/heads/gh-pages
  git -C "$deploy_dir" checkout -q --detach FETCH_HEAD
  git -C "$deploy_dir" rm -qr --ignore-unmatch -- .
fi

cp -R dist/. "$deploy_dir/"
touch "$deploy_dir/.nojekyll"
git -C "$deploy_dir" add -A

if git -C "$deploy_dir" diff --cached --quiet; then
  printf '%s\n' 'No changes to publish.'
  exit 0
fi

git -C "$deploy_dir" -c user.name="$author_name" -c user.email="$author_email" commit -qm 'Deploy Stripe Studio'
git -C "$deploy_dir" push origin HEAD:refs/heads/gh-pages
