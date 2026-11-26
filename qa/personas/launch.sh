#!/bin/zsh
# Usage: launch.sh <name> <apiPort> <webPort> [LLM_KEY_NAME]
# Makes a fresh isolated copy of the CURRENT working tree (uncommitted changes included) and starts, from the copy:
#   - the real API server on <apiPort> with ONLY the LLM key in its environment (no Supabase, Razorpay or other secrets),
#     recording every model call to <name>/corpus and refusing calls past QA_LLM_CAP (default 50)
#   - the web app (vite dev) on <webPort>, pointed at that API, with a fake Supabase URL (sign-in is simulated by harness.mjs)
# The key is read into a shell variable and handed to the server process only; it is never printed or written anywhere.
NAME=$1; API=$2; WEB=$3; KEYNAME=${4:-ANTHROPIC_API_KEY}
[ -z "$NAME" -o -z "$API" -o -z "$WEB" ] && { echo "usage: launch.sh <name> <apiPort> <webPort> [KEYNAME]"; exit 1; }
WT=/Users/rahulsinha/ResumeIQ/sidebar-event
BASE=$WT/qa/personas/$NAME
COPY=$BASE/app
mkdir -p $COPY $BASE/screens $BASE/corpus $BASE/downloads $BASE/profile
rsync -a --delete --exclude node_modules --exclude '.env*' --exclude .git --exclude qa --exclude dist --exclude docs --exclude extension --exclude test-data --exclude Library --exclude '*.log' $WT/ $COPY/
ln -sfn /Users/rahulsinha/ResumeIQ/node_modules $COPY/node_modules
KEY=$(grep -h -E "^$KEYNAME=" $WT/.env.local $WT/.env 2>/dev/null | grep -v "=$" | head -1 | cut -d= -f2-)
[ -z "$KEY" ] && { echo "no $KEYNAME available"; exit 1; }
cd $COPY
env -i PATH="$PATH" HOME="$COPY" PORT=$API QA_CORPUS_DIR="$BASE/corpus" QA_LLM_CAP=${QA_LLM_CAP:-50} $KEYNAME="$KEY" node --import $WT/qa/llm/record.mjs server/index.js > $BASE/server.log 2>&1 &
echo $! > $BASE/server.pid
env -i PATH="$PATH" HOME="$COPY" VITE_API_URL=http://127.0.0.1:$API VITE_SUPABASE_URL=https://qafake.supabase.co VITE_SUPABASE_ANON_KEY=fake-anon npx vite --port $WEB --strictPort --host 127.0.0.1 > $BASE/vite.log 2>&1 &
echo $! > $BASE/vite.pid
for i in {1..40}; do
  a=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$API/api/health); w=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$WEB/app/editor)
  [ "$a" = 200 -a "$w" = 200 ] && { echo "READY  app: http://127.0.0.1:$WEB/app/editor   api: http://127.0.0.1:$API   (model-call cap ${QA_LLM_CAP:-50})"; exit 0; }
  sleep 1
done
echo "NOT READY (api=$a web=$w) - see $BASE/server.log and $BASE/vite.log"; exit 1
