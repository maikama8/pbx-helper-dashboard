# Asterisk AMI and ARI

Span uses AMI for the live board: channels, peer and endpoint status, trunk registration, and queue summaries. Hangup is `Action: Hangup` on that same socket, unless `ARI_URL` is set, in which case hangup is `DELETE /ari/channels/{id}` and AMI is the fallback.

The manager session is cleartext unless you turn on TLS. Do not publish port 5038.

## Manager user

A copy-paste user is in [manager.conf](manager.conf). The lab container mounts [../deploy/asterisk/manager.conf](../deploy/asterisk/manager.conf) and is not started unless you ask for the `lab` profile.

```ini
[span]
secret = replace-this
deny = 0.0.0.0/0.0.0.0
permit = 203.0.113.10/255.255.255.255
read = system,call,log,verbose,agent,user,reporting,cdr,dialplan
write = call
```

`permit` is the dashboard host, not the internet. `write = call` is what `Hangup` needs. It is not `originate` and it is not `command`. Drop `write` entirely if this install should only watch.

`CoreShowChannels`, `SIPpeers`, `PJSIPShowEndpoints`, and `SIPshowregistry` are read classes. `QueueStatus` needs the `agent` read class. A PJSIP-only box returns an error for `SIPpeers`; Span logs that and continues. A chan_sip box does the same for `PJSIPShowEndpoints`.

Reload with `manager reload`. From the dashboard host:

```text
AMI_HOST=203.0.113.5
AMI_SECRET=replace-this
SOURCE=live
```

Span logs in, asks for the snapshots above, and then follows `Newchannel`, `Newstate`, `Hangup`, `PeerStatus`, `ContactStatus`, `Registry`, and `QueueParams`. It reconnects on its own. A failed login does not stop the HTTP server; `/api/health` reports `degraded` and the warning.

## What AMI does not know

AMI does not know a customer's balance or the rate that was sold. Those come from MagnusBilling. FreePBX GraphQL is the extension and trunk inventory when you are not on Magnus. Registration status from AMI replaces the inventory status when the trunk name matches.

Caller ID and account code are whatever the dialplan set. If `AccountCode` is empty, the live call has no customer.

## ARI

ARI is optional and only used for hangup.

```ini
[general]
enabled = yes
pretty = yes
allowed_origins = http://127.0.0.1:8080

[span]
type = user
read_only = no
password = replace-this
```

`read_only = no` is required for `DELETE`. Bind HTTP to localhost or to the dashboard, and do not leave `allowed_origins` as `*`.

```text
ARI_URL=http://127.0.0.1:8088
ARI_USERNAME=span
ARI_PASSWORD=replace-this
```

The channel id Span sends is the Asterisk `uniqueid`, which is the id ARI uses. A 404 means the channel already ended. Span treats that as a successful hangup.

## Queues

`QueueParams` supplies waiting, completed, abandoned, hold time, talk time, and `ServicelevelPerf`. Span shows that service level as the PBX reported it. It does not recompute it. The ASR on the overview is from CDRs, not from the queue.
