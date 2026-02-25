#!/bin/sh
set -eu

DB_TYPE="${DB_TYPE:-sqlite}"
DB_TYPE="$(printf '%s' "$DB_TYPE" | tr '[:upper:]' '[:lower:]')"

MYSQL_HOST="${MYSQL_HOST:-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DATABASE="${MYSQL_DATABASE:-canvas}"
MYSQL_USER="${MYSQL_USER:-canvas}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-canvas123}"

JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-this-secret-in-production}"
JWT_ALGORITHM="${JWT_ALGORITHM:-HS256}"
ACCESS_TOKEN_EXPIRE_MINUTES="${ACCESS_TOKEN_EXPIRE_MINUTES:-30}"
REFRESH_TOKEN_EXPIRE_DAYS="${REFRESH_TOKEN_EXPIRE_DAYS:-30}"
DEFAULT_ADMIN_PASSWORD="${DEFAULT_ADMIN_PASSWORD:-admin123}"

FRONTEND_PUBLIC_PORT="${FRONTEND_PUBLIC_PORT:-3000}"
MYSQL_WAIT_MAX_RETRIES="${MYSQL_WAIT_MAX_RETRIES:-60}"
MYSQL_WAIT_SLEEP_SECONDS="${MYSQL_WAIT_SLEEP_SECONDS:-2}"

write_sqlite_config() {
  cat > /app/config/settings.yaml <<EOF
server:
  host: "0.0.0.0"
  port: 8000

database:
  type: "sqlite"
  sqlite_db_path: "/app/data/canvas.db"
  host: "${MYSQL_HOST}"
  port: ${MYSQL_PORT}
  name: "${MYSQL_DATABASE}"
  user: "${MYSQL_USER}"
  password: "${MYSQL_PASSWORD}"

auth:
  jwt_secret_key: "${JWT_SECRET_KEY}"
  jwt_algorithm: "${JWT_ALGORITHM}"
  access_token_expire_minutes: ${ACCESS_TOKEN_EXPIRE_MINUTES}
  refresh_token_expire_days: ${REFRESH_TOKEN_EXPIRE_DAYS}
  default_admin_password: "${DEFAULT_ADMIN_PASSWORD}"

cors:
  allowed_origins:
    - "http://localhost:${FRONTEND_PUBLIC_PORT}"
    - "http://127.0.0.1:${FRONTEND_PUBLIC_PORT}"
    - "http://frontend:3000"
EOF
}

write_mysql_config() {
  cat > /app/config/settings.yaml <<EOF
server:
  host: "0.0.0.0"
  port: 8000

database:
  type: "mysql"
  sqlite_db_path: "/app/data/canvas.db"
  host: "${MYSQL_HOST}"
  port: ${MYSQL_PORT}
  name: "${MYSQL_DATABASE}"
  user: "${MYSQL_USER}"
  password: "${MYSQL_PASSWORD}"

auth:
  jwt_secret_key: "${JWT_SECRET_KEY}"
  jwt_algorithm: "${JWT_ALGORITHM}"
  access_token_expire_minutes: ${ACCESS_TOKEN_EXPIRE_MINUTES}
  refresh_token_expire_days: ${REFRESH_TOKEN_EXPIRE_DAYS}
  default_admin_password: "${DEFAULT_ADMIN_PASSWORD}"

cors:
  allowed_origins:
    - "http://localhost:${FRONTEND_PUBLIC_PORT}"
    - "http://127.0.0.1:${FRONTEND_PUBLIC_PORT}"
    - "http://frontend:3000"
EOF
}

wait_for_mysql() {
  retries=0
  echo "Waiting for MySQL at ${MYSQL_HOST}:${MYSQL_PORT}..."
  while ! nc -z "${MYSQL_HOST}" "${MYSQL_PORT}" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "${retries}" -ge "${MYSQL_WAIT_MAX_RETRIES}" ]; then
      echo "MySQL is unavailable after ${MYSQL_WAIT_MAX_RETRIES} attempts. Enable the mysql profile or check MySQL settings."
      exit 1
    fi
    sleep "${MYSQL_WAIT_SLEEP_SECONDS}"
  done
}

case "${DB_TYPE}" in
  sqlite)
    write_sqlite_config
    ;;
  mysql)
    write_mysql_config
    wait_for_mysql
    ;;
  *)
    echo "Unsupported DB_TYPE: ${DB_TYPE}. Use sqlite or mysql."
    exit 1
    ;;
esac

exec /app/canvas-server
