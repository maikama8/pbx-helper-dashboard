export interface Tip {
  id: string;
  symptom: string;
  lookAt: string[];
}

/** Notes for one-way audio, a 30-second teardown, codecs, and qualify flaps. Text only. */
export function natAndCodecTips(): Tip[] {
  return [
    {
      id: "one-way",
      symptom: "One-way audio: the caller hears the agent, or the other way around, and the call stays up.",
      lookAt: [
        "On a PJSIP trunk behind NAT set direct_media=no, rtp_symmetric=yes, force_rport=yes, and rewrite_contact=yes.",
        "Set external_media_address and external_signaling_address on the transport to the public IP, and local_net to the private LAN.",
        "Forward the UDP range in rtp.conf (rtpstart to rtpend) to the PBX. Signalling on 5060 is not enough.",
        "pjsip set logger on, then place one call. The c= line in SDP should be the public address, not 192.168.x or 10.x, when the far end is outside.",
      ],
    },
    {
      id: "no-audio",
      symptom: "The call connects and neither side hears anything.",
      lookAt: [
        "rtp set debug on and confirm packets leave and come back. If only one direction shows up, it is a firewall or a wrong SDP address, not a codec.",
        "A carrier that sends media from a different IP than signalling needs rtp_symmetric=yes. Locking media to the signalling address drops it.",
        "If both sides offer incompatible codecs, Asterisk logs 'no compatible codecs'. Allow ulaw and alaw on the trunk before anything else.",
      ],
    },
    {
      id: "thirty",
      symptom: "Calls die at about 30 seconds.",
      lookAt: [
        "ACK never reached the far end, so it tears the call down. That is almost always a wrong Contact or a NAT rewrite problem, not a timer you should raise.",
        "Check external_signaling_address and that the registration's contact is the address the carrier can reach.",
        "An ALG on the router rewriting SIP while Asterisk also rewrites it will corrupt the Contact. Disable the ALG.",
      ],
    },
    {
      id: "codec",
      symptom: "A carrier rejects the call, or audio is distorted, and the log mentions codecs.",
      lookAt: [
        "Offer ulaw (PCMU) and alaw (PCMA) first. They are the safe baseline for SIP trunks.",
        "G.722 is fine between phones on a LAN. Many carriers do not accept it on the trunk.",
        "G.729 needs a licensed codec module. Do not copy an unlicensed g729 binary onto the server. If the carrier requires it, buy the license or ask them to allow ulaw.",
        "disallow=all then allow= the codecs you mean. A long allow list makes the INVITE look like a scanner to some carriers.",
      ],
    },
    {
      id: "qualify",
      symptom: "A trunk flaps between registered, lagged, and unreachable.",
      lookAt: [
        "qualify_frequency sends OPTIONS. A high round trip on a busy link marks the peer lagged. That is a warning, not a failed registration.",
        "If OPTIONS is blocked by the carrier, turn qualify off for that trunk or the peer will look dead while calls still work.",
        "Registration expiry shorter than the carrier's contact expiry causes a second of unregistered between refreshes. Match their requested expiry.",
      ],
    },
  ];
}
