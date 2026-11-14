export interface CheckItem {
  id: string;
  area: "AMI" | "SIP" | "Billing" | "Database" | "Host";
  title: string;
  why: string;
  check: string;
}

/** Operator checklist for a PBX the reader already administers. Nothing here is a probe of someone else's host. */
export function securityChecklist(): CheckItem[] {
  return [
    {
      id: "ami-bind",
      area: "AMI",
      title: "Manager is not listening on the public internet",
      why: "AMI is a control channel. A reachable port 5038 is a full compromise of the switch if the secret leaks.",
      check: "On the PBX, ss -lnt | grep 5038. bindaddr in manager.conf should be a private address, or the port should be firewalled to the dashboard host.",
    },
    {
      id: "ami-permit",
      area: "AMI",
      title: "The manager user permit is the dashboard, not 0.0.0.0/0",
      why: "deny/permit is the second factor after the secret. A stolen secret from a laptop should not work from anywhere.",
      check: "In manager.conf, deny=0.0.0.0/0.0.0.0 and permit=<dashboard>/255.255.255.255. See docs/manager.conf.",
    },
    {
      id: "ami-write",
      area: "AMI",
      title: "Write classes are only what hangup needs",
      why: "write=command or write=originate lets the dashboard place calls and run CLI commands.",
      check: "read=system,call,reporting,agent and write=call are enough for Span. Drop command, originate, and all.",
    },
    {
      id: "ami-tls",
      area: "AMI",
      title: "AMI across a network is TLS, or it stays on localhost",
      why: "The manager secret and caller IDs travel in cleartext on a plain TCP session.",
      check: "Use tlsenable=yes and a real certificate, or an SSH tunnel. Do not put the secret in a world-readable unit file.",
    },
    {
      id: "sip-guest",
      area: "SIP",
      title: "Anonymous and guest calls are off",
      why: "An open guest context is how a PBX becomes an open relay.",
      check: "pjsip.conf: no endpoint with context that can dial out and auth disabled. chan_sip: allowguest=no and alwaysauthreject=yes.",
    },
    {
      id: "sip-secret",
      area: "SIP",
      title: "Endpoint secrets are long and unique",
      why: "Short SIP passwords are guessed by scanners within minutes. One shared secret across extensions means one leak is every phone.",
      check: "At least 16 random characters per endpoint. fail2ban's asterisk jail should already be watching /var/log/asterisk/security or the messages log.",
    },
    {
      id: "fail2ban",
      area: "Host",
      title: "fail2ban is banning SIP and AMI scanners",
      why: "Registration storms will fill the log and, on a weak secret, succeed.",
      check: "fail2ban-client status asterisk. The jail should match 'Wrong password' and 'failed for' from the Asterisk security log, and ban for at least an hour.",
    },
    {
      id: "rtp",
      area: "SIP",
      title: "The RTP range is the one your firewall forwards",
      why: "Signalling on 5060 with media on a closed range is one-way or no audio, and it looks like a codec problem.",
      check: "rtp.conf rtpstart/rtpend matches the UDP forward. direct_media=no on trunks behind NAT so media stays on the PBX.",
    },
    {
      id: "magnus-key",
      area: "Billing",
      title: "The MagnusBilling API key can refill, so treat it like a wallet",
      why: "refill/save adds credit. A key in a git repo or a ticket spends the customer's balance.",
      check: "Keep MAGNUS_API_SECRET in the environment, not in the image. Restrict the key's IP in Magnus if the panel allows it. Prefer the viewer role for people who only look.",
    },
    {
      id: "cdr-user",
      area: "Database",
      title: "The CDR user is SELECT on asteriskcdrdb only",
      why: "The dashboard does not need to write CDRs, and it must not be able to read the rest of the FreePBX database.",
      check: "SHOW GRANTS FOR 'span_cdr'. You want SELECT on asteriskcdrdb.cdr and asteriskcdrdb.cel, and nothing else. See docs/freepbx.md.",
    },
    {
      id: "dashboard-auth",
      area: "Host",
      title: "Demo passwords and the session secret are changed",
      why: "span-demo-admin is in the README. It is fine on a laptop and a liability on a server.",
      check: "Set ADMIN_PASSWORD, VIEWER_PASSWORD, and SESSION_SECRET. Put the process behind HTTPS and set COOKIE_SECURE=1.",
    },
    {
      id: "ari",
      area: "AMI",
      title: "ARI, if you use it for hangup, is not anonymous",
      why: "http.conf with allowed_origins=* and an empty user is remote control of every channel.",
      check: "A dedicated ARI user with a long password. Bind 8088 to localhost or the dashboard host. Do not expose the HTTP server next to SIP.",
    },
  ];
}
