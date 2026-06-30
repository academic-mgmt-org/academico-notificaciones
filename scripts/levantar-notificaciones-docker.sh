#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_DEFAULT="guical96/academico-notificaciones:latest"
PORT_DEFAULT="3003"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env"
ENV_EXAMPLE="${PROJECT_DIR}/.env.example"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yml"
START_SERVICE=true

usage() {
  cat <<EOF
Uso:
  ./scripts/levantar-notificaciones-docker.sh [opcion]

Opciones:
  --pull-only   Instala Docker si hace falta y descarga la imagen sin levantar el servicio.
  -h, --help    Muestra esta ayuda.
EOF
}

log() {
  printf '[academico-notificaciones] %s\n' "$1"
}

die() {
  printf '[academico-notificaciones] ERROR: %s\n' "$1" >&2
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --pull-only)
      START_SERVICE=false
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      die "Opcion no soportada: ${arg}"
      ;;
  esac
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
  die "No se encontro docker-compose.yml en ${PROJECT_DIR}"
fi

SUDO_CMD=()
if [[ "${EUID}" -ne 0 && "$(command -v sudo || true)" ]]; then
  SUDO_CMD=(sudo)
fi

require_privileges() {
  if [[ "${EUID}" -ne 0 && ${#SUDO_CMD[@]} -eq 0 ]]; then
    die "Ejecuta el script como root o instala sudo."
  fi
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    "${SUDO_CMD[@]}" docker "$@"
  fi
}

install_docker_apt() {
  require_privileges

  # shellcheck disable=SC1091
  . /etc/os-release

  local docker_repo_id="${ID}"
  local docker_codename="${VERSION_CODENAME:-}"

  if [[ "$docker_repo_id" == "linuxmint" || "$docker_repo_id" == "pop" ]]; then
    docker_repo_id="ubuntu"
  fi

  if [[ -z "$docker_codename" && -r /etc/lsb-release ]]; then
    # shellcheck disable=SC1091
    . /etc/lsb-release
    docker_codename="${DISTRIB_CODENAME:-}"
  fi

  [[ -n "$docker_codename" ]] || die "No se pudo determinar el codename de la distribucion."

  log "Instalando dependencias de Docker con apt..."
  "${SUDO_CMD[@]}" apt-get update
  "${SUDO_CMD[@]}" apt-get install -y ca-certificates curl gnupg
  "${SUDO_CMD[@]}" install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL "https://download.docker.com/linux/${docker_repo_id}/gpg" \
      | "${SUDO_CMD[@]}" gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    "${SUDO_CMD[@]}" chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${docker_repo_id} ${docker_codename} stable" \
    | "${SUDO_CMD[@]}" tee /etc/apt/sources.list.d/docker.list >/dev/null

  "${SUDO_CMD[@]}" apt-get update
  "${SUDO_CMD[@]}" apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_dnf() {
  require_privileges

  # shellcheck disable=SC1091
  . /etc/os-release

  local repo_url="https://download.docker.com/linux/fedora/docker-ce.repo"
  if [[ "$ID" == "centos" || "$ID" == "rhel" || "$ID" == "rocky" || "$ID" == "almalinux" ]]; then
    repo_url="https://download.docker.com/linux/centos/docker-ce.repo"
  fi

  log "Instalando Docker con dnf..."
  "${SUDO_CMD[@]}" dnf -y install dnf-plugins-core
  "${SUDO_CMD[@]}" dnf config-manager --add-repo "$repo_url"
  "${SUDO_CMD[@]}" dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_yum() {
  require_privileges

  log "Instalando Docker con yum..."
  "${SUDO_CMD[@]}" yum -y install yum-utils
  "${SUDO_CMD[@]}" yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  "${SUDO_CMD[@]}" yum -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_pacman() {
  require_privileges

  log "Instalando Docker con pacman..."
  "${SUDO_CMD[@]}" pacman -Sy --noconfirm docker docker-compose
}

install_docker_if_needed() {
  if command -v docker >/dev/null 2>&1 && docker_cmd compose version >/dev/null 2>&1; then
    log "Docker y Docker Compose ya estan instalados."
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    install_docker_apt
  elif command -v dnf >/dev/null 2>&1; then
    install_docker_dnf
  elif command -v yum >/dev/null 2>&1; then
    install_docker_yum
  elif command -v pacman >/dev/null 2>&1; then
    install_docker_pacman
  else
    die "No se encontro un gestor soportado. Instala Docker manualmente y vuelve a ejecutar el script."
  fi
}

start_docker_daemon() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  if command -v systemctl >/dev/null 2>&1; then
    require_privileges
    log "Habilitando e iniciando el servicio Docker..."
    "${SUDO_CMD[@]}" systemctl enable --now docker || true
  fi

  docker_cmd info >/dev/null 2>&1 || die "Docker esta instalado, pero el daemon no responde."
}

read_env_value() {
  local key="$1"

  [[ -f "$ENV_FILE" ]] || return 0

  awk -F= -v key="$key" '
    $0 !~ /^[[:space:]]*#/ && $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      print value
    }
  ' "$ENV_FILE" | tail -n 1
}

set_env_if_missing_or_empty() {
  local key="$1"
  local value="$2"
  local current

  current="$(read_env_value "$key")"

  if [[ -n "$current" ]]; then
    return
  fi

  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ENV_EXAMPLE" ]]; then
      log "Creando .env desde .env.example..."
      cp "$ENV_EXAMPLE" "$ENV_FILE"
    else
      log "Creando .env vacio..."
      touch "$ENV_FILE"
    fi
  fi

  set_env_if_missing_or_empty "ACADEMICO_NOTIFICACIONES_IMAGE" "$IMAGE_DEFAULT"
  set_env_if_missing_or_empty "PORT" "$PORT_DEFAULT"
  set_env_if_missing_or_empty "NODE_ENV" "production"
  set_env_if_missing_or_empty "ENV" "production"
  set_env_if_missing_or_empty "NOTIFICACIONES_AUTO_SEED" "true"
}

validate_required_env() {
  local required_vars=(
    ACADEMICO_NOTIFICACIONES_IMAGE
    PORT
    NOTIFICACIONES_API_KEY
    JWT_DOC_SECRET
    DB_HOST
    DB_PORT
    DB_DATABASE
    DB_USER
    DB_PASSWORD
  )
  local missing=()
  local key

  for key in "${required_vars[@]}"; do
    if [[ -z "$(read_env_value "$key")" ]]; then
      missing+=("$key")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    printf '\nFaltan variables obligatorias en %s:\n' "$ENV_FILE" >&2
    printf '  - %s\n' "${missing[@]}" >&2
    printf '\nCompleta el archivo .env y vuelve a ejecutar:\n  ./scripts/levantar-notificaciones-docker.sh\n\n' >&2
    exit 2
  fi
}

install_docker_if_needed
start_docker_daemon
ensure_env_file

IMAGE="$(read_env_value ACADEMICO_NOTIFICACIONES_IMAGE)"
log "Descargando imagen ${IMAGE}..."
docker_cmd pull "$IMAGE"

if [[ "$START_SERVICE" == "false" ]]; then
  log "Imagen descargada. No se levanto el servicio por --pull-only."
  exit 0
fi

validate_required_env

log "Levantando academico-notificaciones con Docker Compose..."
cd "$PROJECT_DIR"
docker_cmd compose -f "$COMPOSE_FILE" up -d --remove-orphans

log "Estado del servicio:"
docker_cmd compose -f "$COMPOSE_FILE" ps
