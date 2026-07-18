#!/bin/sh
# Der Postgres-Entrypoint führt nur DATEIEN in /docker-entrypoint-initdb.d aus,
# Unterverzeichnisse werden ignoriert ("ignoring /docker-entrypoint-initdb.d/02-tables").
# Dieses Skript wird als 04-run-dirs.sh gemountet und führt die SQL-Dateien
# aus den Verzeichnissen in definierter Reihenfolge aus.
set -e

for f in /docker-entrypoint-initdb.d/02-tables/*.sql /docker-entrypoint-initdb.d/03-functions/*.sql; do
  echo "run-dirs.sh: executing $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
