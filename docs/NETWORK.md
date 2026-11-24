# Display and LAN setup

## First display test

The tested URL on the current network is:

`http://192.168.2.190/market`

Port 80 is the preferred Smart-TV address. Port 8080 remains available as a fallback at `http://192.168.2.190:8080/market`.

The default is a scroll-free 16:9 kiosk layout. Display tuning is done entirely through query parameters, so each television may keep its own bookmark:

| Parameter | Values | Default | Purpose |
|---|---|---|---|
| `format` | `16:9`, `21:9`, `4:3`, `9:16`, `auto` | `16:9` | Aspect-specific spacing and type sizing |
| `columns` | `1`–`6` | `3` for 16:9 | Number of category columns |
| `scale` | `75`–`140` | `100` | Text and component scale in percent |
| `overscan` | `0`–`8` | `2` | Safe margin in `vmin` for TVs that crop edges |
| `category` | category name | all | Show only one category, for example `Bier` |
| `charts` | `1` or `0` | `1` | Show or hide price charts |
| `ticker` | `1` or `0` | `0` | Show the optional compact price strip |
| `focus` | `1` or `0` | `1` | Show or hide the highlighted product |
| `refresh` | `2`–`60` | `5` | API refresh interval in seconds |

Examples:

```text
http://192.168.2.190/market?format=16:9&columns=3&scale=100&overscan=2
http://192.168.2.190/market?format=21:9&columns=3&scale=95
http://192.168.2.190/market?format=4:3&columns=2&charts=0
http://192.168.2.190/market?format=9:16&columns=1&ticker=0
http://192.168.2.190/market?category=Bier&scale=125
```

The page itself contains no controls and cannot force the browser into operating-system kiosk mode. Configure the display browser to start full-screen with its assigned URL; hide the browser UI and disable sleep, notifications, automatic translation, and page zoom. Test the actual panel because consumer TVs may apply overscan even at 1920×1080.

The address is valid only while this Mac keeps `192.168.2.190`. Reserve that address in the router before event use. A display must be on the same private network and must be allowed to reach other clients.

```sh
npm run build
npm run proxy:up
curl http://127.0.0.1:8080/network-check
curl http://127.0.0.1:8080/api/v1/operations/health
```

The API must already be running. `docker compose ps` should show `boersenparty-lan-proxy` as healthy. Stop the proxy with `npm run proxy:down`; inspect it with `npm run proxy:logs`.

## Network boundary

- The NestJS API listens only on `127.0.0.1:3000`.
- Nginx is the only LAN-facing process and exposes TCP ports `80` and `8080`; use port 80 for Smart TVs.
- Browser and API use one origin, so displays never need direct access to port 3000.
- Do not configure internet port forwarding or expose port 8080 on a public or guest network.
- Use a dedicated WPA2/WPA3 staff LAN. Disable guest/client isolation only for the staff VLAN that contains the server, terminals, and displays.
- If a host firewall is enabled, allow inbound TCP 80 and 8080 only from that staff subnet. Leave port 3000 blocked.
- The API trusts forwarded client addresses only from loopback, link-local, and private ranges. Do not place an untrusted proxy in front of it.

## Device configuration

The public display uses `/market`. Android NFC terminals use `/` and currently point to `http://192.168.2.190:8080/` at build time. Rebuild and sign the APK whenever the reserved server address changes. Test both bars, the top-up station, and the display after every network or APK change.

The display is intentionally read-only and refreshes prices every five seconds. In `NORMAL`, the server creates a new demand-based price version every 60 seconds by default; `MARKET_TICK_INTERVAL_MS` may be changed, but never below 10 seconds. `PAYMENT_STOP` on the display is the expected safe state until the formal go/no-go and two-person activation procedure are complete. No automatic price versions are created outside `NORMAL`.

## Failure handling

If the display loses contact, do not infer that the API or prices are healthy. For display-only problems use `PRICE_FROZEN`; for any uncertainty about API, database, router, or transaction results use `PAYMENT_STOP`. The system has no offline debit mode.
