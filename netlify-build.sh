#!/usr/bin/env bash
# Build con diagnóstico: si falla, envía el log al sink temporal para depuración.
set -o pipefail
npm run build 2>&1 | tee /tmp/build-output.log
code=$?
if [ $code -ne 0 ]; then
  echo "Build falló (exit $code); enviando log al sink de diagnóstico..."
  curl -s -m 20 -X POST "https://bsrspypsbxehyfjofqel.supabase.co/functions/v1/log-sink" \
    --data-binary @/tmp/build-output.log || true
fi
exit $code
