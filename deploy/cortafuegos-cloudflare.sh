#!/usr/bin/env bash
# Cortafuegos del VPS: 80 y 443 solo desde Cloudflare, 22 abierto (#169).
#
# Antes, deploy/README.md §8 abría 'Nginx Full' a todo Internet. Con eso
# cualquiera podía hablar con nginx directamente en la IP del droplet,
# saltándose Cloudflare. nginx ya no se cree un CF-Connecting-IP que no
# venga de Cloudflare (deploy/nginx-cloudflare.conf), pero cerrar la
# puerta es la segunda capa: lo que no llega no hay que filtrarlo.
#
# Los rangos se leen del MISMO archivo que usa nginx, para que el
# cortafuegos y nginx no discrepen nunca.
#
# Uso, como root en el VPS, DESPUÉS de instalar el snippet de nginx:
#
#   bash /var/www/mercamaquinarias/deploy/cortafuegos-cloudflare.sh --comprobar
#   bash /var/www/mercamaquinarias/deploy/cortafuegos-cloudflare.sh
#
# --comprobar no toca nada: compara la copia de los rangos con la que
# publica Cloudflare hoy y enseña las reglas actuales.
#
# El puerto 22 se abre ANTES que nada y el script se para si no queda
# abierto: cortarse el SSH obligaría a entrar por la consola web de
# DigitalOcean. Es idempotente: repetirlo no duplica reglas.

set -euo pipefail

RANGOS=${RANGOS:-/etc/nginx/snippets/cloudflare.conf}

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: hay que correrlo como root" >&2
  exit 1
fi

if [[ ! -r "$RANGOS" ]]; then
  echo "ERROR: no encuentro $RANGOS. Instala antes deploy/nginx-cloudflare.conf ahí." >&2
  exit 1
fi

mapfile -t LISTA < <(awk '$1 == "set_real_ip_from" { sub(/;$/, "", $2); print $2 }' "$RANGOS")
if (( ${#LISTA[@]} < 10 )); then
  echo "ERROR: solo hay ${#LISTA[@]} rangos en $RANGOS; algo va mal, no toco nada" >&2
  exit 1
fi

if [[ "${1:-}" == "--comprobar" ]]; then
  publicados=$( { curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; echo; } | sed '/^$/d' | sort)
  copiados=$(printf '%s\n' "${LISTA[@]}" | sort)
  if [[ "$publicados" == "$copiados" ]]; then
    echo "Los ${#LISTA[@]} rangos de $RANGOS coinciden con los que publica Cloudflare."
  else
    echo "AVISO: la copia de los rangos NO coincide con la de Cloudflare (< publicados, > copiados):"
    diff <(echo "$publicados") <(echo "$copiados") || true
  fi
  echo
  ufw status verbose
  exit 0
fi

# 1. SSH primero, y comprobado.
ufw allow 22/tcp
if ! ufw show added | grep -Eq 'allow (22/tcp|OpenSSH)'; then
  echo "ERROR: no consigo dejar abierto el 22; me paro sin tocar nada más" >&2
  exit 1
fi

# 2. Los rangos de Cloudflare, antes de quitar la regla abierta: así no
#    hay ni un momento en que el sitio quede sin entrada.
for rango in "${LISTA[@]}"; do
  ufw allow proto tcp from "$rango" to any port 80,443 comment 'Cloudflare'
done

# 3. Quitar lo que abría 80/443 a todo Internet. Cada uno puede no
#    existir; eso no es un error.
for regla in 'Nginx Full' 'Nginx HTTP' 'Nginx HTTPS' '80' '443' '80/tcp' '443/tcp'; do
  ufw delete allow "$regla" >/dev/null 2>&1 || true
done

# 4. Encender si estaba apagado (si ya lo estaba, solo recarga).
if ufw status | grep -q 'Status: inactive'; then
  ufw --force enable
else
  ufw reload
fi

ufw status verbose
