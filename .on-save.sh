#!/bin/bash

currentPath=$(pwd)

cd ~/mediawiki-services-mobileapps/
PID=`ps -eaf | grep service-runner | grep -v grep | awk '{print $2}'`
if [[ "" !=  "$PID" ]]; then
  echo "killing $PID"
  kill -15 $PID
fi

npm start -loglevel silent

osascript -e 'tell application "Safari" to activate'
osascript -e 'tell application "Safari" to open ("'"$currentPath"'/.on-save.html" as POSIX file)'
