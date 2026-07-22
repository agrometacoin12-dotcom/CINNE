# syntax=docker/dockerfile:1
# CinneTemple landing page — pure static site behind Caddy.
# The viewer web app is retired; cinnetemple.com is the marquee, the films
# live in the iOS/Android apps and CinneTemple Studio on Windows.
FROM caddy:2-alpine
COPY apps/landing/Caddyfile /etc/caddy/Caddyfile
COPY apps/landing/site /srv
