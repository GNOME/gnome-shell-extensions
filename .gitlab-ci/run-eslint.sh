#!/usr/bin/env bash

OUTPUT_REGULAR=reports/lint-report.txt
OUTPUT_MR=reports/lint-mr-report.txt

SRCDIR=extensions

LINE_CHANGES=changed-lines.txt

is_empty() {
  (! grep -q . $1)
}

run_eslint() {
  # ensure output exists even if eslint doesn't report any errors
  mkdir -p $(dirname $OUTPUT_REGULAR)
  touch $OUTPUT_REGULAR

  eslint -f unix -o $OUTPUT_REGULAR $SRCDIR
}

list_commit_range_additions() {
  # Turn raw context-less git-diff into a list of
  # filename:lineno pairs of new (+) lines
  git diff -U0 "$@" -- js |
  awk '
    BEGIN { file=""; }
    /^+++ b/ { file=substr($0,7); }
    /^@@ / {
        len = split($3,a,",")
        start=a[1]
        count=(len > 1) ? a[2] : 1

        for (line=start; line<start+count; line++)
            printf "%s/%s:%d:\n",ENVIRON["PWD"],file,line;
    }'
}

copy_matched_lines() {
  local source=$1
  local matches=$2
  local target=$3

  echo -n > $target
  for l in $(<$matches); do
    grep $l $source >> $target
  done
}

# Clean up old files from previous runs
rm -f $OUTPUT_REGULAR $OUTPUT_MR $LINE_CHANGES

if [ "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" ]; then
  git fetch $CI_MERGE_REQUEST_PROJECT_URL.git $CI_MERGE_REQUEST_TARGET_BRANCH_NAME
  branch_point=$(git merge-base HEAD FETCH_HEAD)
  commit_range=$branch_point...$CI_COMMIT_SHA

  list_commit_range_additions $commit_range > $LINE_CHANGES

  # Don't bother with running lint when no JS changed
  if is_empty $LINE_CHANGES; then
    exit 0
  fi
fi

echo Generating lint report
run_eslint
echo Done.

# Just show the report and succeed when not testing a MR
if [ -z "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" ]; then
  cat $OUTPUT_REGULAR
  exit 0
fi

copy_matched_lines $OUTPUT_REGULAR $LINE_CHANGES $OUTPUT_MR
cat $OUTPUT_MR
is_empty $OUTPUT_MR
