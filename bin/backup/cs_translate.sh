PORT=$(ss -tlnp | grep cs2 | awk '{print $4}' | grep -oP '127\.0\.0\.1:\K[0-9]+' | head -1)
if [ -z "$PORT" ]; then
  echo "No CS2 netcon port found"
  exit 1
fi
echo "Detected port: $PORT"
node /m/cs_translate/bin/cs_translate.js --set-netcon-port $PORT
node /m/cs_translate/bin/cs_translate.js
