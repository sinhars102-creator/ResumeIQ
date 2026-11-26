#!/bin/zsh
# Starts the isolated copy: real API server (only the LLM key in env) on 5611, vite dev on 5612.
WT=/Users/rahulsinha/ResumeIQ/sidebar-event
COPY=/private/tmp/claude-501/-Users-rahulsinha-ResumeIQ-job-board-test/38e6da36-8cc3-4f87-ba00-e52edeb66a49/scratchpad/copy
KEYNAME=${1:-ANTHROPIC_API_KEY}
KEY=$(grep -h -E "^$KEYNAME=" $WT/.env.local $WT/.env | grep -v "=$" | head -1 | cut -d= -f2-)
[ -z "$KEY" ] && { echo "no $KEYNAME"; exit 1; }
cd $COPY
env -i PATH="$PATH" HOME="$COPY" PORT=5611 QA_CORPUS_DIR="$2" QA_LLM_CAP=80 $KEYNAME="$KEY" node --import $WT/qa/llm/record.mjs server/index.js > $COPY/server.log 2>&1 &
echo $! > $COPY/server.pid
env -i PATH="$PATH" HOME="$COPY" VITE_API_URL=http://127.0.0.1:5611 VITE_SUPABASE_URL=https://qafake.supabase.co VITE_SUPABASE_ANON_KEY=fake-anon npx vite --port 5612 --strictPort --host 127.0.0.1 > $COPY/vite.log 2>&1 &
echo $! > $COPY/vite.pid
