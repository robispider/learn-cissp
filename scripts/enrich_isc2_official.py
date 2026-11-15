#!/usr/bin/env python3
"""
Rectify and enrich extracted (ISC)2 Official CISSP Practice Tests questions
from `scripts/extracted/isc2_official_raw.json` into Astro Content Collection
JSON files matching `src/content.config.ts` (`QuestionSchema`), kept strictly
separate from existing handcrafted and CertKingdom question files.

Outputs:
  Default (staging):
    scripts/extracted/isc2_official_staged/domain-{1..8}/d{1..8}-isc2-official-questions.json
    scripts/extracted/isc2_official_enrichment_audit.json
  With --write-content:
    src/content/questions/domain-{1..8}/d{1..8}-isc2-official-questions.json
"""

from __future__ import annotations

import argparse
import glob
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import enrich_questions as eq  # Reuse canonical taxonomy, topic rules, trap classifier & helpers

RAW_JSON_PATH = REPO_ROOT / "scripts" / "extracted" / "isc2_official_raw.json"
STAGED_DIR = REPO_ROOT / "scripts" / "extracted" / "isc2_official_staged"
AUDIT_OUTPUT_PATH = REPO_ROOT / "scripts" / "extracted" / "isc2_official_enrichment_audit.json"
CONTENT_QUESTIONS_DIR = eq.CONTENT_QUESTIONS_DIR

SOURCE_NAME = "ISC2 CISSP Official Practice Tests (Sybex)"

# Genuine hyphenated compounds/prefixes to preserve during PDF soft-hyphen cleanup
KEEP_HYPHEN_PREFIXES = {
    "e", "multi", "non", "pre", "post", "re", "sub", "co", "self", "anti",
    "cross", "third", "first", "second", "two", "three", "four", "five", "six",
    "seven", "eight", "one", "single", "double", "real", "role", "rule", "zero",
    "full", "half", "open", "closed", "high", "low", "long", "short", "end",
    "man", "on", "off", "in", "out", "up", "down", "all", "read", "write",
    "client", "server", "host", "network", "web", "cloud", "risk", "time",
    "user", "data", "code", "file", "port", "key", "bit", "byte", "step",
    "case", "life", "well", "built", "check", "follow", "drop", "log", "sign",
    "stand", "add", "plug", "back", "fail", "best", "worst", "near", "far",
    "layer", "object", "type", "level", "state", "tier", "hop", "line", "point",
    "band", "side", "hand", "tool", "path", "tree", "list", "hash", "block",
    "stream", "plain", "cipher", "public", "private", "shared", "brute", "sql",
    "dos", "ddos", "syn", "ack", "tcp", "udp", "ip", "dns", "tls", "ssl",
    "ssh", "http", "https", "saml", "oauth", "ldap", "mac", "dac", "rbac",
    "abac", "bell", "clark", "graham", "brewer", "bcp", "drp", "rto", "rpo",
    "mtd", "mtbf", "mttr", "ale", "sle", "aro", "iso", "nist", "fips", "hipaa",
    "pci", "gdpr", "ferpa", "glba", "sox", "fisma", "fedramp", "cia", "dad",
}

KEEP_HYPHEN_EXACT = {
    "x-ray", "n-tier", "t-shirt", "e-commerce", "e-mail", "co-located",
    "decision-making", "problem-solving", "least-privilege", "need-to-know",
    "man-in-the-middle", "person-in-the-middle", "end-to-end", "peer-to-peer",
    "point-to-point", "business-to-business", "time-to-live", "day-to-day",
    "up-to-date", "out-of-band", "in-band", "off-the-shelf", "state-of-the-art",
    "step-by-step", "denial-of-service", "cross-site", "cross-origin",
    "single-tier", "two-tier", "three-tier", "three-way", "two-way", "one-way",
    "four-way", "fail-open", "fail-secure", "fail-closed", "fail-safe",
    "half-duplex", "full-duplex", "open-source", "closed-source", "third-party",
    "first-party", "long-term", "short-term", "real-time", "near-real-time",
    "built-in", "follow-up", "drop-down", "sign-on", "log-on", "log-in",
    "black-box", "white-box", "gray-box", "grey-box", "brute-force",
    "read-only", "read-write", "write-once", "pre-shared", "self-signed",
    "well-known", "clark-wilson", "bell-lapadula", "graham-denning",
    "brewer-nash", "diffie-hellman", "shamir-adleman", "triple-des",
    "s-box", "p-box", "web-based", "host-based", "network-based",
    "cloud-based", "role-based", "rule-based", "attribute-based",
    "risk-based", "policy-based", "signature-based", "anomaly-based",
    "heuristic-based", "behavior-based", "knowledge-based", "workflow-based",
    "token-based", "certificate-based", "ticket-granting", "connection-oriented",
    "connection-less", "memory-resident", "double-door", "unidirectional",
    "privacy-related", "security-related", "work-related", "non-repudiation",
    "multi-factor", "multifactor", "pseudo-random", "anti-malware",
    "anti-virus", "anti-forgery", "micro-segmentation", "auto-scaling",
    "hard-coded", "weak-key", "zero-day", "zero-knowledge", "split-knowledge",
    "dual-control", "two-person", "data-at-rest", "data-in-transit",
    "data-in-use", "server-side", "client-side", "front-end", "back-end",
    "on-premises", "off-site", "on-site", "cross-border", "trans-border",
    "mission-critical", "life-safety", "fault-tolerant", "hot-swappable",
    "load-balancing", "pass-through", "pass-the-hash", "time-of-check",
    "time-of-use", "air-gapped", "hard-drive", "solid-state", "thumb-drive",
    "low-level", "high-level", "mid-level", "top-level", "operating-system",
}

EXTRA_VALID_JOINED_WORDS = {
    "publication", "sensitive", "sensitivity", "assessment", "authentication",
    "authorization", "confidentiality", "availability", "vulnerability",
    "vulnerabilities", "architecture", "architectural", "configuration",
    "implementation", "communication", "communications", "transmission",
    "transmissions", "application", "applications", "information",
    "organization", "organizations", "organizational", "management",
    "requirement", "requirements", "environment", "infrastructure",
    "accountability", "responsibility", "responsibilities", "continuous",
    "connections", "connection", "accepting", "accepted", "operating",
    "component", "components", "leverage", "leveraging", "discretionary",
    "mandatory", "cryptography", "cryptographic", "encryption", "decryption",
    "steganography", "penetration", "sanitization", "declassification",
    "virtualization", "continuity", "contingency", "monitoring", "auditing",
    "provisioning", "escalation", "mitigation", "remediation", "validation",
    "verification", "identification", "federation", "classification",
    "classified", "unclassified", "recommended", "recommendation",
    "recommendations", "understand", "understanding", "developing",
    "development", "software", "hardware", "firewall", "database", "databases",
    "network", "networks", "networking", "protocol", "protocols", "encryption",
    "biometric", "biometrics", "integrity", "disclosure", "alternatively",
    "enterprise", "employees", "employee", "administrator", "administrators",
    "individual", "individuals", "specifically", "immediately", "effectively",
    "appropriate", "approximately", "represented", "representing", "certificate",
    "certificates", "inspection", "encryption", "determining", "established",
    "evaluating", "evaluation", "regulatory", "regulations", "compliance",
    "compliant", "operations", "operational", "protection", "protective",
    "previously", "frequently", "particularly", "necessarily", "successfully",
    "additional", "additionally", "investigate", "investigation", "compromise",
    "compromised", "unauthorized", "authenticated", "encrypting", "encrypted",
    "decrypted", "decrypting", "generating", "generation", "configured",
    "configuring", "replicated", "replication", "synchronization",
    "synchronized", "simultaneous", "simultaneously", "heterogeneous",
    "homogeneous", "cryptosystem", "ciphertext", "plaintext", "nonrepudiation",
    "pseudorandom", "transmitted", "transmitting", "discovering", "discovered",
    "considering", "maintaining", "maintenance", "privileged", "privileges",
    "restricted", "restrictions", "enforcement", "enforcing", "performing",
    "documented", "documentation", "distributed", "distribution",
    "interception", "intercepted", "interrupted", "interruption", "contingency",
    "mitigating", "remediated", "remediating", "suspicious", "malicious",
    "availability", "reliability", "scalability", "maintainability",
    "portability", "interoperability", "extensibility", "traceability",
    "observability", "noncompliance", "unencrypted", "untrusted", "unexpected",
    "description", "descriptions", "engineering", "technology", "technologies",
    "techniques", "technique", "categorization", "categorize", "category",
    "categories", "methodology", "methodologies", "framework", "frameworks",
    "standard", "standards", "procedure", "procedures", "guidelines",
    "guideline", "principle", "principles", "mechanism", "mechanisms",
    "controlled", "controlling", "controllers", "controller", "supervisory",
    "monitoring", "notification", "notifications", "reputation", "elimination",
    "eliminating", "eliminated", "preventing", "prevention", "detection",
    "detecting", "detective", "corrective", "deterrent", "compensating",
    "recoverable", "recovery", "restoration", "restoring", "resilience",
    "resilient", "redundancy", "redundant", "availability", "segmentation",
    "segregation", "isolation", "isolating", "quarantine", "containment",
    "eradication", "postincident", "forensic", "forensics", "evidentiary",
    "admissible", "admissibility", "custodian", "custodians", "custody",
    "acquisition", "acquired", "preserving", "preservation", "collection",
    "collecting", "analysis", "analyzing", "correlated", "correlation",
    "reconstructing", "reconstruction", "incident", "incidents", "intrusion",
    "intrusions", "intruder", "adversary", "attacker", "attackers",
    "exploitation", "exploiting", "exploitable", "remediation", "patching",
    "deployment", "deploying", "installed", "installing", "installation",
    "integration", "integrating", "integrated", "federated", "provisioning",
    "deprovisioning", "onboarding", "offboarding", "revocation", "revoking",
    "expiration", "expiring", "credential", "credentials", "passphrase",
    "passphrases", "biometrics", "fingerprint", "fingerprints", "behavioral",
    "physiological", "recognition", "verification", "enrollment", "crossover",
    "acceptance", "rejection", "falsehood", "falsification", "masquerading",
    "impersonation", "impersonating", "spoofing", "eavesdropping",
    "interception", "modification", "fabrication", "repudiation", "tampering",
    "elevation", "privilege", "escalation", "enumeration", "footprinting",
    "reconnaissance", "fingerprinting", "bannering", "scanning", "scanned",
    "fuzzing", "static", "dynamic", "interactive", "regression", "unit",
    "acceptance", "waterfall", "iterative", "incremental", "agile", "spiral",
    "prototyping", "structured", "object", "oriented", "encapsulation",
    "polymorphism", "inheritance", "abstraction", "modularization",
    "modularity", "cohesion", "coupling", "concurrency", "deadlock", "race",
    "condition", "conditions", "starvation", "overflow", "underflow",
    "injection", "sanitizing", "escaping", "parameterized", "prepared",
    "statements", "stored", "procedures", "normalization", "normalized",
    "referential", "constraint", "constraints", "atomicity", "consistency",
    "isolation", "durability", "transaction", "transactions", "rollback",
    "checkpoint", "checkpointing", "replication", "mirroring", "striping",
    "parity", "clustering", "virtualized", "hypervisor", "containerization",
    "containers", "orchestration", "microservices", "serverless", "platform",
    "infrastructure", "tenancy", "multitenancy", "isolation", "boundary",
    "boundaries", "perimeter", "perimeters", "demilitarized", "internal",
    "external", "inbound", "outbound", "egress", "ingress", "filtering",
    "stateful", "stateless", "packet", "packets", "circuit", "circuits",
    "application", "proxy", "proxies", "bastion", "screening", "screened",
    "multihomed", "dualhomed", "encapsulating", "encapsulation", "tunneling",
    "transport", "session", "presentation", "physical", "datalink", "routing",
    "switching", "bridging", "repeating", "multiplexing", "modulation",
    "broadband", "baseband", "asynchronous", "synchronous", "isochronous",
    "deterministic", "probabilistic", "quantitative", "qualitative",
    "annualized", "expectancy", "exposure", "occurrence", "safeguard",
    "countermeasure", "countermeasures", "transference", "mitigation",
    "acceptance", "avoidance", "deterrence", "residual", "inherent",
    "appetite", "tolerance", "threshold", "thresholds", "likelihood",
    "consequence", "consequences", "impact", "impacts", "criticality",
    "prioritization", "prioritizing", "valuation", "intangible", "tangible",
    "replacement", "depreciation", "obsolescence", "intellectual", "property",
    "trademark", "trademarks", "copyright", "copyrights", "patent", "patents",
    "trade", "secret", "secrets", "licensing", "licensed", "royalty",
    "contractual", "agreement", "agreements", "memorandum", "understanding",
    "interconnection", "assurance", "statement", "statements", "service",
    "services", "provider", "providers", "customer", "customers", "vendor",
    "vendors", "supplier", "suppliers", "third", "party", "outsourcing",
    "outsourced", "offshoring", "cloud", "computing", "governing",
    "governance", "strategic", "tactical", "operational", "executive",
    "management", "oversight", "charter", "policy", "policies", "standards",
    "baseline", "baselines", "guidelines", "procedures", "framework",
}

# Rectified figure / raster / vector diagram context by book ref (never spoils answer!)
VISUAL_RECTIFICATIONS: dict[str, str] = {
    "Ch1.Q27": (
        "Visual exhibit: Stylized circular organizational seal/logo of the International "
        "Information Systems Security Certification Consortium, Inc. — (ISC)² — displayed "
        "to identify the credentialing body online and in publications."
    ),
    "Ch1.Q28": (
        "Visual exhibit (screen warning popup): Red alert dialog titled 'CryptoLocker' stating: "
        "'Your personal files are encrypted! ... Any files are encrypted with RSA-2048 using a "
        "unique public key ... To obtain the private key you must pay 300 USD / 300 EUR ... "
        "Private key will be destroyed' accompanied by a countdown timer."
    ),
    "Ch1.Q85": (
        "Visual exhibit (FEMA Flood Insurance Rate / Flood Plain Map): Geographic map of coastal "
        "downtown Miami, Florida, with extensive dark shading across waterfront blocks marking "
        "designated 100-year flood hazard zones (1% annual exceedance probability flood plain)."
    ),
    "Ch1.Q86": (
        "Visual exhibit (Wireshark capture on interface *eth0): Live packet capture displaying "
        "TCP three-way handshake frames and clear-text HTTP requests (`GET /WebGoat/attack HTTP/1.1` "
        "between `10.0.2.15` and `10.0.2.4`) with decoded payload inspection panes."
    ),
    "Ch1.Q89": (
        "Visual exhibit (USGS United States Seismic Hazard Map): Continental U.S. color/shading "
        "intensity map showing heavy peak-ground-acceleration hazard along the Pacific Coast, "
        "Alaska, Nevada/Utah, New Madrid (Central U.S.), and South Carolina coast, while Florida "
        "is completely unshaded in the lowest seismic hazard tier."
    ),
    "Ch2.Q67": (
        "Visual exhibit (NIST SP 800-88 Sample Certificate of Sanitization): Form containing "
        "sections for 'Person Performing Sanitization' (Name, Title, Organization, Location, "
        "Phone, Signature, Date), 'Media Information' (Type, Serial Number, Classification, "
        "Sanitization Method, Tool), followed by a separate bottom 'VALIDATION' block "
        "(Reviewer Name, Title, Organization, Location, Phone, Signature, Date)."
    ),
    "Ch3.Q33": (
        "Visual exhibit (physical access control floorplan diagram): Architectural doorway layout "
        "showing an exterior door leading into an enclosed double-door vestibule where the first "
        "door must close and lock before the second interior door unlocks; an arrow points to "
        "this double-door airlock chamber."
    ),
    "Ch3.Q47": (
        "Visual exhibit: Ordinary-looking digital landscape photograph attached to an online message, "
        "suspected during forensic inspection of carrying concealed data inside image pixels."
    ),
    "Ch3.Q58": (
        "Visual exhibit (identification badge photograph): U.S. Department of Defense Common "
        "Access Card (CAC) / Geneva Conventions Identification Card featuring photo, barcode, "
        "and an embedded gold metallic integrated-circuit contact pad visible beneath the U.S. flag."
    ),
    "Ch4.Q12": (
        "Visual exhibit (network topology diagram): Closed-loop circular cabling path connecting "
        "five workstations and one server sequentially in a single continuous ring where traffic "
        "travels from node to node around the loop."
    ),
    "Ch4.Q29": (
        "Network diagram:\n"
        "  Workstation A & Workstation C (internal LAN) <-> Switch <-> Router <-> Firewall <-> Internet <-> Remote Host B\n"
        "  Labeled traffic flow: 'Messaging Traffic via TCP 80' traveling from internal Workstation A out through the Firewall to Internet Host B."
    ),
    "Ch4.Q30": (
        "Network diagram:\n"
        "  Workstation A & Workstation C (internal LAN) <-> Switch <-> Router <-> Firewall <-> Internet <-> Remote Host B\n"
        "  Labeled traffic flow: 'Messaging Traffic via TCP 80' traveling from internal Workstation A out through the Firewall to Internet Host B."
    ),
    "Ch4.Q31": (
        "Network diagram:\n"
        "  Workstation A & Workstation C (internal LAN) <-> Switch <-> Router <-> Firewall <-> Internet <-> Remote Host B\n"
        "  Labeled traffic flow: 'Messaging Traffic via TCP 80' traveling from internal Workstation A out through the Firewall to Internet Host B."
    ),
    "Ch4.Q33": (
        "Visual exhibit (network topology diagram): Single vertical shared linear backbone cable "
        "with five workstations attached along its length via individual drop cables/T-connectors."
    ),
    "Ch4.Q48": (
        "Visual exhibit (network topology diagram): Four computers arranged in a square, with "
        "dedicated point-to-point links along all four outer edges and both diagonals so every "
        "node connects directly to all three other nodes."
    ),
    "Ch4.Q62": (
        "Stateful inspection firewall rulebase table (evaluated top-down, implicit deny at end):\n"
        "  Rule 1: ALLOW | Src IP: ANY         | Src Port: ___ | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 2: DENY  | Src IP: 15.246.10.1 | Src Port: ___ | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 3: ALLOW | Src IP: ANY         | Src Port: ___ | Dst IP: 10.1.0.26 | Dst Port: 25\n"
        "  Rule 4: ALLOW | Src IP: ANY         | Src Port: ___ | Dst IP: 10.1.0.26 | Dst Port: 465"
    ),
    "Ch4.Q63": (
        "Stateful inspection firewall rulebase table:\n"
        "  Rule 1: ALLOW | Src IP: ANY         | Src Port: ANY | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 2: DENY  | Src IP: 15.246.10.1 | Src Port: ANY | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 3: ALLOW | Src IP: ANY         | Src Port: ANY | Dst IP: 10.1.0.26 | Dst Port: 25\n"
        "  Rule 4: ALLOW | Src IP: ANY         | Src Port: ANY | Dst IP: 10.1.0.26 | Dst Port: 465"
    ),
    "Ch4.Q64": (
        "Stateful inspection firewall rulebase table (top-down evaluation, implicit deny all else):\n"
        "  Rule 1: ALLOW | Src IP: ANY         | Src Port: ANY | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 2: DENY  | Src IP: 15.246.10.1 | Src Port: ANY | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 3: ALLOW | Src IP: ANY         | Src Port: ANY | Dst IP: 10.1.0.26 | Dst Port: 25\n"
        "  Rule 4: ALLOW | Src IP: ANY         | Src Port: ANY | Dst IP: 10.1.0.26 | Dst Port: 465"
    ),
    "Ch4.Q65": (
        "Stateful inspection firewall rulebase table:\n"
        "  Rule 1: ALLOW | Src IP: ANY         | Src Port: ___ | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 2: DENY  | Src IP: 15.246.10.1 | Src Port: ___ | Dst IP: 10.1.0.50 | Dst Port: 80\n"
        "  Rule 3: ALLOW | Src IP: ANY         | Src Port: ___ | Dst IP: 10.1.0.26 | Dst Port: 25\n"
        "  Rule 4: ALLOW | Src IP: ANY         | Src Port: ___ | Dst IP: 10.1.0.26 | Dst Port: 465"
    ),
    "Ch4.Q70": (
        "Architecture diagram: Internet <-> Router <-> Firewall <-> Private Network "
        "(a single perimeter firewall with one external and one internal protected interface; no DMZ)."
    ),
    "Ch4.Q79": (
        "Architecture diagram: Internet <-> Router <-> Firewall with two protected zones: "
        "one interface connecting to a DMZ subnet and a separate interface connecting to the Private Network."
    ),
    "Ch5.Q14": (
        "Visual exhibit (Windows Task Manager 'Users' tab screenshot): Lists user 'Example' "
        "(ID: 1, Status: Active, Client Name: Console). Action buttons at bottom show 'Disconnect' "
        "and 'Logoff' enabled, while the 'Send Message...' button is greyed out and non-clickable."
    ),
    "Ch5.Q17": (
        "Kerberos logon flow diagram:\n"
        "  Step A: Client Workstation --(Username and Password)--> KDC\n"
        "  Step B: KDC --> Client Workstation\n"
        "  Step C: Client Workstation <--> Services"
    ),
    "Ch5.Q18": (
        "Kerberos logon flow diagram:\n"
        "  Step A: Client Workstation --(Username and Password)--> KDC\n"
        "  Step B: KDC --> Client Workstation\n"
        "  Step C: Client Workstation <--> Services"
    ),
    "Ch5.Q19": (
        "Kerberos logon flow diagram:\n"
        "  Step A: Client Workstation --(Username and Password)--> KDC\n"
        "  Step B: KDC --> Client Workstation\n"
        "  Step C: Client Workstation <--> Services"
    ),
    "Ch5.Q85": (
        "Biometric sensitivity tradeoff chart (X-axis: Sensitivity increasing left-to-right; Y-axis: Percent error):\n"
        "  - FRR curve rises from low to high as Sensitivity increases.\n"
        "  - FAR curve falls from high to low as Sensitivity increases.\n"
        "  - Point A marks the exact intersection where FAR and FRR curves cross.\n"
        "  - Point B sits to the left of Point A (lower sensitivity threshold where FAR is higher than FRR)."
    ),
    "Ch5.Q86": (
        "Biometric sensitivity tradeoff chart (X-axis: Sensitivity increasing left-to-right; Y-axis: Percent error):\n"
        "  - FRR curve rises with Sensitivity; FAR curve falls with Sensitivity.\n"
        "  - Point A marks where FAR and FRR cross.\n"
        "  - Point B is located to the left of Point A (very low sensitivity threshold where the FAR curve is high and FRR is near zero)."
    ),
    "Ch5.Q87": (
        "Biometric sensitivity tradeoff chart (X-axis: Sensitivity; Y-axis: Percent error) showing FAR and FRR curves "
        "crossing at Point A, with Point B at lower sensitivity (high FAR, low FRR)."
    ),
    "Ch5.Q93": (
        "Visual exhibit (Linux terminal screenshot):\n"
        "  $ chmod 731 alex.txt\n"
        "  $ ls -la\n"
        "  -rwx-wx--x 1 alex alex 15 Feb 27 19:26 alex.txt"
    ),
    "Ch6.Q52": (
        "Visual exhibit (Windows Event Log Properties dialog for 'Application'):\n"
        "  Maximum log size (KB): 20480\n"
        "  When maximum event log size is reached:\n"
        "    [ ] Overwrite events as needed (oldest events first)\n"
        "    [*] Archive the log when full, do not overwrite events\n"
        "    [ ] Do not overwrite events (Clear logs manually)"
    ),
    "Ch6.Q55": (
        "Nmap scan output exhibit (v7.40 for myhost / 192.168.107.9):\n"
        "  Not shown: 997 filtered ports\n"
        "  PORT    STATE SERVICE\n"
        "  22/tcp  open  ssh\n"
        "  80/tcp  open  http\n"
        "  443/tcp open  https"
    ),
    "Ch6.Q56": (
        "Nmap scan output for 192.168.107.9:\n"
        "  Not shown: 997 filtered ports\n"
        "  22/tcp  open  ssh\n"
        "  80/tcp  open  http\n"
        "  443/tcp open  https"
    ),
    "Ch6.Q57": (
        "Nmap scan output for 192.168.107.9:\n"
        "  Not shown: 997 filtered ports\n"
        "  22/tcp  open  ssh\n"
        "  80/tcp  open  http\n"
        "  443/tcp open  https"
    ),
    "Ch6.Q85": (
        "Nmap scan output for 192.168.184.130 (Not shown: 977 closed ports):\n"
        "  21/tcp open ftp | 22/tcp open ssh | 23/tcp open telnet | 25/tcp open smtp | "
        "53/tcp open domain | 80/tcp open http | 111/tcp open rpcbind | 139/tcp open netbios-ssn | "
        "445/tcp open microsoft-ds | 512/tcp open exec | 513/tcp open login | 514/tcp open shell | "
        "1099/tcp open rmiregistry | 1524/tcp open ingreslock | 2049/tcp open nfs | "
        "2121/tcp open ccproxy-ftp | 3306/tcp open mysql | 5432/tcp open postgresql | "
        "5900/tcp open vnc | 6000/tcp open X11 | 6667/tcp open irc | 8009/tcp open ajp13 | 8180/tcp open unknown"
    ),
    "Ch6.Q86": (
        "Nmap scan output for 192.168.184.130 (Not shown: 977 closed ports):\n"
        "  Open ports include: 21/ftp, 22/ssh, 23/telnet, 25/smtp, 53/domain, 80/http, "
        "111/rpcbind, 139/netbios-ssn, 445/microsoft-ds, 512/exec, 513/login, 514/shell, "
        "1099/rmiregistry, 1524/ingreslock, 2049/nfs, 2121/ccproxy-ftp, 3306/mysql, "
        "5432/postgresql, 5900/vnc, 6000/X11, 6667/irc, 8009/ajp13, 8180/unknown."
    ),
    "Ch7.Q54": (
        "Visual exhibit: Outdoor photograph of two coastal researchers collecting samples, "
        "with a translucent branding stamp reading 'USGS science for a changing world' embedded "
        "across the lower-left corner of the image."
    ),
    "Ch8.Q8": (
        "Visual exhibit (Windows Blue Screen of Death screenshot):\n"
        "  PAGE_FAULT_IN_NONPAGED_AREA\n"
        "  Technical information: *** STOP: 0x00000050 (0xF89861A0, 0x00000000, ...)\n"
        "  *** SPCMDCON.SYS - Address F89861A0 base at F897D000\n"
        "  Beginning dump of physical memory. Physical memory dump complete."
    ),
    "Ch8.Q16": (
        "Visual exhibit (Windows Firewall log excerpt, 2016-04-21 05:14:52 - 05:15:04):\n"
        "  Repeated `DROP TCP 192.168.250.4 -> 192.168.42.14` entries targeting sequential "
        "destination ports `21, 22, 23, 25, 53, 80, 110, 111` (SYN packets) within 12 seconds."
    ),
    "Ch8.Q32": (
        "Database SQL snippet shown in figure:\n"
        "  BEGIN TRANSACTION;\n"
        "  UPDATE accounts SET balance = balance + 250 WHERE account_number = 1001;\n"
        "  UPDATE accounts SET balance = balance - 250 WHERE account_number = 2002;\n"
        "  END TRANSACTION;"
    ),
    "Ch8.Q68": (
        "Database SQL snippet shown in figure:\n"
        "  BEGIN TRANSACTION;\n"
        "  UPDATE accounts SET balance = balance + 250 WHERE account_number = 1001;\n"
        "  UPDATE accounts SET balance = balance - 250 WHERE account_number = 2002;\n"
        "  COMMIT TRANSACTION;"
    ),
    "Ch8.Q71": (
        "Visual exhibit (Project schedule chart): Horizontal timeline divided into columns Week 1–Week 10 "
        "with horizontal task bars across calendar time, red dependency connector arrows between "
        "sequential tasks, and a dashed vertical current-date progress line."
    ),
    "Ch8.Q83": (
        "Visual exhibit (screen warning popup): Red alert dialog titled 'CryptoLocker' stating: "
        "'Your personal files are encrypted! ... RSA-2048 unique public key ... pay 300 USD / 300 EUR "
        "to obtain the private key' with a countdown timer before key destruction."
    ),
    "Ch8.Q103": (
        "Ruby code snippet shown in figure:\n"
        "  insert_new_user = db.prepare \"INSERT INTO users (name, userid, gender, usertype) VALUES (?, ?, ?, ?)\"\n"
        "  insert_new_user.execute 'davids', '194567', 'male', 'admin'"
    ),
    "Ch9.Q37": (
        "Apache HTTP access log excerpt:\n"
        "  217.69.133.190 - - [28/Feb/2017:04:01:47 -0500] \"GET /forum/viewtopic.php?f=32&t=350222 HTTP/1.1\" 503 2009 \"-\" \"Mail.RU_Bot/2.0\"\n"
        "  217.69.133.190 - - [28/Feb/2017:04:01:51 -0500] \"GET /ask-a-pci-dss-question/ HTTP/1.1\" 200 6501 \"-\" \"Mail.RU_Bot/2.0\"\n"
        "  217.69.133.190 - - [28/Feb/2017:04:01:56 -0500] \"GET /forum/posting.php?mode=quote HTTP/1.1\" 503 2009 \"-\" \"Mail.RU_Bot/2.0\""
    ),
    "Ch9.Q38": (
        "Apache HTTP access log excerpt:\n"
        "  217.69.133.190 - - [28/Feb/2017:04:01:47 -0500] \"GET /forum/viewtopic.php?f=32&t=350222 HTTP/1.1\" 503 2009 \"-\" \"Mail.RU_Bot/2.0\"\n"
        "  217.69.133.190 - - [28/Feb/2017:04:01:51 -0500] \"GET /ask-a-pci-dss-question/ HTTP/1.1\" 200 6501 \"-\" \"Mail.RU_Bot/2.0\""
    ),
    "Ch9.Q41": (
        "Equations shown in figure:\n"
        "   8 ___ 6 = 2\n"
        "   8 ___ 4 = 0\n"
        "  10 ___ 3 = 1\n"
        "  10 ___ 2 = 0"
    ),
    "Ch9.Q49": (
        "Visual exhibit: Digital photograph of a scenic coastal pier posted publicly on an Internet "
        "message board, suspected of embedding covert hidden payload data inside the image file."
    ),
    "Ch9.Q61": (
        "Visual exhibit (disassembled physical access badge): Open white plastic ID badge casing "
        "revealing a rectangular coiled copper wire antenna connected to a small internal microchip, "
        "with no external metallic smart-card contact pad and no battery."
    ),
    "Ch9.Q82": (
        "Identity & provisioning diagram mapping:\n"
        "  A = HR provisioning workflow inputs to Provisioning System\n"
        "  B = Application Servers (connected from Provisioning System)\n"
        "  C = Database Servers (connected from Provisioning System)\n"
        "  D = Active Directory Enabled Workstations (connected via Directory Server)\n"
        "  E = Directory Server connection\n"
        "  F = Incident Management System connection"
    ),
    "Ch9.Q83": (
        "Identity & provisioning diagram mapping:\n"
        "  A = HR provisioning workflow inputs\n"
        "  B = Application Servers (Alex's current team)\n"
        "  C = Database Servers (Alex's previous role)\n"
        "  D = Active Directory Enabled Workstations\n"
        "  E = Directory Server connection | F = Incident Management System"
    ),
    "Ch9.Q84": (
        "Identity & provisioning diagram mapping:\n"
        "  A = HR provisioning workflow inputs | B = Application Servers | C = Database Servers | "
        "D = Active Directory Enabled Workstations | E = Directory Server | F = Incident Management System"
    ),
    "Ch9.Q116": (
        "Nikto v2.1.4 web scan output against `192.168.184.130:80` (Apache/2.2.8 Ubuntu):\n"
        "  + OSVDB-877: HTTP TRACE method is active, suggesting the host is vulnerable to XST\n"
        "  + /phpinfo.php: Output from the phpinfo() function was found.\n"
        "  + /doc/: Directory indexing found.\n"
        "  + /test/: Directory indexing found.\n"
        "  + /test/: OSVDB-3092: /test/: This might be interesting...\n"
        "  + /phpMyAdmin/: This might be interesting..."
    ),
    "Ch9.Q117": (
        "Nikto v2.1.4 web scan output against `192.168.184.130:80`:\n"
        "  + /doc/: Directory indexing found.\n"
        "  + /test/: Directory indexing found.\n"
        "  + /phpinfo.php & /phpMyAdmin/ discovered."
    ),
    "Ch9.Q118": (
        "Nikto v2.1.4 web scan output against `192.168.184.130:80`:\n"
        "  + OSVDB-877: HTTP TRACE method is active, suggesting the host is vulnerable to XST\n"
        "  + /phpinfo.php, /doc/, /test/, /phpMyAdmin/ reported."
    ),
    "Ch9.Q124": (
        "Visual exhibit (network topology diagram): Central network hub/switch at the center with "
        "dedicated point-to-point spokes radiating outward to each surrounding workstation."
    ),
    "Ch10.Q94": (
        "Visual exhibit (back of ID card sample): Plastic card back featuring a horizontal dark "
        "magnetic stripe running along the upper edge above the signature strip and agency text."
    ),
    "Ch10.Q95": (
        "Visual exhibit (log excerpt from 2015-08-09 16:39:01 - 16:40:55):\n"
        "  2015-08-09 16:39:01 ALLOW UDP 172.30.0.64 172.30.0.2 53655 53 ... SEND\n"
        "  2015-08-09 16:40:12 ALLOW TCP 54.172.251.189 172.30.0.64 443 80 ... RECEIVE\n"
        "  2015-08-09 16:40:55 ALLOW TCP 172.30.0.64 169.254.169.254 49160 80 ... SEND"
    ),
    "Ch10.Q120": (
        "Visual exhibit (physical access control floorplan diagram): Architectural entry barrier "
        "featuring a unidirectional rotating gate restricting passage to one person per revolution; "
        "an arrow points to this barrier."
    ),
    "Ch11.Q20": (
        "File Modifications Schedule Table:\n"
        "  Monday:    8 a.m. File 1 created | 10 a.m. File 2 created | 11 a.m. File 3 created | 4 p.m. File 1 modified | 5 p.m. File 4 created\n"
        "  Tuesday:   8 a.m. File 1 modified | 9 a.m. File 2 modified | 10 a.m. File 5 created\n"
        "  Wednesday: 8 a.m. File 3 modified | 9 a.m. File 6 created"
    ),
    "Ch11.Q32": (
        "Windows `ipconfig` command output exhibit:\n"
        "  Ethernet adapter Local Area Connection:\n"
        "    Autoconfiguration IPv4 Address. . : 169.254.19.21\n"
        "    Subnet Mask . . . . . . . . . . . : 255.255.0.0\n"
        "    Default Gateway . . . . . . . . . :"
    ),
    "Ch11.Q83": (
        "Visual exhibit (Windows Event Log Properties dialog for 'Application'):\n"
        "  Maximum log size (KB): 20480\n"
        "  When maximum event log size is reached:\n"
        "    [*] Overwrite events as needed (oldest events first)\n"
        "    [ ] Archive the log when full, do not overwrite events\n"
        "    [ ] Do not overwrite events (Clear logs manually)"
    ),
    "Ch11.Q84": (
        "Visual exhibit (attacker HTTP control interface): Web browser view showing a live video "
        "feed of a room with Pan/Tilt/Zoom (PTZ) directional controls, Resolution `640*480`, "
        "Mode `60 HZ`, and Flip/Mirror checkboxes."
    ),
    "Ch12.Q3": (
        "Biometric sensitivity tradeoff chart (X-axis: Sensitivity increasing left-to-right; Y-axis: Percent error):\n"
        "  - FRR curve rises with Sensitivity; FAR curve falls with Sensitivity.\n"
        "  - Point A marks the intersection where FAR and FRR cross.\n"
        "  - Point B sits to the left of Point A (low sensitivity threshold where FAR > FRR)."
    ),
    "Ch12.Q4": (
        "Biometric sensitivity tradeoff chart (X-axis: Sensitivity increasing left-to-right; Y-axis: Percent error):\n"
        "  - FRR curve rises with Sensitivity; FAR curve falls with Sensitivity.\n"
        "  - Point A marks where FAR and FRR cross.\n"
        "  - Point B is located to the left of Point A (low sensitivity where FAR is high and FRR is low)."
    ),
    "Ch12.Q5": (
        "Biometric sensitivity tradeoff chart (X-axis: Sensitivity; Y-axis: Percent error) showing FAR and FRR curves "
        "intersecting at Point A, with Point B at lower sensitivity."
    ),
    "Ch12.Q58": (
        "Kerberos resource-access flow diagram (post-initial-logon):\n"
        "  Step A: Client Workstation --(request)--> KDC (Ticket Granting Service)\n"
        "  Step B: KDC --(response)--> Client Workstation\n"
        "  Step C/D: Client Workstation <--> Target Service"
    ),
    "Ch12.Q59": (
        "Kerberos resource-access flow diagram:\n"
        "  Step A: Client Workstation --(TGT + service request)--> KDC\n"
        "  Step B: KDC --(response)--> Client Workstation\n"
        "  Step C/D: Client Workstation <--> Target Service"
    ),
    "Ch12.Q60": (
        "Kerberos resource-access flow diagram:\n"
        "  Step A: Client Workstation --> KDC | Step B: KDC --> Client Workstation\n"
        "  Step C/D: Client Workstation --(service ticket + authenticator)--> Target Service"
    ),
    "Ch12.Q125": (
        "Visual exhibit (Linux terminal screenshot):\n"
        "  $ ls -l\n"
        "  total 8\n"
        "  -rw-r--r-- 1 demo demo 93 Apr 11 23:38 example.txt\n"
        "  -rw-rw-r-- 1 demo demo 15 Apr 11 23:37 index.html"
    ),
}

# Positional "All/None of the above" option replacements so all 4 choices are self-contained
POSITIONAL_OPTION_REPLACEMENTS: dict[tuple[str, str], str] = {
    ("Ch7.Q15", "D"): "On a periodic basis, when a user leaves, and when a user changes roles",
    ("Ch7.Q31", "D"): "I, II, III, and IV",
    ("Ch7.Q73", "D"): "1, 2, 3, 4, and 5",
    ("Ch8.Q2", "D"): "Sending spam, conducting brute-force attacks, and scanning for vulnerable systems",
    ("Ch8.Q10", "D"): "Currency",
    ("Ch8.Q69", "D"): "RemoveFunds",
    ("Ch8.Q95", "D"): "Cross-site scripting, cross-site request forgery, and SQL injection",
}

# Clean stem overrides where extracted diagram text polluted the question stem with broken axis text
STEM_CLEANUP_REPLACEMENTS: dict[str, str] = {
    "Ch1.Q81": (
        "The Domer Industries risk assessment team recently conducted a qualitative risk assessment "
        "and developed a 2x2 Probability-vs-Impact matrix (Quadrant II: High Probability/Low Impact; "
        "Quadrant I: High Probability/High Impact; Quadrant III: Low Probability/Low Impact; "
        "Quadrant IV: Low Probability/High Impact). Which quadrant contains the risks that require "
        "the most immediate attention?"
    ),
    "Ch9.Q93": (
        "What type of risk assessment uses a probability-versus-impact matrix categorizing threats "
        "into Low, Moderate, and High risk tiers?"
    ),
    "Ch3.Q2": (
        "Referring to the four stages of a fire (Stage 1: Incipient/invisible gases; Stage 2: Smoke; "
        "Stage 3: Flame; Stage 4: Heat), what is the earliest stage of a fire where it is possible "
        "to use detection technology to identify it?"
    ),
    "Ch3.Q33": (
        "Referring to the physical security floorplan diagram indicated by the arrow, what is the "
        "name of the double-door access control vestibule that prevents tailgating?"
    ),
    "Ch10.Q120": (
        "Referring to the physical security floorplan diagram indicated by the arrow, what is the "
        "name of the unidirectional entry control barrier allowing one person at a time?"
    ),
    "Ch9.Q124": (
        "What network topology connects every endpoint through dedicated point-to-point links to a "
        "single central hub or switch, as shown in the topology diagram?"
    ),
    "Ch4.Q12": (
        "What network topology connects workstations and a server sequentially in a single closed-loop "
        "circuit, as shown in the image?"
    ),
    "Ch4.Q33": (
        "What network topology connects multiple workstations via drop lines to a single shared "
        "linear backbone cable, as shown in the image?"
    ),
    "Ch4.Q48": (
        "What network topology directly interconnects every computer with a dedicated link to every "
        "other computer in the network, as shown in the image?"
    ),
}

# Book Errata / Clarifications for matching & ordering questions:
#   - Ch4.Q86: PDF extracted 'F. Session' and 'G. Transport' onto one option line; restore F & G properly
#   - Ch10.Q25: TaaS is a decoy option; ordering involves B (SaaS), C (PaaS), A (IaaS)
#   - Ch12.Q109: Book's summary header accidentally listed 'A, B, C, D' (Parallel before Tabletop)
#     while the very next paragraph explicitly explains Checklist -> Tabletop -> Parallel -> Full interruption.
MATCH_ORDER_OVERRIDES: dict[str, dict[str, Any]] = {
    "Ch4.Q86": {
        "options": [
            {"id": "A", "text": "Application"},
            {"id": "B", "text": "Data Link"},
            {"id": "C", "text": "Network"},
            {"id": "D", "text": "Physical"},
            {"id": "E", "text": "Presentation"},
            {"id": "F", "text": "Session"},
            {"id": "G", "text": "Transport"},
        ],
        "correctAnswers": ["D", "B", "C", "G", "F", "E", "A"],
    },
    "Ch12.Q109": {
        "correctAnswers": ["A", "C", "B", "D"],
    },
}

# Extra domain fallback keywords for Chapters 9–12 when TOPIC_RULES have low/tied scores
DOMAIN_BOOST_RULES: dict[str, list[str]] = {
    "dom-1": [
        "risk management", "cia triad", "due care", "due diligence", "compliance",
        "hipaa", "gdpr", "glba", "sox", "pci dss", "ferpa", "fisma", "coppa", "dmca",
        "business continuity", "bia", "business impact analysis", "mtd", "rto", "rpo",
        "ale", "sle", "aro", "safeguard", "policy", "code of ethics", "(isc)2", "isc2",
        "threat modeling", "stride", "pasta", "dread", "supply chain", "personnel",
        "background check", "nda", "non-disclosure", "ethics", "tort", "liability",
    ],
    "dom-2": [
        "data classification", "classification level", "data owner", "data custodian",
        "data controller", "data processor", "retention", "sanitization", "degaussing",
        "purging", "clearing", "destruction", "nist sp 800-88", "nist sp 800-60",
        "media reuse", "data at rest", "data in transit", "data in use", "pii", "phi",
        "scoping", "tailoring", "asset inventory", "labeling", "handling", "dlp",
        "data loss prevention", "irm", "drm", "rights management", "anonymization",
    ],
    "dom-3": [
        "bell-lapadula", "biba", "clark-wilson", "brewer-nash", "chinese wall",
        "graham-denning", "sutherland", "security model", "common criteria", "eal",
        "tcb", "trusted computing base", "reference monitor", "security kernel",
        "ring 0", "ring 3", "protection ring", "tpm", "cpu", "mmu", "encryption",
        "symmetric", "asymmetric", "aes", "3des", "des", "rsa", "ecc", "diffie-hellman",
        "hash", "sha-", "md5", "hmac", "digital signature", "pki", "x.509", "crl",
        "ocsp", "quantum", "steganography", "cpted", "mantrap", "bollard", "fence",
        "fire suppression", "halon", "fm-200", "sprinkler", "hvac", "emi", "tempest",
        "faraday", "covert channel", "race condition", "toctou", "side-channel",
    ],
    "dom-4": [
        "osi model", "tcp/ip", "tcp", "udp", "ipsec", "ah", "esp", "ike", "vpn",
        "tls", "ssl", "https", "http", "dns", "dnssec", "dhcp", "arp", "icmp",
        "bgp", "ospf", "nat", "pat", "vlan", "802.1q", "802.1x", "wpa2", "wpa3",
        "radius", "tacacs+", "diameter", "eap", "peap", "firewall", "stateful",
        "dmz", "nac", "sdn", "cdn", "mpls", "frame relay", "x.25", "isdn", "dsl",
        "mac address", "subnet", "cidr", "switch", "router", "star topology",
        "mesh topology", "ring topology", "bus topology", "fiber", "cat 5", "rg-58",
        "smurf", "fraggle", "syn flood", "arp poisoning", "bgp hijacking", "wireless",
    ],
    "dom-5": [
        "kerberos", "tgt", "kdc", "saml", "oauth", "openid", "oidc", "sso",
        "single sign-on", "federation", "ldap", "active directory", "biometric",
        "cer", "far", "frr", "retinal", "iris", "fingerprint", "smart card", "cac",
        "token", "totp", "hotp", "mfa", "multifactor", "provisioning",
        "deprovisioning", "privilege creep", "rbAc".lower(), "abac", "mac", "dac",
        "least privilege", "need to know", "pam", "privileged access", "password",
        "salted hash", "credential", "account review", "identity", "access control",
    ],
    "dom-6": [
        "penetration test", "vulnerability scan", "nmap", "nessus", "qualys", "nikto",
        "metasploit", "aircrack", "wireshark", "black box", "white box", "gray box",
        "soc 1", "soc 2", "soc 3", "ssae 18", "sas 70", "iso 27001", "audit",
        "auditor", "code review", "fagan", "sast", "dast", "fuzzing", "kpi", "kri",
        "coverage", "nist sp 800-115", "compliance check", "log review", "siem",
        "synthetic transaction", "rum", "regression", "unit testing", "integration testing",
    ],
    "dom-7": [
        "incident response", "csirt", "containment", "eradication", "recovery",
        "chain of custody", "forensic", "volatile memory", "order of volatility",
        "first responder", "evidence", "legal hold", "ediscovery", "drp",
        "disaster recovery", "hot site", "warm site", "cold site", "service bureau",
        "reciprocal agreement", "backup", "incremental", "differential", "full backup",
        "raid", "clustering", "load balancing", "failover", "tabletop", "parallel test",
        "full interruption", "checklist review", "simulation test", "honeypot",
        "honeynet", "darknet", "pseudoflaw", "patch management", "configuration management",
        "change management", "syslog", "ntp", "event log", "bsod", "iptables",
    ],
    "dom-8": [
        "sdlc", "agile", "waterfall", "spiral", "rad", "devops", "devsecops", "ci/cd",
        "cmm", "capability maturity", "sql injection", "xss", "cross-site scripting",
        "csrf", "xsrf", "cross-site request forgery", "buffer overflow", "parameterized",
        "prepared statement", "input validation", "output encoding", "owasp",
        "primary key", "foreign key", "normalization", "acid", "atomicity", "commit",
        "rollback", "referential integrity", "polyinstantiation", "aggregation",
        "inference", "object-oriented", "encapsulation", "polymorphism", "cohesion",
        "coupling", "malware", "ransomware", "trojan", "worm", "rootkit", "botnet",
        "static analysis", "dynamic analysis", "gantt", "work breakdown structure", "wbs",
    ],
}


def build_clean_word_vocab(questions: list[dict[str, Any]]) -> set[str]:
    """Collect clean unhyphenated vocabulary across all questions + CISSP terms."""
    vocab = set(EXTRA_VALID_JOINED_WORDS)
    for q in questions:
        blobs = [q.get("stem", ""), q.get("sharedScenario") or "", q.get("explanation", "")]
        blobs.extend(o.get("text", "") for o in q.get("options", []))
        for text in blobs:
            # Find tokens that contain NO hyphens
            for w in re.findall(r"(?<![A-Za-z-])[A-Za-z]{3,}(?![A-Za-z-])", text):
                vocab.add(w.lower())
    return vocab


def dehyphenate_text(text: str, vocab: set[str]) -> str:
    """Repair PDF line-break soft hyphens (e.g., `sen-sitive` -> `sensitive`) without hurting real compounds."""
    if not text or "-" not in text:
        return text

    # Strip known PDF reprint notices or broken vertical axis labels
    text = re.sub(
        r"\s*Image reprinted from CISSP \(ISC\)\s*2? Certified Information Systems Security "
        r"Professional Official Study Guide[^.\n]*\.",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\s*Source:\s*NIST SP 800-88\.", "", text)
    text = re.sub(r"\s*Source:\s*Certificate of Sanitization[^.\n]*\.", "", text)

    def _repl(match: re.Match[str]) -> str:
        left, right = match.group(1), match.group(2)
        compound = f"{left}-{right}".lower()
        joined = f"{left}{right}".lower()
        if compound in KEEP_HYPHEN_EXACT:
            return f"{left}-{right}"
        if left.lower() in KEEP_HYPHEN_PREFIXES:
            # Wait: check if left+right is an unmistakable single English word broken at line end
            # e.g. `inter-net`, `compu-ter`, `pre-vent`, `pro-tect`
            if left.lower() in {"re", "pre", "non", "co", "sub", "multi", "un", "in", "dis", "ex"} and joined in vocab and len(right) >= 2:
                # Special care: `re-send` vs `re-quired` (`required` has no valid root `quired`, so join!)
                if right.lower() in {"quired", "quiring", "quirements", "sources", "sponsible", "sponse", "spond", "commend", "commended", "commends", "mote", "trieve", "lated", "lation", "lationship", "strict", "stricted", "sult", "sults", "sulting", "cord", "cords", "duce", "duces", "ducing", "flect", "quire"}:
                    return f"{left}{right}"
            return f"{left}-{right}"
        if joined in vocab:
            return f"{left}{right}"
        return f"{left}-{right}"

    # Apply iteratively so double-broken words like `authen-tica-tion` heal completely
    prev = None
    cur = text
    while cur != prev:
        prev = cur
        cur = re.sub(r"\b([A-Za-z]{2,})-\s*([a-z]{2,})\b", _repl, cur)
    cur = re.sub(r"[ \t]{2,}", " ", cur)
    cur = re.sub(r"\n{3,}", "\n\n", cur)
    return cur.strip()


def normalize_book_prose(text: str, vocab: set[str]) -> str:
    """Clean typography, smart quotes, ligatures, soft hyphens, and stray whitespace."""
    if not text:
        return ""
    replacements = {
        "\ufb01": "fi",
        "\ufb02": "fl",
        "\ufb00": "ff",
        "\ufb03": "ffi",
        "\ufb04": "ffl",
        "\u2019": "'",
        "\u2018": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": " — ",
        "\u00a0": " ",
        "\u25a0": "•",
        "■": "•",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"\(ISC\)\s*2\b", "(ISC)²", text)
    text = dehyphenate_text(text, vocab)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def convert_matching_to_mcq(
    q: dict[str, Any], sr: str, rng: random.Random, vocab: set[str]
) -> tuple[str, str | None, list[dict[str, Any]], str, dict[str, str]]:
    """Convert a matching question (numbered items -> lettered choices) into a 4-option MCQ."""
    stem_raw = normalize_book_prose(q["stem"], vocab)
    opts = [
        {"id": o["id"], "text": normalize_book_prose(o["text"], vocab)}
        for o in q["options"]
    ]
    raw_pairs: list[str] = list(q.get("correctAnswers") or [])
    if not raw_pairs and q.get("correctAnswer"):
        raw_pairs = [x.strip() for x in q["correctAnswer"].split(",") if ":" in x]

    # Parse pairs: [("1", "B"), ("2", "C"), ...] or [("A", "Type 1"), ...] for Ch9.Q48
    parsed_pairs: list[tuple[str, str]] = []
    for p in raw_pairs:
        k, v = [x.strip().rstrip(".") for x in p.split(":", 1)]
        parsed_pairs.append((k, v))

    # Extract header intro vs item block from stem
    lines = [ln.strip() for ln in stem_raw.splitlines() if ln.strip()]
    intro_lines = []
    item_lines = []
    in_items = False
    for ln in lines:
        if re.match(r"^(1\.|Wireless attack|Laws and|Data elements|Architectural|Security models|TCP ports|Controls|Authentication|Status message|Scanning types|Terms|Code testing|Testing methodologies|Factors|IP address|Tools|Cable type|SOC levels|Protocol|Service)\b", ln, re.I):
            in_items = True
        if in_items:
            if ln.lower() not in {"descriptions", "categories", "protocols", "description", "category", "purpose", "maximum length", "soc report descriptions", "network port", "level of knowledge", "definitions", "scanning descriptions"}:
                item_lines.append(ln)
        else:
            intro_lines.append(ln)

    # Special handling for Ch9.Q48 (lettered factors A..E -> Type 1..Type 3)
    if sr == "Ch9.Q48":
        item_lines = [
            "Factors: " + "; ".join(f"{o['id']}. {o['text']}" for o in opts),
            "Types: Type 1 (Something you know), Type 2 (Something you have), Type 3 (Something you are)",
        ]
        target_pool = ["Type 1", "Type 2", "Type 3"]
    else:
        desc_block = "\n".join(f"  {o['id']}. {o['text']}" for o in opts)
        item_lines.append("")
        item_lines.append("Descriptions / Categories:")
        item_lines.append(desc_block)
        target_pool = [o["id"] for o in opts]

    # Build clean context + MCQ stem
    intro_clean = re.sub(
        r"\bMatch\s+(each\s+of\s+the|each\s+one\s+of\s+the|the\s+following)\b",
        "Identify the correct mapping matching",
        " ".join(intro_lines),
        flags=re.I,
    )
    intro_clean = re.sub(r"\s*:\s*$", ".", intro_clean).strip()
    if len(intro_clean) < 35:
        intro_clean = (
            f"{intro_clean} Which option shows the complete, accurate set of matches?"
        ).strip()
    elif "?" not in intro_clean:
        intro_clean = f"{intro_clean} Which option shows the correct complete matching?"

    scenario_block = "\n".join(item_lines).strip()

    def fmt_pairs(pairs: list[tuple[str, str]]) -> str:
        return ", ".join(f"{k} -> {v}" for k, v in pairs)

    correct_str = fmt_pairs(parsed_pairs)

    # Build 3 distinct plausible distractor mappings by swapping adjacent pairs or substituting pool values
    distractor_strs: list[str] = []
    seen = {correct_str}
    n = len(parsed_pairs)

    candidate_mutations: list[list[tuple[str, str]]] = []
    # 1) Swap adjacent target values at every position
    for i in range(n - 1):
        mut = list(parsed_pairs)
        k1, v1 = mut[i]
        k2, v2 = mut[i + 1]
        if v1 != v2:
            mut[i] = (k1, v2)
            mut[i + 1] = (k2, v1)
            candidate_mutations.append(mut)
    # 2) Circular shift of values
    if n >= 3:
        vals = [v for _, v in parsed_pairs]
        for shift in (1, 2):
            mut = [(parsed_pairs[i][0], vals[(i + shift) % n]) for i in range(n)]
            candidate_mutations.append(mut)
    # 3) Single-entry substitution (when target_pool has repeated categories like B,A,C,C)
    for i in range(n):
        k, v = parsed_pairs[i]
        for alt in target_pool:
            if alt != v:
                mut = list(parsed_pairs)
                mut[i] = (k, alt)
                candidate_mutations.append(mut)

    rng.shuffle(candidate_mutations)
    for mut in candidate_mutations:
        s = fmt_pairs(mut)
        if s not in seen:
            seen.add(s)
            distractor_strs.append(s)
            if len(distractor_strs) == 3:
                break

    assert len(distractor_strs) == 3, f"Could not generate 3 distractors for {sr}"

    # Deterministically place correct option across A/B/C/D
    letters = ["A", "B", "C", "D"]
    correct_idx = rng.randrange(4)
    choices: list[str] = []
    d_it = iter(distractor_strs)
    for idx in range(4):
        if idx == correct_idx:
            choices.append(correct_str)
        else:
            choices.append(next(d_it))

    correct_letter = letters[correct_idx]
    new_opts = [{"id": letters[i], "text": choices[i]} for i in range(4)]

    # Build explicit per-option explanations showing what matches vs what is swapped
    per_opt_notes: dict[str, str] = {}
    for opt in new_opts:
        oid = opt["id"]
        if oid == correct_letter:
            per_opt_notes[oid] = (
                f"Option {oid} ({opt['text']}) correctly aligns every item with its exact "
                f"definition or category."
            )
        else:
            diffs = []
            for p_part, c_pair in zip(opt["text"].split(", "), parsed_pairs):
                if p_part != f"{c_pair[0]} -> {c_pair[1]}":
                    diffs.append(f"{c_pair[0]} should map to {c_pair[1]} (not {p_part.split('->')[-1].strip()})")
            diff_summary = "; ".join(diffs[:3])
            per_opt_notes[oid] = (
                f"Incorrect matching: {diff_summary}. Review each term's exact role and definition."
            )

    return intro_clean, scenario_block, new_opts, correct_letter, per_opt_notes


def convert_ordering_to_mcq(
    q: dict[str, Any], sr: str, rng: random.Random, vocab: set[str]
) -> tuple[str, str | None, list[dict[str, Any]], str, dict[str, str]]:
    """Convert an ordering question (sequence of options) into a 4-option MCQ."""
    override = MATCH_ORDER_OVERRIDES.get(sr, {})
    raw_opts = override.get("options") or q["options"]
    opts_map = {o["id"]: normalize_book_prose(o["text"], vocab) for o in raw_opts}

    seq = list(override.get("correctAnswers") or q.get("correctAnswers") or [])
    if not seq and q.get("correctAnswer"):
        seq = [x.strip() for x in q["correctAnswer"].split(",")]

    def fmt_seq(order: list[str]) -> str:
        return " -> ".join(opts_map[k] for k in order if k in opts_map)

    correct_str = fmt_seq(seq)
    distractor_strs: list[str] = []
    seen = {correct_str}

    # Generate plausible adjacent swaps & rotations
    n = len(seq)
    cands: list[list[str]] = []
    for i in range(n - 1):
        m = list(seq)
        m[i], m[i + 1] = m[i + 1], m[i]
        cands.append(m)
    if n >= 3:
        for i in range(n - 2):
            m = list(seq)
            m[i], m[i + 2] = m[i + 2], m[i]
            cands.append(m)
        cands.append(list(reversed(seq)))
    # If there is an unused decoy option (e.g., Ch10.Q25 has D: TaaS), swap it into one distractor
    unused = [k for k in opts_map if k not in seq]
    for uk in unused:
        for pos in range(n):
            m = list(seq)
            m[pos] = uk
            cands.append(m)

    rng.shuffle(cands)
    for m in cands:
        s = fmt_seq(m)
        if s not in seen:
            seen.add(s)
            distractor_strs.append(s)
            if len(distractor_strs) == 3:
                break

    assert len(distractor_strs) == 3, f"Could not generate 3 sequence distractors for {sr}"

    stem_clean = normalize_book_prose(q["stem"], vocab)
    stem_clean = re.sub(
        r"\b(Rearrange|Place)\s+the\s+following\b",
        "Which option lists the following",
        stem_clean,
        flags=re.I,
    )
    if stem_clean == normalize_book_prose(q["stem"], vocab):
        stem_clean = re.sub(r"\b(Place|Put|Order)\s+the\b", "Which option correctly places the", stem_clean, flags=re.I)
    if "?" not in stem_clean:
        stem_clean = stem_clean.rstrip(".") + " in the correct order?"

    # Mention decoy items in scenarioContext if unused options existed
    scen_note = None
    if unused:
        scen_note = (
            "Candidate items listed: "
            + ", ".join(f"{k}. {opts_map[k]}" for k in sorted(opts_map))
            + " (note: invalid/non-standard distractor tiers should be excluded)."
        )

    letters = ["A", "B", "C", "D"]
    correct_idx = rng.randrange(4)
    choices: list[str] = []
    d_it = iter(distractor_strs)
    for i in range(4):
        choices.append(correct_str if i == correct_idx else next(d_it))

    correct_letter = letters[correct_idx]
    new_opts = [{"id": letters[i], "text": choices[i]} for i in range(4)]

    per_opt_notes: dict[str, str] = {}
    for opt in new_opts:
        oid = opt["id"]
        if oid == correct_letter:
            per_opt_notes[oid] = (
                f"Correct sequence: {opt['text']} accurately follows the required progression."
            )
        elif any(opts_map[uk] in opt["text"] for uk in unused):
            per_opt_notes[oid] = (
                f"Incorrect sequence: includes a decoy/non-standard option instead of valid lifecycle stages ({correct_str})."
            )
        else:
            per_opt_notes[oid] = (
                f"Out-of-order sequence: transposes stages compared to the proper progression ({correct_str})."
            )

    return stem_clean, scen_note, new_opts, correct_letter, per_opt_notes


def rectify_and_dedup(raw_questions: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Apply all visual, matching/ordering, positional-option, typography, and dedup rectifications."""
    vocab = build_clean_word_vocab(raw_questions)
    rectified: list[dict[str, Any]] = []
    stats = Counter()

    for q in raw_questions:
        ch = q["chapter"]
        qn = q["questionNumber"]
        sr = f"Ch{ch}.Q{qn}"
        rng = random.Random(f"isc2-official-{ch}-{qn}")

        item = dict(q)
        item["sourceRef"] = sr
        fmt = q.get("questionFormat", "single_choice")

        expl_clean = normalize_book_prose(q["explanation"], vocab)
        scen_clean = normalize_book_prose(q.get("sharedScenario") or "", vocab) or None

        # Fix book errata note in Ch12.Q109 explanation text if present
        if sr == "Ch12.Q109":
            expl_clean = expl_clean.replace(
                "A. Checklist review\n\nB. Parallel test\n\nC. Tabletop exercise\n\nD. Full interruption test",
                "A. Checklist review\nC. Tabletop exercise\nB. Parallel test\nD. Full interruption test",
            )
            stats["book_errata_fixed"] += 1

        if fmt == "matching":
            stem_out, scen_add, opts_out, corr_letter, per_opt_notes = convert_matching_to_mcq(
                q, sr, rng, vocab
            )
            scen_clean = "\n\n".join(x for x in [scen_clean, scen_add] if x) or None
            stats["matching_converted"] += 1
        elif fmt == "ordering":
            stem_out, scen_add, opts_out, corr_letter, per_opt_notes = convert_ordering_to_mcq(
                q, sr, rng, vocab
            )
            scen_clean = "\n\n".join(x for x in [scen_clean, scen_add] if x) or None
            stats["ordering_converted"] += 1
        else:
            stem_out = STEM_CLEANUP_REPLACEMENTS.get(sr) or normalize_book_prose(q["stem"], vocab)
            opts_out = []
            for o in q["options"]:
                oid = o["id"]
                if (sr, oid) in POSITIONAL_OPTION_REPLACEMENTS:
                    txt = POSITIONAL_OPTION_REPLACEMENTS[(sr, oid)]
                    stats["positional_option_fixed"] += 1
                else:
                    txt = normalize_book_prose(o["text"], vocab)
                opts_out.append({"id": oid, "text": txt})
            corr_letter = q["correctAnswer"]
            per_opt_notes = {}

        # Merge curated visual/figure/log/diagram scenario description
        if sr in VISUAL_RECTIFICATIONS:
            vis = VISUAL_RECTIFICATIONS[sr]
            if scen_clean:
                # Avoid duplicating if scenario already covers same log lines
                scen_clean = f"{vis}\n\n{scen_clean}"
            else:
                scen_clean = vis
            stats["visual_context_added"] += 1

        # Guard stem min(30)
        stem_out = re.sub(r"\n{3,}", "\n\n", stem_out).strip()
        if len(stem_out) < 30:
            stem_out = f"In the CISSP scenario shown, {stem_out[0].lower()}{stem_out[1:]}"
            stats["short_stem_padded"] += 1

        item["stem"] = stem_out
        item["scenarioContext"] = scen_clean
        item["options"] = opts_out
        item["correctAnswer"] = corr_letter
        item["explanationText"] = expl_clean
        item["perOptionNotes"] = per_opt_notes
        rectified.append(item)

    # Deduplicate ONLY true exact repeats (identical normalized stem, options, AND answer),
    # which preserves same-stem/different-image pairs like Ch4.Q12 (Ring) vs Ch4.Q33 (Bus)
    # and Ch4.Q48 (Mesh) vs Ch9.Q124 (Star).
    groups: dict[tuple[str, tuple[str, ...], str], list[dict[str, Any]]] = defaultdict(list)
    for it in rectified:
        sk = re.sub(r"[^a-z0-9]+", " ", it["stem"].lower()).strip()
        ok = tuple(sorted(re.sub(r"[^a-z0-9]+", " ", o["text"].lower()).strip() for o in it["options"]))
        groups[(sk, ok, it["correctAnswer"])].append(it)

    deduped: list[dict[str, Any]] = []
    merged_pairs: list[list[str]] = []
    for _, grp in groups.items():
        if len(grp) == 1:
            deduped.append(grp[0])
        else:
            # Prefer domain-chapter item (chapter <= 8) or longer explanation
            def rank(x: dict[str, Any]) -> tuple[int, int, int]:
                in_dom_ch = 1 if x["chapter"] <= 8 else 0
                return (in_dom_ch, len(x["explanationText"]), -x["globalIndex"])

            best = max(grp, key=rank)
            best["_mergedSourceRefs"] = [x["sourceRef"] for x in sorted(grp, key=lambda y: y["globalIndex"])]
            merged_pairs.append(best["_mergedSourceRefs"])
            deduped.append(best)
            stats["duplicates_merged"] += len(grp) - 1

    deduped.sort(key=lambda x: x["globalIndex"])
    return deduped, {"stats": dict(stats), "mergedDuplicateGroups": merged_pairs}


def classify_isc2_question(
    q: dict[str, Any], topic_map: dict[str, dict[str, Any]]
) -> tuple[dict[str, Any], int, int]:
    """Classify question into canonical CISSP domain/subdomain/topic using bookDomainId + TOPIC_RULES."""
    stem_l = q["stem"].lower()
    scen_l = (q.get("scenarioContext") or "").lower()
    opts_l = " ".join(o["text"].lower() for o in q["options"])
    expl_l = q["explanationText"].lower()
    corr_l = next(o["text"].lower() for o in q["options"] if o["id"] == q["correctAnswer"])

    locked_domain = q.get("bookDomainId")  # 'dom-1'..'dom-8' for Ch 1..8, None for Ch 9..12

    # Compute domain affinity scores for Ch 9..12
    dom_scores: Counter[str] = Counter()
    if not locked_domain:
        for did, kws in DOMAIN_BOOST_RULES.items():
            for kw in kws:
                pat = re.compile(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])")
                if pat.search(stem_l) or pat.search(scen_l):
                    dom_scores[did] += 6
                if pat.search(corr_l):
                    dom_scores[did] += 5
                elif pat.search(opts_l):
                    dom_scores[did] += 2
                if pat.search(expl_l):
                    dom_scores[did] += 3

    scores: list[tuple[int, int, str]] = []
    for tid, tinfo in topic_map.items():
        if locked_domain and tinfo["domainId"] != locked_domain:
            continue

        score = 0
        for pat, weight in eq.TOPIC_RULES.get(tid, []):
            stem_hits = len(re.findall(pat, stem_l)) + len(re.findall(pat, scen_l))
            corr_hits = len(re.findall(pat, corr_l))
            opt_hits = len(re.findall(pat, opts_l))
            expl_hits = len(re.findall(pat, expl_l))
            score += (
                min(stem_hits, 3) * weight * 3
                + min(corr_hits, 2) * weight * 2
                + min(opt_hits, 2) * weight
                + min(expl_hits, 2) * weight
            )

        if not locked_domain:
            score += min(16, dom_scores.get(tinfo["domainId"], 0) // 2)

        tie_rank = -eq.DEFAULT_TOPIC_RANK.get(tid, 50)
        scores.append((score, tie_rank, tid))

    scores.sort(key=lambda x: (-x[0], -x[1], x[2]))
    best_score, _, best_tid = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else 0
    margin = best_score - max(0, second_score)
    return topic_map[best_tid], best_score, margin


def infer_cognitive_and_style(q: dict[str, Any]) -> tuple[str, str, int, list[str]]:
    """Determine cognitiveLevel, questionStyle, difficulty (1..5), and highlightKeywords."""
    stem = q["stem"]
    sl = stem.lower()
    wc = len(stem.split()) + (len((q.get("scenarioContext") or "").split()) // 2)

    kw_candidates = [
        "BEST", "FIRST", "MOST", "LEAST", "NOT", "EXCEPT", "PRIMARY", "PRIMARILY",
        "MAIN", "WEAKEST", "STRONGEST", "HIGHEST", "LOWEST", "FALSE", "TRUE",
        "ALWAYS", "NEVER", "NEXT", "ONLY", "INITIALLY", "CRITICAL", "GREATEST",
    ]
    highlight = [kw for kw in kw_candidates if re.search(rf"\b{kw}\b", stem)]
    if not highlight:
        for kw in ["FIRST", "BEST", "MOST", "LEAST", "NOT", "EXCEPT", "PRIMARY"]:
            if re.search(rf"\b{kw.lower()}\b", sl):
                highlight.append(kw)

    if q.get("questionFormat") == "matching":
        style = "concept_mapping"
        cog = "understand"
        diff = 3 if len(q.get("options", [])) >= 4 else 2
        return cog, style, diff, highlight

    if q.get("questionFormat") == "ordering":
        style = "first_action" if "order" in sl else "concept_mapping"
        cog = "apply"
        diff = 3
        return cog, style, diff, highlight

    if re.search(r"\b(calculate|how\s+many|annualized|sle|ale|aro\s*=|mtbf|how\s+much|files\s+will\s+be\s+copied|modulo|2\^)\b", sl) and re.search(r"\d", sl):
        style = "calculation"
    elif re.search(r"\b(first|next|initial(?:ly)?|before\s+anything\s+else|first\s+step)\b", sl):
        style = "first_action"
    elif re.search(r"\b(not|least|except|false|incorrect|never|least\s+likely|less\s+likely)\b", sl):
        style = "least_likely"
    elif re.search(r"\b(most\s+likely|weakest|strongest|highest|lowest|greatest|most\s+common)\b", sl):
        style = "most_likely"
    elif re.search(r"\b(best|most\s+effective|most\s+appropriate|primary|primarily|most\s+important|most\s+reliable|most\s+accurate)\b", sl):
        style = "best_answer"
    else:
        style = "concept_mapping"

    if style == "calculation":
        cog = "apply"
    elif style in {"best_answer", "first_action", "most_likely"} and (wc >= 28 or bool(q.get("scenarioContext"))):
        cog = "evaluate"
    elif style in {"least_likely"} and wc >= 25:
        cog = "analyze"
    elif re.search(r"\b(best|most\s+appropriate|most\s+effective|why\s+|which\s+concern|what\s+issue|root\s+cause|prevent)\b", sl):
        cog = "analyze" if wc >= 24 else "understand"
    elif re.search(r"\b(scenario|discovers|reviewing|receives|intercepts|analyzing|configured|implemented)\b", sl) or q.get("scenarioContext"):
        cog = "apply"
    elif re.search(r"\b(stand\s+for|port\s+number|what\s+layer|what\s+is\s+the\s+name|which\s+law|which\s+standard|which\s+protocol)\b", sl):
        cog = "remember"
    else:
        cog = "understand"

    base_diff = {"remember": 1, "understand": 2, "apply": 3, "analyze": 4, "evaluate": 4}[cog]
    if wc >= 48 and cog in {"analyze", "evaluate"}:
        base_diff = 5
    elif wc <= 15 and base_diff >= 3:
        base_diff -= 1
    diff = max(1, min(5, base_diff))

    return cog, style, diff, highlight


def build_option_explanations(
    q: dict[str, Any], topic_info: dict[str, Any]
) -> list[dict[str, Any]]:
    """Produce detailed per-option explanations and accurate trapTypes from the book prose."""
    expl = q["explanationText"]
    corr_id = q["correctAnswer"]
    corr_text = next(o["text"] for o in q["options"] if o["id"] == corr_id)
    sub_name = topic_info["subdomainName"]
    tid = topic_info["topicId"]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", expl.replace("\n", " ")) if len(s.strip()) >= 12]
    per_notes = q.get("perOptionNotes") or {}

    results: list[dict[str, Any]] = []
    for o in q["options"]:
        oid = o["id"]
        otext = o["text"]
        is_corr = oid == corr_id

        if oid in per_notes and len(per_notes[oid]) >= 20:
            exp_text = per_notes[oid]
        elif is_corr:
            lead = " ".join(sentences[:2]) if sentences else expl
            if len(lead) < 40:
                lead = expl
            if corr_text.lower() not in lead.lower() and len(corr_text) < 70:
                exp_text = f"Correct: '{corr_text}'. {lead}"
            else:
                exp_text = f"Correct choice. {lead}"
        else:
            # Find sentences in book explanation that mention this distractor's key terms
            tokens = [
                t.lower()
                for t in re.findall(r"[A-Za-z0-9.-]{3,}", otext)
                if t.lower() not in {"the", "and", "for", "with", "that", "this", "from", "are", "not", "all", "into", "over", "via", "more", "most", "less", "when", "used", "using", "only", "system", "security", "network", "data"}
            ]
            matched_sents = []
            for s in sentences[1:] if len(sentences) > 1 else sentences:
                sl = s.lower()
                if any(re.search(rf"(?<![a-z0-9]){re.escape(tok)}(?![a-z0-9])", sl) for tok in tokens):
                    matched_sents.append(s)

            if matched_sents:
                exp_text = f"Incorrect: {' '.join(matched_sents[:2])}"
            else:
                exp_text = (
                    f"Incorrect distractor under {sub_name} ({tid}): '{otext}' does not satisfy "
                    f"the scenario requirement addressed by '{corr_text}'."
                )

        if len(exp_text) < 20:
            exp_text = f"{exp_text} Review {topic_info['topicName']} ({tid}) principles to distinguish from '{corr_text}'."

        trap = None
        if not is_corr:
            trap = eq.classify_distractor_trap(
                otext, exp_text, q["stem"], topic_info["domainId"], corr_text
            )
            if trap not in eq.VALID_TRAP_TYPES:
                trap = "confuses_similar_terms"

        results.append({
            "id": oid,
            "text": otext,
            "isCorrect": is_corr,
            "explanation": exp_text.strip(),
            "trapType": trap,
        })

    return results


def build_references(q: dict[str, Any], expl_text: str, domain_id: str, subdomain_id: str) -> list[dict[str, str]]:
    """Build structured references citing the Official Practice Test chapter plus any named NIST/ISO/RFC standards."""
    refs: list[dict[str, str]] = [
        {
            "source": SOURCE_NAME,
            "section": f"Chapter {q['chapter']} ({q['chapterTitle']}), Question {q['questionNumber']}",
        }
    ]
    seen_sources = {refs[0]["source"]}

    std_patterns = [
        (r"NIST SP \d+-\d+[a-z0-9-]*", "NIST Special Publication"),
        (r"ISO(?:/IEC)? \d+(?:-\d+)?", "ISO/IEC Standard"),
        (r"RFC \d+", "IETF RFC"),
        (r"FIPS \d+(?:-\d+)?", "FIPS Standard"),
        (r"(?:PCI DSS|HIPAA|GDPR|SOX|GLBA|FERPA|FISMA|COPPA|DMCA)", "Regulatory / Compliance Framework"),
    ]
    combined = f"{q['stem']} {q.get('scenarioContext') or ''} {expl_text}"
    for pat, label in std_patterns:
        for m in re.findall(pat, combined, re.I):
            src = m.upper() if pat.endswith("DMCA)") or "RFC" in pat else m
            if src not in seen_sources:
                seen_sources.add(src)
                refs.append({"source": src, "section": f"{label} ({subdomain_id})"})
            if len(refs) >= 3:
                return refs
    return refs


def collect_existing_ids_and_max() -> tuple[set[str], dict[tuple[str, str], int]]:
    """Scan all existing JSON question files (excluding *-isc2-official-questions.json) to guarantee zero ID collisions."""
    existing_ids: set[str] = set()
    max_per_sub: dict[tuple[str, str], int] = defaultdict(lambda: 1000)
    for p in glob.glob(str(CONTENT_QUESTIONS_DIR / "**" / "*.json"), recursive=True):
        if Path(p).name.endswith("-isc2-official-questions.json"):
            continue
        items = json.loads(Path(p).read_text(encoding="utf-8"))
        for item in items:
            qid = item["id"]
            existing_ids.add(qid)
            m = re.match(r"^cissp-(d[1-8])-s(\d+\.\d+)-q(\d+)$", qid)
            if m:
                key = (m.group(1), m.group(2))
                max_per_sub[key] = max(max_per_sub[key], 1000, int(m.group(3)))
    return existing_ids, max_per_sub


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--write-content",
        action="store_true",
        help="Write final separate JSON files into src/content/questions/domain-{1..8}/d{1..8}-isc2-official-questions.json",
    )
    args = parser.parse_args()

    raw_data = json.loads(RAW_JSON_PATH.read_text(encoding="utf-8"))
    _, _, topic_map = eq.load_taxonomy()

    cleaned_qs, rect_report = rectify_and_dedup(raw_data["questions"])
    existing_ids, max_per_sub = collect_existing_ids_and_max()
    seq_counters: dict[tuple[str, str], int] = defaultdict(lambda: 1000, max_per_sub)

    by_domain: dict[str, list[dict[str, Any]]] = defaultdict(list)
    low_confidence: list[dict[str, Any]] = []
    cross_check_anomalies: list[dict[str, Any]] = []
    domain_counts = Counter()
    chapter_to_domain: dict[str, Counter[str]] = defaultdict(Counter)
    subdomain_counts = Counter()
    cog_counts = Counter()
    diff_counts = Counter()
    trap_counts = Counter()

    for q in cleaned_qs:
        topic_info, top_score, margin = classify_isc2_question(q, topic_map)
        did = topic_info["domainId"]      # dom-1..dom-8
        dshort = did.replace("dom-", "d")  # d1..d8
        sid = topic_info["subdomainId"]
        tid = topic_info["topicId"]

        seq_counters[(dshort, sid)] += 1
        seq = seq_counters[(dshort, sid)]
        qid = f"cissp-{dshort}-s{sid}-q{seq:04d}"
        assert qid not in existing_ids, f"ID collision detected: {qid}"
        existing_ids.add(qid)

        if top_score < 6 or (margin <= 1 and q.get("bookDomainId") is None):
            low_confidence.append({
                "sourceRef": q["sourceRef"],
                "chapter": q["chapter"],
                "assignedDomain": did,
                "assignedTopic": tid,
                "score": top_score,
                "margin": margin,
                "stem": q["stem"][:95],
            })

        # Ensure summary meets >= 40 chars
        summary_text = q["explanationText"].strip()
        if len(summary_text) < 40:
            corr_txt = next(o["text"] for o in q["options"] if o["id"] == q["correctAnswer"])
            summary_text = (
                f"{summary_text} Therefore, '{corr_txt}' is the correct answer under "
                f"{topic_info['subdomainName']} ({tid})."
            ).strip()

        cog, style, diff, highlight = infer_cognitive_and_style(q)
        persp = eq.infer_perspective(did, sid, q["stem"])

        # Adapter dict for eq.extract_key_terms & eq.build_mindset_and_takeaway
        q_adapter = {
            "stem": q["stem"],
            "options": q["options"],
            "correctAnswer": q["correctAnswer"],
            "explanation": {"fullText": summary_text},
        }
        concepts, key_terms = eq.extract_key_terms(q_adapter, topic_info)
        opts_enriched = build_option_explanations(q, topic_info)
        mindset_tip, study_dir, key_takeaway = eq.build_mindset_and_takeaway(
            q_adapter, topic_info, persp, summary_text, key_terms
        )
        refs = build_references(q, summary_text, did, sid)

        wc = len(q["stem"].split()) + sum(len(o["text"].split()) for o in q["options"])
        if q.get("scenarioContext"):
            wc += len(q["scenarioContext"].split()) // 2
        est_sec = min(180, max(35, int(30 + wc * 0.65 + (diff - 1) * 8)))

        tags = [
            f"domain-{topic_info['domainNumber']}",
            f"sub-{sid}",
            "isc2-official-practice",
            f"ch{q['chapter']}-q{q['questionNumber']}",
        ]
        if style == "calculation":
            tags.append("calculation")
        if persp in {"manager_governance", "risk_advisor"}:
            tags.append("think-like-a-manager")
        if q.get("questionFormat") in {"matching", "ordering"}:
            tags.append(f"converted-{q['questionFormat']}")

        # Sanity cross-check: ensure correct option isn't obviously contradicted as "wrong/incorrect"
        corr_exp = next(o["explanation"] for o in opts_enriched if o["isCorrect"]).lower()
        if "is incorrect" in corr_exp[:50]:
            cross_check_anomalies.append({"sourceRef": q["sourceRef"], "issue": "correct_expl_says_incorrect"})

        enriched = {
            "id": qid,
            "version": 1,
            "domainId": did,
            "subdomainId": sid,
            "subdomainName": topic_info["subdomainName"],
            "topicId": tid,
            "topicName": topic_info["topicName"],
            "cognitiveLevel": cog,
            "perspective": persp,
            "questionStyle": style,
            "difficulty": diff,
            "difficultyLabel": eq.DIFFICULTY_LABELS[diff],
            "estimatedTimeSeconds": est_sec,
            "conceptsTested": concepts,
            "keyTerms": key_terms,
            "tags": tags,
            "stem": q["stem"],
            "scenarioContext": q.get("scenarioContext"),
            "highlightKeywords": highlight,
            "options": opts_enriched,
            "explanation": {
                "correctOptionId": q["correctAnswer"],
                "summary": summary_text,
                "managerMindsetTip": mindset_tip,
                "studyFocusDirective": study_dir,
                "keyTakeaway": key_takeaway,
                "references": refs,
            },
        }

        # Strict Python-side QuestionSchema validation
        assert re.match(r"^cissp-d[1-8]-s\d+\.\d+-q\d{3,4}$", enriched["id"]), enriched["id"]
        assert len(enriched["stem"]) >= 30, (q["sourceRef"], enriched["stem"])
        assert len(enriched["options"]) == 4, (q["sourceRef"], enriched["options"])
        assert [o["id"] for o in enriched["options"]] == ["A", "B", "C", "D"], q["sourceRef"]
        assert sum(1 for o in enriched["options"] if o["isCorrect"]) == 1, q["sourceRef"]
        for o in enriched["options"]:
            assert len(o["explanation"]) >= 20, (q["sourceRef"], o)
            if o["isCorrect"]:
                assert o["trapType"] is None
                assert o["id"] == enriched["explanation"]["correctOptionId"]
            else:
                assert o["trapType"] in eq.VALID_TRAP_TYPES
                trap_counts[o["trapType"]] += 1
        assert len(enriched["explanation"]["summary"]) >= 40, (q["sourceRef"], len(enriched["explanation"]["summary"]))
        assert len(enriched["explanation"]["managerMindsetTip"]) >= 20
        assert len(enriched["explanation"]["studyFocusDirective"]) >= 20
        assert len(enriched["explanation"]["keyTakeaway"]) >= 20
        assert len(enriched["explanation"]["references"]) >= 1

        by_domain[did].append(enriched)
        domain_counts[did] += 1
        chapter_to_domain[f"ch{q['chapter']}"][did] += 1
        subdomain_counts[sid] += 1
        cog_counts[cog] += 1
        diff_counts[diff] += 1

    audit = {
        "inputBookQuestions": len(raw_data["questions"]),
        "uniqueEnrichedQuestions": len(cleaned_qs),
        "rectification": rect_report,
        "crossCheckAnomalies": cross_check_anomalies,
        "domainDistribution": dict(sorted(domain_counts.items())),
        "chapterToDomainDistribution": {k: dict(sorted(v.items())) for k, v in sorted(chapter_to_domain.items(), key=lambda kv: int(kv[0][2:]))},
        "subdomainCoverageCount": len(subdomain_counts),
        "subdomainDistribution": dict(sorted(subdomain_counts.items())),
        "cognitiveDistribution": dict(sorted(cog_counts.items())),
        "difficultyDistribution": dict(sorted(diff_counts.items())),
        "trapTypeDistribution": dict(sorted(trap_counts.items())),
        "lowConfidenceClassificationCount": len(low_confidence),
        "lowConfidenceSample": low_confidence[:50],
    }
    AUDIT_OUTPUT_PATH.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")

    out_base = CONTENT_QUESTIONS_DIR if args.write_content else STAGED_DIR
    for dom_num in range(1, 9):
        did = f"dom-{dom_num}"
        dom_dir = out_base / f"domain-{dom_num}"
        dom_dir.mkdir(parents=True, exist_ok=True)
        out_file = dom_dir / f"d{dom_num}-isc2-official-questions.json"
        out_file.write_text(
            json.dumps(by_domain[did], indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {len(by_domain[did]):4d} questions -> {out_file}")

    print("\nAudit summary:")
    print(json.dumps({k: v for k, v in audit.items() if k != "lowConfidenceSample"}, indent=2))


if __name__ == "__main__":
    main()
