# API stability

`assistant-bridge` is a 1.0 release candidate (`1.0.0-rc.*`); the public API below is the intended 1.0 surface. This page says what counts as public API, and what may change.

## Public API

Only what the package entry points export is public:

| Entry                                      | For                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| `assistant-bridge`                         | Hosts without a framework                               |
| `assistant-bridge/react`                   | React hosts (`AssistantHost`)                           |
| `assistant-bridge/chat`                    | Chats without a framework                               |
| `assistant-bridge/chat/react`              | React chats (hooks)                                     |
| `assistant-bridge/contracts`               | The wire contract: schemas, names, error codes          |
| `assistant-bridge/testing`                 | Host tests (`connectTestAssistant`)                     |
| `assistant-bridge/transports/message-port` | Communication over an application-supplied private port |

Also public: the documented fields and methods of the returned objects (`HostIntegration`, `AssistantBridgeClient`, `useAssistantHost()`), the error codes and their meaning, and the wire protocol described by `PROTOCOL_VERSION`.

Not public, even when reachable at runtime:

- deep imports such as `assistant-bridge/dist/...`;
- fields of an integration that its type does not declare (the bridge, context store and action registry);
- undocumented behavior, log and diagnostic message text, and the timeline's `payloadSummary`.

## Two versions

- **Package version** (`package.json`): the JavaScript API.
- **Protocol version** (`PROTOCOL_VERSION`): the messages between host and assistant. Peers with the same MAJOR are compatible, and the handshake refuses others. See [protocol versions](core.md#protocol-versions).

They change independently. A package release can keep the protocol, and a host and an assistant built with different package versions work together as long as their protocol MAJOR matches.

## Before 1.0

- Any beta release may change the public API. Breaking changes are marked **Breaking** in the [CHANGELOG](../CHANGELOG.md), with what to use instead.
- Pin an exact version (`assistant-bridge@1.0.0-rc.1`, not `^`), and read the CHANGELOG before upgrading.
- npm `latest` points at the newest beta until 1.0, so `npm install assistant-bridge` gets it. From 1.0, `latest` is the newest stable release and prereleases go to `beta`.
- A protocol change that is breaking raises the protocol MAJOR in the same release, so mixed deployments fail at the handshake instead of misbehaving.

## From 1.0

Semantic versioning for the package:

- **MAJOR:** removing or changing public API, or raising the protocol MAJOR.
- **MINOR:** additions (new exports, options, commands or actions) and protocol MINOR changes.
- **PATCH:** fixes that keep the public API and the protocol.

Deprecated APIs stay for at least one MINOR release, marked `@deprecated` with the replacement, before they are removed in the next MAJOR.
