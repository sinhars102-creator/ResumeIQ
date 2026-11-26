#!/bin/zsh
# Usage: stop.sh <name>   Stops only that persona's own two servers.
BASE=/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas/$1
for f in server.pid vite.pid; do [ -f $BASE/$f ] && kill $(cat $BASE/$f) 2>/dev/null && rm -f $BASE/$f; done
echo "stopped $1"
