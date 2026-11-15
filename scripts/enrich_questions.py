#!/usr/bin/env python3
"""
Review, verify, deduplicate, classify, and enrich all questions from:
  scripts/extracted/certkingdom_1373_raw.json

Maps every unique question accurately to the canonical taxonomy:
  src/content/taxonomy/cissp-cbk-2026.json

Enriches all fields required by QuestionSchema (src/content.config.ts):
  - Hierarchical IDs (domainId, subdomainId, subdomainName, topicId, topicName)
  - Diagnostic metadata (cognitiveLevel, perspective, questionStyle, difficulty,
    difficultyLabel, estimatedTimeSeconds, conceptsTested, keyTerms, tags)
  - Per-option explanations (>=20 chars) and DistractorTrapTypeEnum trapType
  - Explanation summary (>=40 chars), managerMindsetTip, studyFocusDirective,
    keyTakeaway, and structured references[]

Outputs enriched domain JSON arrays either to a staging directory (--stage)
or directly into src/content/questions/domain-{1..8}/d{1..8}-certkingdom-questions.json.
"""

from __future__ import annotations

import argparse
import glob
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_JSON_PATH = REPO_ROOT / "scripts" / "extracted" / "certkingdom_1373_raw.json"
TAXONOMY_PATH = REPO_ROOT / "src" / "content" / "taxonomy" / "cissp-cbk-2026.json"
CONTENT_QUESTIONS_DIR = REPO_ROOT / "src" / "content" / "questions"
AUDIT_OUTPUT_PATH = REPO_ROOT / "scripts" / "extracted" / "enrichment_audit.json"

# Valid enum values from src/content.config.ts
VALID_TRAP_TYPES = {
    "technical_fix_over_process",
    "wrong_lifecycle_phase",
    "extreme_absolutist",
    "confuses_similar_terms",
    "solves_wrong_problem",
    "premature_escalation",
    "ignores_human_safety",
    "cost_disproportionate",
    "incomplete_partial_answer",
}

DIFFICULTY_LABELS = {
    1: "foundational",
    2: "intermediate",
    3: "advanced",
    4: "exam_hard",
    5: "cat_stretch",
}

# Verified errata / book-corruption fixes discovered during extraction audit
SKIP_QUESTION_NUMBERS = {
    231,   # Corrupted 3-option copy; Q485 is the complete 4-option version
    1065,  # Book answer-key typo ("C: Incident Protection"); Q1160 has fixed key ("D: Incident Response")
}

ANSWER_KEY_OVERRIDES = {
    971: "B",  # Book typo marked D (B2); TCSEC C2 introduces object reuse (confirmed by book Q917 & Q1093)
}

# Short stems (<30 chars in book) expanded gently without altering question meaning
SHORT_STEM_EXPANSIONS = {
    5: "In enterprise identity and access management, what is Kerberos?",
    163: "Within an information security program, controls are primarily implemented to:",
    169: "In security operations and access control, detective/technical measures:",
    192: "In user authentication mechanisms, what are cognitive passwords?",
    194: "According to security monitoring findings, most access violations are:",
    208: "In security governance documentation, what is a security policy?",
    336: "In perimeter network architecture, a demilitarized zone (DMZ) is:",
    337: "In a typical perimeter network design, a DMZ is located:",
    340: "In network security architecture, a DMZ is also known as a:",
    458: "In TCP/IP networking, what is an IP routing table?",
    470: "In secure remote communications, another name for a VPN is a:",
    477: "In social engineering and information gathering, what is Dumpster Diving?",
    559: "Within an information security program, controls are primarily implemented to:",
    566: "To align with business objectives, IT security measures should:",
    662: "In software development methodologies, what does RAD stand for and represent?",
    677: "Which of the following characteristics is Java NOT designed to be?",
    950: "To support accountability and auditing, attributable data should be:",
    1005: "In operating system security controls, what is a trusted shell?",
    1052: "In storage architecture comparisons, RAID levels 3 and 5 run:",
    1110: "During backup operations, an incremental backup process:",
    1201: "In disaster recovery planning, what is a hot-site facility?",
    1207: "In offsite data protection strategies, what is electronic vaulting?",
    1271: "In security governance and legal standards, due care is NOT related to:",
    1294: "In physical and social engineering threats, what is Dumpster Diving?",
}

# Hand-verified explanations for the book's empty-explanation questions
EMPTY_EXPLANATION_AUTHORED = {
    29: (
        "Smartcards serve as tamper-resistant, portable hardware tokens that securely store a user's PKI private key "
        "and perform cryptographic operations on-card so the private key never leaves the hardware boundary."
    ),
    41: (
        "Biometrics authenticates individuals based on unique physiological or behavioral characteristics "
        "(Type 3: something you are), such as fingerprints, retina scans, or iris patterns."
    ),
    57: (
        "A static password remains unchanged across login sessions until manually reset, making it vulnerable to "
        "replay, shoulder surfing, and credential theft compared to one-time passwords."
    ),
    88: (
        "A signature-based Intrusion Detection System (IDS) compares observed traffic or system activity against "
        "a database of known attack patterns (signatures) to detect previously characterized threats."
    ),
    202: (
        "The Bell-LaPadula model, developed for the U.S. military in the 1970s, was the first formal mathematical "
        "state-machine model for multilevel security enforcing confidentiality ('no read up, no write down')."
    ),
    203: (
        "A password's primary function is authentication—verifying the claimed identity of a user (typically via "
        "a Type 1 'something you know' factor) after an identifier such as a username is presented."
    ),
    204: (
        "The three classic authentication factors are: something you know (Type 1, e.g., password), something you "
        "have (Type 2, e.g., token/smartcard), and something you are (Type 3, e.g., biometrics)."
    ),
    205: (
        "The Principle of Least Privilege requires granting subjects only the minimum permissions and access rights "
        "strictly necessary to perform their authorized job functions, limiting accidental or malicious damage."
    ),
    277: (
        "IPsec (Network layer, Layer 3) and L2TP (Data Link layer, Layer 2, often paired with IPsec) operate at "
        "the lower layers of the OSI model to establish encrypted VPN tunnels."
    ),
    278: (
        "Internet Key Exchange (IKE) handles mutual peer authentication and negotiates Security Associations (SAs) "
        "and shared cryptographic keys dynamically for IPsec sessions."
    ),
    281: (
        "In standard SSL/TLS handshakes, the server must authenticate itself to the client via an X.509 certificate, "
        "while client certificate authentication (mutual TLS) is optional based on server policy."
    ),
    452: (
        "IPsec Transport mode encrypts only the IP payload between two end hosts and is NOT suitable for site-to-site "
        "VPN gateways; Tunnel mode is required for gateways encapsulating entire packets between networks."
    ),
    470: (
        "A Virtual Private Network (VPN) creates an encrypted logical 'tunnel' across an untrusted public network "
        "such as the Internet to protect data confidentiality and integrity in transit."
    ),
    513: (
        "A threat is any potential event, circumstance, or actor capable of exploiting a vulnerability and causing "
        "harm to an organization's information assets or systems."
    ),
    514: (
        "A vulnerability is a flaw, weakness, or missing safeguard in a system, procedure, or control that can be "
        "exploited by a threat to compromise security."
    ),
    515: (
        "Risk is the likelihood (probability) that a specific threat will exploit a vulnerability combined with "
        "the resulting business impact or potential loss."
    ),
    579: (
        "A procedure provides detailed, mandatory step-by-step instructions explaining how personnel must execute "
        "tasks to comply with higher-level security policies and standards."
    ),
    629: (
        "Application controls are embedded directly within specific business applications to validate inputs, "
        "processing, and outputs—making them visible and dependent on application logic rather than transparent."
    ),
    634: (
        "A Database Management System (DBMS) is the software layer that stores, organizes, enforces access controls, "
        "and mediates user or application queries to underlying databases."
    ),
    706: (
        "Security must be integrated from the earliest Requirements / Initiation phase of the SDLC ('shift left') "
        "because fixing architectural flaws late in testing or production is exponentially more expensive."
    ),
    707: (
        "Content-dependent access control inspects actual data values or payloads before granting access, which "
        "provides fine-grained protection at the cost of higher CPU and processing overhead."
    ),
    708: (
        "Java applets execute downloaded code locally on a client browser; if sandbox restrictions are bypassed or "
        "misconfigured, untrusted executable code from the Internet can attack the local host."
    ),
    709: (
        "When an infected system file cannot be safely disinfected without risking corruption or lingering rootkits, "
        "restoring a known-good, patched copy from verified clean backup media is the safest remediation."
    ),
    753: (
        "Digital signatures hash the message and encrypt the digest with the sender's private key, providing data "
        "integrity, origin authentication, and non-repudiation (they do not provide confidentiality)."
    ),
    763: (
        "RSA asymmetric cryptography bases its security on the computational difficulty of factoring the product "
        "of two very large prime numbers into its original prime factors."
    ),
    770: (
        "In a hierarchical PKI trust model, the Root Certification Authority (Root CA) sits at the apex of trust "
        "and is also referred to as the Top Level CA or trust anchor."
    ),
    779: (
        "The European Union Directive on Electronic Signatures established legal equivalence for qualified electronic "
        "signatures, ensuring non-repudiation and legal enforceability across EU member states."
    ),
    780: (
        "An X.509 certificate's 'nonRepudiation' (contentCommitment) keyUsage bit designates a public key used to "
        "verify digital signatures so the signer cannot plausibly deny signing the message."
    ),
    876: (
        "The Data Encryption Algorithm (DEA), used by DES, processes 64-bit blocks through 16 Feistel rounds of "
        "substitution (S-boxes) and permutation (P-boxes) using 48-bit round subkeys."
    ),
    877: (
        "A digital signature binds a message hash to the signer's private key, enabling any recipient with the "
        "signer's public key to verify both message origin (authenticity) and integrity."
    ),
    934: (
        "In the TCSEC (Orange Book), trust divisions progress from highest assurance to lowest: A (Verified Protection), "
        "B (Mandatory Protection), C (Discretionary Protection), and D (Minimal Protection)."
    ),
    941: (
        "TCSEC Division C (C1 and C2) specifies Discretionary Protection, enforcing need-to-know and discretionary "
        "access controls where resource owners govern object permissions."
    ),
    948: (
        "Access control follows a strict logical sequence: Identification (claiming an identity), Authentication "
        "(proving the identity), Authorization (evaluating permissions), and Accountability (auditing actions)."
    ),
    971: (
        "TCSEC C2 (Controlled Access Protection) introduces object reuse protection (clearing residual data in memory/disk "
        "before reallocation) alongside individual user accountability and security auditing."
    ),
    1000: (
        "Logical separation isolates running processes in memory and execution contexts (such as virtual memory "
        "address spaces) so a process cannot read or modify objects outside its assigned domain."
    ),
    1035: (
        "Media clearing/sanitization removes or purges data at end of life rather than preserving media viability; "
        "controls protecting media viability include environmental controls, physical safeguards, and preventive maintenance."
    ),
    1038: (
        "Trusted recovery ensures that after a system crash or failure, security controls and access boundaries "
        "cannot be bypassed and the system returns to a known secure state."
    ),
    1078: (
        "Salami attacks (salami slicing) involve an insider stealing minuscule amounts—such as fractions of a cent—from "
        "numerous accounts repeatedly so individual discrepancies go unnoticed while accumulating significant totals."
    ),
    1106: (
        "A degausser generates a powerful AC or DC magnetic field to randomize magnetic domains on tapes or hard "
        "drives, purging stored data and permanently rendering magnetic media unreadable."
    ),
    1134: (
        "A Business Impact Analysis (BIA) identifies critical business functions, prioritizes them by operational "
        "and financial impact, and establishes Recovery Time Objectives (RTOs) and Recovery Point Objectives (RPOs)."
    ),
    1135: (
        "Under standard BIA methodology, senior management authorization/initiation precedes the BIA itself; "
        "notifying senior management of assessment start is not one of the eight technical BIA execution steps."
    ),
    1141: (
        "Commercial Crime Insurance policies cover direct financial losses such as theft or embezzlement of "
        "money and securities caused by internal or external fraudulent acts."
    ),
    1199: (
        "Business Continuity Plans (BCPs) must encompass all critical areas across the entire enterprise—not just IT—"
        "because human safety, facilities, communications, and business units all depend on coordinated continuity."
    ),
    1200: (
        "A Business Impact Analysis (BIA) identifies critical functions, RTO/RPO, MTD, and dependencies, whereas "
        "specific emergency contact rosters belong in the Disaster Recovery Plan (DRP) / Crisis Communications Plan."
    ),
    1201: (
        "A hot site is a fully equipped, pre-configured alternate processing facility with installed hardware, power, "
        "HVAC, and telecommunications ready to assume operations within hours of a disaster."
    ),
    1252: (
        "Downstream liability refers to legal and contractual accountability when an organization's compromised "
        "systems or negligence expose interconnected partner networks (such as extranets) to harm."
    ),
    1288: (
        "To be admissible in court, digital evidence must first satisfy fundamental evidentiary rules: it must be "
        "relevant (proving or disproving a material fact), authentic, reliable, and legally obtained."
    ),
    1315: (
        "Class C fires involve energized electrical equipment and require non-conductive extinguishing agents "
        "(such as CO2 or clean agents like FM-200) rather than water or conductive foam."
    ),
    1349: (
        "Relative humidity above 60% promotes moisture condensation on circuit boards and connectors, causing "
        "corrosion and short-circuiting of sensitive computing hardware."
    ),
    1352: (
        "Relative humidity below 40% dries the air and sharply increases electrostatic discharge (ESD / static "
        "electricity) buildup, which can damage sensitive microelectronics."
    ),
    1367: (
        "A Class C extinguisher uses non-conductive agents safe for energized electrical equipment, whereas a "
        "Class A water-based extinguisher poses severe electrocution and equipment-shorting hazards."
    ),
}

# ---------------------------------------------------------------------------
# Comprehensive Micro-Topic Classifier Rules for all 95 CISSP CBK 2026 Topics
# ---------------------------------------------------------------------------
# Each topicId maps to weighted regex patterns (pattern, weight).
TOPIC_RULES: dict[str, list[tuple[str, int]]] = {
    # Domain 1: Security and Risk Management
    "1.1.1": [(r"\b(isc2|isc\s*2)\s+code\s+of\s+ethics|\bcanons?\b|\bprotect\s+society\b|\bcommon\s+good\b|\bdiligent\s+and\s+competent\b", 18)],
    "1.1.2": [(r"\b(ethics|ethical|unethical|whistleblow|conflict\s+of\s+interest|rfc\s*1087|code\s+of\s+conduct|ten\s+commandments\s+of\s+computer\s+ethics)\b", 14)],
    "1.2.1": [(r"\b(cia\s+triad|confidentiality,\s*integrity|parkerian\s+hexad|disclosure,\s*alteration,\s*destruction|\bdad\s+triad)\b", 16), (r"\b(confidentiality|integrity|availability)\b", 2)],
    "1.2.2": [(r"\bnon-?repudiation\b|\bauthenticity\b", 10)],
    "1.3.1": [(r"\b(security\s+governance|steering\s+committee|board\s+of\s+directors|align\w*\s+with\s+(business|mission)|corporate\s+governance|ultimate\s+responsibility|security\s+program\s+management)\b", 14)],
    "1.3.2": [(r"\b(senior\s+manager\s+responsibility|roles\s+and\s+responsibilities|security\s+officer|ciso|chief\s+information\s+security)\b", 13)],
    "1.3.3": [(r"\b(cobit|sabsa|itil|iso\s*/?\s*iec\s*27001|iso\s*27002|iso\s*17799|nist\s+csf|zachman|togaf|coso|octave)\b", 16)],
    "1.4.1": [
        (r"\b(threat\s+actor|exposure\s+factor|residual\s+risk|inherent\s+risk|total\s+risk|control\s+gap|risk\s+terminology|threat\s+coupled\s+with)\b", 14),
        (r"\b((administrative|preventive|detective|corrective|deterrent|compensating|recovery)\s+controls?|add-?on\s+security)\b", 10),
        (r"\b((technical|logical|physical)\s+controls?|security\s+controls?)\b", 6),
        (r"\b(threat|vulnerability|risk)\b", 2),
    ],
    "1.4.2": [(r"\b(\bale\b|\bsle\b|\baro\b|\bav\b|\bef\b|annualized\s+loss|single\s+loss\s+expectancy|annualized\s+rate\s+of\s+occurrence|cost[- ]benefit|safeguard\s+value|quantitative\s+risk)\b", 18)],
    "1.4.3": [(r"\b(qualitative\s+risk|delphi\s+technique|risk\s+matrix|frap|cramm)\b", 16)],
    "1.4.4": [(r"\b(risk\s+(mitigation|transference|transfer|acceptance|avoidance|treatment)|insurance\s+policy|crime\s+insurance|downstr?eam\s+liabilit|countermeasure|safeguard)\b", 12)],
    "1.5.1": [(r"\b(stride|pasta|dread|vast|threat\s+model)\b", 18)],
    "1.5.2": [(r"\b(attack\s+tree|reduction\s+analysis)\b", 16)],
    "1.6.1": [(r"\b(supply\s+chain|third[- ]party|vendor\s+risk|outsourc|offshor)\b", 13)],
    "1.6.2": [(r"\b(\bsla\b|service\s+level\s+agreement|\bnda\b|non-?disclosure|\bmou\b|\bisa\b|interconnection\s+security|right[- ]to[- ]audit|memorandum\s+of\s+understanding)\b", 16)],
    "1.7.1": [(r"\b(copyright|patent|trade\s+secret|trademark|intellectual\s+property|dmca|computer\s+fraud\s+and\s+abuse|cfaa|economic\s+espionage|tort\s+law|criminal\s+law|civil\s+law|administrative\s+law|common\s+law|felony|misdemeanor|liability|entrapment|enticement|import/?export)\b", 15)],
    "1.7.2": [(r"\b(gdpr|hipaa|glba|gramm[- ]leach|sox|sarbanes[- ]oxley|pci[- ]dss|ferpa|coppa|ccpa|fisma|ecpa|electronic\s+communications\s+privacy|eu\s+directive|privacy\s+act|oecd)\b", 16)],
    "1.7.3": [(r"\b(transborder|cross[- ]border|safe\s+harbor|binding\s+corporate\s+rules)\b", 18)],
    "1.8.1": [(r"\b(security\s+policy|policies,\s*standards|policy\s+hierarchy|guideline|procedure|advisory\s+policy|informative\s+policy|regulatory\s+policy|acceptable\s+use\s+policy|high-?level\s+statements?,\s*beliefs|goals\s+and\s+objectives)\b", 15)],
    "1.8.2": [(r"\b(security\s+baseline|scoping|tailoring|minimum\s+level\s+of\s+security)\b", 12)],
    "1.9.1": [(r"\b(business\s+continuity\s+plan|\bbcp\b|bcp\s+project|project\s+initiation|contingency\s+plan)\b", 14)],
    "1.9.2": [(r"\b(business\s+impact\s+analysis|business\s+impact\s+assessment|\bbia\b|\bmtd\b|maximum\s+tolerable\s+downtime|\brto\b|\brpo\b|\bwrt\b|recovery\s+time\s+objective|recovery\s+point\s+objective)\b", 18)],
    "1.10.1": [(r"\b(background\s+check|pre-?employment|screening|onboarding|hiring|non-?compete|job\s+description|personnel\s+security)\b", 15)],
    "1.10.2": [(r"\b(job\s+rotation|mandatory\s+vacation|separation\s+of\s+duties|segregation\s+of\s+duties|collusion)\b", 16)],
    "1.10.3": [(r"\b(termination|offboarding|exit\s+interview|revoke\s+access|dismissal|hostile\s+termination|firing)\b", 15)],
    "1.11.1": [(r"\b(security\s+awareness|awareness,\s*training,\s*(and\s*)?education|training\s+vs\.?\s*education|security\s+training)\b", 16)],
    "1.11.2": [(r"\b(phishing\s+simulation|awareness\s+program\s+metric|social\s+engineering\s+awareness)\b", 14)],
    "1.12.1": [(r"\b(prudent\s+person|prudent\s+man)\b", 18)],
    "1.12.2": [(r"\b(due\s+care\s+and\s+due\s+diligence|due\s+care|due\s+diligence)\b", 15)],

    # Domain 2: Asset Security
    "2.1.1": [(r"\b(data\s+classification|private\s+sector\s+data\s+classification|sensitivity\s+label|classification\s+level|confidential\s+data)\b", 16), (r"\b(top\s+secret|secret,\s*confidential|unclassified|proprietary)\b", 8)],
    "2.1.2": [(r"\b(fips\s*199|asset\s+inventory|asset\s+valuation|categorization|information\s+asset)\b", 15)],
    "2.2.1": [(r"\b(data\s+controller|data\s+processor|data\s+owner|information\s+owner)\b", 16)],
    "2.2.2": [(r"\b(data\s+custodian|custodian)\b", 16)],
    "2.3.1": [(r"\b(pii|personally\s+identifiable|phi|protected\s+health|cardholder\s+data|sensitive\s+data|privacy\s+protection)\b", 13)],
    "2.3.2": [(r"\b(anonymization|pseudonymization|tokenization|data\s+masking|aggregation|inference\s+attack|polyinstantiation)\b", 16)],
    "2.4.1": [(r"\b(record\s+retention|retention\s+schedule|data\s+retention|archival\s+retention|media\s+viability)\b", 16)],
    "2.4.2": [(r"\b(media\s+sanitization|nist\s+sp\s*800-?88|degauss|degausser|clearing|purging|shredding|incinerat|pulveriz|data\s+remanence|cryptographic\s+erase|overwriting|sanitiz)\b", 18)],
    "2.5.1": [(r"\b(data\s+at\s+rest|data\s+in\s+transit|data\s+in\s+use|data\s+in\s+motion)\b", 16)],
    "2.5.2": [(r"\b(data\s+loss\s+prevention|\bdlp\b|\bcasb\b|cloud\s+access\s+security\s+broker|egress\s+filter)\b", 16)],
    "2.6.1": [(r"\b(marking,\s*labeling|media\s+handling|media\s+labeling|courier|data\s+destruction\s+policy|media\s+storage)\b", 15)],

    # Domain 3: Security Architecture and Engineering
    "3.1.1": [(r"\b(saltzer|schroeder|fail-?safe|fail-?secure|fail-?open|fail-?closed|economy\s+of\s+mechanism|complete\s+mediation|open\s+design|least\s+common\s+mechanism|psychological\s+acceptability)\b", 18)],
    "3.1.2": [(r"\b(defense\s+in\s+depth|layered\s+security|zero\s+trust|compartmentalization)\b", 13)],
    "3.2.1": [(r"\b(bell-?lapadula|simple\s+security\s+property|\*[- ]property|star\s+property|no\s+read\s+up|no\s+write\s+down|lattice[- ]based|multilevel[- ]security|multi-?level\s+security)\b", 22)],
    "3.2.2": [(r"\b(biba|clark-?wilson|simple\s+integrity|invocation\s+property|well-?formed\s+transaction|transformation\s+procedure|constrained\s+data\s+item|separation\s+of\s+duty\s+integrity)\b", 18)],
    "3.2.3": [(r"\b(brewer-?nash|chinese\s+wall|graham-?denning|take-?grant|noninterference|information\s+flow\s+model|state\s+machine\s+model|harrison-?ruzzo)\b", 18)],
    "3.3.1": [(r"\b(common\s+criteria|iso\s*15408|\btoe\b|target\s+of\s+evaluation|protection\s+profile|security\s+target|\beal\d?\b|tcsec|orange\s+book|itsec|rainbow\s+series|red\s+book)\b", 20)],
    "3.3.2": [(r"\b(certification\s+and\s+accreditation|\bc&a\b|certification\s+vs\.?\s*accreditation|accreditation|\bditscap\b|\bdiacap\b|\bnist\s+rmf\b|niaccap)\b", 18)],
    "3.4.1": [(r"\b(protection\s+ring|ring\s*0|supervisor\s+mode|user\s+mode|kernel\s+mode|reference\s+monitor|security\s+kernel|\btcb\b|trusted\s+computing\s+base|\btpm\b|\bhsm\b|hardware\s+security\s+module|memory\s+protection|process\s+isolation|covert\s+channel|time[- ]of[- ]check|toctou|trusted\s+path|trusted\s+shell|trusted\s+recovery|object\s+reuse|cpu\s+architecture|multitasking|multiprocessing|eprom|eeprom|ram\b|rom\b)\b", 16)],
    "3.5.1": [(r"\b(hypervisor|type\s*1|type\s*2|vm\s+escape|virtual\s+machine|virtualization|container)\b", 14)],
    "3.5.2": [(r"\b(cloud\s+computing|iaas|paas|saas|shared\s+responsibility|public\s+cloud|private\s+cloud|hybrid\s+cloud|community\s+cloud|cloud\s+deployment)\b", 18)],
    "3.5.3": [(r"\b(\bics\b|\bscada\b|\biot\b|embedded\s+system|plc|rtu|thin\s+client|diskless\s+workstation|grid\s+computing|peer-?to-?peer)\b", 15)],
    "3.6.1": [(r"\b(\baes\b|rijndael|\bdes\b|\b3des\b|triple\s+des|blowfish|twofish|idea\b|rc4|rc5|rc6|chacha20|one[- ]time\s+pad|vernam|stream\s+cipher|block\s+cipher|\becb\b|\bcbc\b|\bcfb\b|\bofb\b|\bctr\b|\bgcm\b|symmetric\s+(encryption|cryptography|cipher|key)|initialization\s+vector|\biv\b|feistel|s-?box|confusion\s+and\s+diffusion|exclusive[- ]or|\bxor\b|steganography|link\s+encryption|end-?to-?end\s+encryption|skipjack|cast-?128)\b", 18)],
    "3.6.2": [(r"\b(\brsa\b|elliptic\s+curve|\becc\b|diffie-?hellman|el\s*gamal|knapsack|asymmetric\s+(encryption|cryptography|algorithm|key)|public[- ]key\s+(cryptography|encryption)|prime\s+number|factoring|discrete\s+logarithm|quantum\s+cryptography|hybrid\s+encryption)\b", 18)],
    "3.7.1": [(r"\b(\bsha-?\d*\b|\bmd5\b|\bmd4\b|\bhaval\b|ripemd|tiger\b|\bhmac\b|message\s+digest|hash\s+(function|value|algorithm)|one[- ]way\s+hash|collision)\b", 17)],
    "3.7.2": [(r"\b(digital\s+signature|\bpki\b|public\s+key\s+infrastructure|x\.?509|certificate\s+authority|\bca\b|registration\s+authority|\bra\b|\bcrl\b|\bocsp\b|cross[- ]certification|trust\s+anchor|root\s+ca|\bpgp\b|web\s+of\s+trust|s/mime|electronic\s+signature)\b", 17)],
    "3.7.3": [(r"\b(key\s+(escrow|recovery|management|distribution|lifetime|rotation|destruction|archival)|split\s+knowledge|k-?of-?n|m\s+of\s+n|session\s+key|symmetric\s+key\s+distribution)\b", 14)],
    "3.8.1": [(r"\b(cryptanalysis|known[- ]plaintext|chosen[- ]plaintext|chosen[- ]ciphertext|ciphertext[- ]only|birthday\s+attack|meet[- ]in[- ]the[- ]middle|side[- ]channel|differential\s+cryptanalysis|linear\s+cryptanalysis|rainbow\s+table|frequency\s+analysis|work\s+factor|brute\s+force\s+key|algebraic\s+attack|timing\s+attack|power\s+analysis|van\s+eck|tempest|emanation)\b", 18)],
    "3.9.1": [(r"\b(cpted|crime\s+prevention\s+through\s+environmental\s+design|site\s+selection|facility\s+design|natural\s+surveillance|territorial\s+reinforcement)\b", 18)],
    "3.10.1": [(r"\b(mantrap|bollard|fence|gate|turnstile|cipher\s+lock|deadbolt|warded\s+lock|tumbler\s+lock|lighting|foot-?candle|motion\s+detector|passive\s+infrared|ultrasonic|microwave\s+detector|photoelectric|perimeter\s+security|glass\s+break|cctv|wall\s+fire\s+rating|fire\s+rating|internal\s+walls?|hour-?rated|drop\s+ceiling|true\s+floor|locks,\s*gates|physical\s+access\s+control)\b", 18)],
    "3.10.2": [(r"\b(\bhvac\b|humidity|static\s+electricity|corrosion|\bups\b|uninterruptible\s+power|generator|power\s+line|spike|surge|blackout|brownout|sag|fault\b|transient|fire\s+(suppression|extinguisher|tetrahedron)|class\s+[a-dk]\s+fire|halon|fm-?200|clean\s+agent|wet\s+pipe|dry\s+pipe|pre-?action|deluge|sprinkler|ionization\s+smoke|photoelectric\s+smoke)\b", 18)],

    # Domain 4: Communication and Network Security
    "4.1.1": [(r"\b(osi\s+model|osi\s+layer|iso/osi|physical\s+layer|data\s+link\s+layer|network\s+layer|transport\s+layer|session\s+layer|presentation\s+layer|llc|802\.2|802\.3|tcp/ip|ipv4|ipv6|well\s+known\s+ports|port\s+number|iana|udp\b|tcp\b|icmp\b|arp\b|rarp\b|encapsulation|pdu|coaxial|twisted\s+pair|fiber\s+optic|attenuation|crosstalk|baseband|broadband|csma/cd|csma/ca|token\s+ring|fddi|sonet|atm\b|frame\s+relay|x\.25|mpls|isdn|dsl|t1\s+facilit|1\.544\s*mbps|ds-?[0123]|intranet|packet\s+switching|common\s+data\s+network|framing\s+specification)\b", 16)],
    "4.1.2": [(r"\b(ipsec|\bah\b|authentication\s+header|\besp\b|encapsulating\s+security\s+payload|tunnel\s+mode|transport\s+mode|\bike\b|isakmp|security\s+association|\btls\b|\bssl\b|\bssh\b|pptp|l2tp|l2f|chap|pap|eap|ppp)\b", 17)],
    "4.1.3": [(r"\b(802\.11|wi-?fi|wep\b|wpa\b|wpa2|wpa3|tkip|ccmp|ssid|war\s*driving|bluetooth|802\.1x|wireless|rfid|nfc|cdma|gsm|wap|wtls)\b", 20)],
    "4.2.1": [(r"\b(firewall|packet\s+filter|stateful\s+inspection|application[- ]level\s+gateway|application\s+layer\s+firewall|circuit[- ]level\s+gateway|bastion\s+host|proxy\s+server|proxies|socks|network\s+access\s+control|\bnac\b|router|switch|bridge|repeater|hub|screened\s+host|dual-?homed)\b", 18)],
    "4.2.2": [(r"\b(vlan|dmz|demilitarized\s+zone|screened\s+subnet|three-?legged\s+firewall|micro-?segmentation|network\s+segmentation|nat\b|pat\b|cidr|subnet|rfc\s*1918|private\s+ip|sdn|sd-?wan|sase|ip\s+routing\s+table)\b", 22)],
    "4.3.1": [(r"\b(voip|sip\b|rtp|h\.323|email\s+security|e-?mail|smtp|pop3|imap|spf\b|dkim|dmarc|pem\b|pbx|toll\s+fraud|phreaking|caller\s+id|callback)\b", 18)],
    "4.3.2": [(r"\b(\bvpn\b|virtual\s+private\s+network|split\s+tunnel|remote\s+access|ras\b|wardialing|modem|dnssec|dns\s+poisoning|cdn\b|dial-?up|smurf|fraggle|land\s+attack|syn\s+flood|teardrop|ddos|ping\s+of\s+death|denial[- ]of[- ]service)\b", 16)],

    # Domain 5: Identity and Access Management (IAM)
    "5.1.1": [(r"\b(access\s+control\s+matrix|access\s+control\s+policy|subject\s+and\s+object|capability\s+list|acl\b|access\s+control\s+list|constrained\s+user\s+interface|content[- ]dependent|warning\s+banner|login\s+banner|notify.*monitoring|effective\s+cost\s+of\s+access\s+control)\b", 15)],
    "5.1.2": [(r"\b(smart\s*card|token\s+device|synchronous\s+token|asynchronous\s+token|dynamic\s+password\s+token|memory\s+card|magnetic\s+stripe|badge|physical\s+access\s+log)\b", 16)],
    "5.2.1": [(r"\b(two-?factor|multi-?factor|\bmfa\b|something\s+you\s+(know|have|are)|cognitive\s+password|static\s+password|one-?time\s+password|\botp\b|passphrase|password\s+aging|dictionary\s+attack|brute\s+force\s+password|\bpin\b|confidential\s+number|password)\b", 16)],
    "5.2.2": [(r"\b(biometric|fingerprint|iris\s+scan|retina\s+scan|hand\s+geometry|voice\s+pattern|keystroke\s+dynamics|signature\s+dynamics|\bfar\b|\bfrr\b|\bcer\b|crossover\s+error\s+rate|false\s+accept|false\s+reject|type\s+i\s+error|type\s+ii\s+error|throughput\s+rate|enrollment\s+time)\b", 22)],
    "5.2.3": [(r"\b(fido2|webauthn|passkey|passwordless)\b", 20)],
    "5.3.1": [(r"\b(\bsaml\b|oauth|openid|oidc|federated\s+identity|single\s+sign-?on|\bsso\b|sesame|krypto-?knight|liberty\s+alliance)\b", 18)],
    "5.3.2": [(r"\b(kerberos|\bkdc\b|\btgt\b|\btgs\b|ticket\s+granting|radius|tacacs\+?|xtacacs|diameter|\bldap\b|directory\s+service|active\s+directory)\b", 22)],
    "5.4.1": [(r"\b(discretionary\s+access\s+control|\bdac\b|mandatory\s+access\s+control|\bmac\b|role-?based\s+access|\brbac\b|rule-?based\s+access|\brubac\b|non-?discretionary|\bndac\b|attribute-?based|\babac\b|task-?based|context-?dependent|access\s+control\s+model)\b", 18)],
    "5.5.1": [(r"\b(provisioning|deprovisioning|privilege\s+creep|access\s+review|account\s+attestation|identity\s+lifecycle|account\s+management|identity\s+management)\b", 14)],
    "5.6.1": [(r"\b(privileged\s+access|\bpam\b|just-?in-?time|\bjit\b|credential\s+vault|service\s+account|privileged\s+account)\b", 15)],

    # Domain 6: Security Assessment and Testing
    "6.1.1": [(r"\b(security\s+assessment|internal\s+audit|external\s+audit|third-?party\s+assessment|security\s+testing\s+strategy|nist\s+sp\s*800-?26)\b", 14)],
    "6.1.2": [(r"\b(rules\s+of\s+engagement|\broe\b|scope\s+of\s+the\s+test|authorization\s+to\s+test)\b", 17)],
    "6.2.1": [(r"\b(penetration\s+test|pen\s*test|vulnerability\s+(scan|assessment)|black\s+box|white\s+box|gray\s+box|zero[- ]knowledge|double[- ]blind|port\s+scan|wardialing\s+test|ethical\s+hack|satan|nessus|nmap|sniffer\s+detection)\b", 18)],
    "6.2.2": [(r"\b(static\s+analysis|\bsast\b|dynamic\s+analysis|\bdast\b|\biast\b|fuzzing|fuzz\s+testing|code\s+review|regression\s+testing|unit\s+testing|integration\s+testing|stress\s+testing|interface\s+testing|software\s+testing|mutation\s+testing)\b", 17)],
    "6.3.1": [(r"\b(\bkpi\b|\bkri\b|key\s+performance\s+indicator|key\s+risk\s+indicator|account\s+management\s+review|backup\s+verification|security\s+metric|log\s+review)\b", 15)],
    "6.4.1": [(r"\b(false\s+positive|false\s+negative|cvss|remediation\s+tracking|exception\s+handling|test\s+output)\b", 15)],
    "6.5.1": [(r"\b(\bsas\s*70\b|\bssae\s*1[68]\b|\bsoc\s*[123]\b|(?:soc\s*[123]|sas\s*70|ssae\s*1[68]|service\s+organization|audit)\s+(?:report\s+)?type\s+(?:i+|1|2)\b|iso\s*27001\s+audit|compliance\s+audit|is\s+audit|external\s+auditor|internal\s+auditor|auditor|audit\s+trail\s+review)\b", 18)],

    # Domain 7: Security Operations
    "7.1.1": [(r"\b(chain\s+of\s+custody|order\s+of\s+volatility|rfc\s*3227|digital\s+forensics|bit-?stream\s+image|write\s+blocker|forensic\s+copy|crime\s+scene|evidence\s+collection)\b", 20)],
    "7.1.2": [(r"\b(best\s+evidence|secondary\s+evidence|direct\s+evidence|circumstantial\s+evidence|hearsay|corroborative|conclusive|admissible|admissibility|search\s+warrant|subpoena|fourth\s+amendment|ediscovery|computer\s+crime|cybercrime|botnet|salami|data\s+diddling|dumpster\s+diving)\b", 16)],
    "7.2.1": [(r"\b(\bsiem\b|\bsoar\b|\bueba\b|\bedr\b|\bxdr\b|security\s+monitoring|audit\s+log|clipping\s+level|syslog|audit\s+trail|keystroke\s+monitoring|aggregation\s+of\s+logs|accountability)\b", 14)],
    "7.2.2": [(r"\b(\bntp\b|network\s+time\s+protocol|time\s+synchronization|log\s+integrity|worm\s+media|write-?once|egress\s+monitoring)\b", 17)],
    "7.3.1": [(r"\b(configuration\s+management|baseline\s+image|golden\s+image|drift\s+detection|hardening|system\s+baseline|trusted\s+os)\b", 15)],
    "7.4.1": [(r"\b(need-?to-?know|least\s+privilege|dual\s+control|split\s+knowledge|two-?person\s+control|two-?man\s+rule|operations\s+security|access\s+violation)\b", 13)],
    "7.5.1": [(r"\b(resource\s+protection|media\s+management|tape\s+library|hsm\s+hierarchical\s+storage|hardware\s+inventory|asset\s+protection)\b", 13)],
    "7.6.1": [(r"\b(incident\s+response|incident\s+management|incident\s+handling|\bcsirt\b|\bcert\b|triage|containment|eradication|lessons\s+learned|security\s+incident)\b", 17)],
    "7.7.1": [(r"\b(\bids\b|\bips\b|intrusion\s+detection|intrusion\s+prevention|\bhids\b|\bnids\b|signature-?based|anomaly-?based|heuristic|honeypot|honeynet|padded\s+cell|anti-?virus|anti-?malware|tripwire|file\s+integrity)\b", 18)],
    "7.8.1": [(r"\b(patch\s+management|patch\s+testing|hotfix|service\s+pack|vulnerability\s+management|virtual\s+patch|compensating\s+control|zero[- ]day)\b", 16)],
    "7.9.1": [(r"\b(change\s+management|change\s+control|\bcab\b|change\s+advisory\s+board|rollback\s+plan|emergency\s+change|request\s+for\s+change)\b", 17)],
    "7.10.1": [(r"\b(full\s+backup|incremental\s+backup|differential\s+backup|archive\s+bit|electronic\s+vaulting|remote\s+journaling|database\s+shadowing|3-2-1|immutable\s+backup|tape\s+rotation|grandfather-?father-?son)\b", 18)],
    "7.10.2": [(r"\b(hot\s+site|hot-?site|warm\s+site|cold\s+site|mobile\s+site|mirrored\s+site|reciprocal\s+agreement|\braid\b|clusters?|clustering|server\s+cluster|fault\s+tolerance|high\s+availability|failover|redundant\s+array|striping|mirroring|parity|mtbf|mttr|telecommunications\s+continuity)\b", 18)],
    "7.11.1": [(r"\b(disaster\s+recovery|\bdrp\b|salvage\s+team|restoration\s+team|emergency\s+communications|alternate\s+processing|recovery\s+strategy)\b", 14)],
    "7.12.1": [(r"\b(checklist\s+test|read-?through|walkthrough|structured\s+walkthrough|simulation\s+test|parallel\s+test|full[- ]interruption)\b", 18)],
    "7.13.1": [(r"\b(tabletop|bcp\s+exercise|business\s+continuity\s+test|plan\s+maintenance|bcp\s+training)\b", 14)],
    "7.14.1": [(r"\b(piggybacking|tailgating|visitor\s+log|escort|security\s+guard|guard\s+dog|patrol|badge\s+inspection)\b", 17)],
    "7.15.1": [(r"\b(human\s+safety|life\s+safety|personnel\s+safety|evacuation|duress\s+alarm|emergency\s+shutoff|epa|panic\s+button|travel\s+security)\b", 18)],

    # Domain 8: Software Development Security
    "8.1.1": [(r"\b(\bsdlc\b|waterfall|spiral\s+model|agile|devsecops|\brad\b|rapid\s+application|prototyping|cleanroom|joint\s+application\s+development|\bjad\b|capability\s+maturity|\bcmm\b|\bcmmi\b|system\s+development\s+life\s+cycle)\b", 18)],
    "8.1.2": [(r"\b(requirements\s+phase|requirements\s+development|design\s+phase|coding\s+phase|acceptance\s+phase|implementation\s+phase|maintenance\s+phase|change\s+control\s+sdlc|software\s+escrow)\b", 15)],
    "8.2.1": [(r"\b(ci/cd|source\s+code\s+repository|version\s+control|secrets\s+management|environment\s+separation|configuration\s+management\s+software|compiler|linker|interpreter|object-?oriented|polymorphism|inheritance|encapsulation|middleware|orb|corba|com|dcom|activex|applet|java\b)\b", 15)],
    "8.3.1": [(r"\b(\bsamm\b|\bbsimm\b|software\s+assurance|user\s+acceptance\s+testing|\buat\b|software\s+capability)\b", 15)],
    "8.4.1": [(r"\b(\bcots\b|commercial\s+off[- ]the[- ]shelf|open[- ]source|\bsbom\b|acquired\s+software|third-?party\s+library|shrink-?wrapped)\b", 17)],
    "8.5.1": [(r"\b(sql\s+injection|sqli|\bxss\b|cross-?site\s+scripting|\bcsrf\b|cross-?site\s+request|owasp|broken\s+access|command\s+injection|xml\s+injection|directory\s+traversal|parameterized\s+query|prepared\s+statement|structured\s+query\s+language|placeholders?\s+for\s+literal\s+values)\b", 18)],
    "8.5.2": [(r"\b(buffer\s+overflow|stack\s+overflow|input\s+validation|bounds\s+checking|bounds\s+check|integer\s+overflow|format\s+string|race\s+condition|logic\s+bomb|trojan\s+horse|worm|virus|macro\s+virus|polymorphic|stealth\s+virus|multipartite|backdoor|trapdoor|maintenance\s+hook|rootkit|spyware|adware|relational\s+database|rdbms|dbms|database\s+views?|primary\s+key|foreign\s+key|normalization|referential\s+integrity|external\s+consistency|tuples?|attributes?|odbc|jdbc|stored\s+procedure|data\s+dictionary|concurrency|deadlock|commit|rollback|two-?phase\s+commit|inference|aggregation\s+database|expert\s+system|neural\s+network|knowledge\s+base|artificial\s+intelligence|high-?level\s+programming\s+language)\b", 16)],
}

# Coarse book-position domain priors (CertKingdom groups questions in rough CBK chapter blocks)
def book_domain_prior(qnum: int) -> dict[str, int]:
    if 1 <= qnum <= 215:
        return {"dom-5": 4, "dom-7": 1}
    if 216 <= qnum <= 495:
        return {"dom-4": 4}
    if 496 <= qnum <= 620:
        return {"dom-1": 3, "dom-2": 1}
    if 621 <= qnum <= 725:
        return {"dom-8": 4}
    if 726 <= qnum <= 910:
        return {"dom-3": 4}
    if 911 <= qnum <= 1025:
        return {"dom-3": 4}
    if 1026 <= qnum <= 1125:
        return {"dom-7": 3, "dom-6": 2, "dom-2": 1}
    if 1126 <= qnum <= 1215:
        return {"dom-1": 2, "dom-7": 3}
    if 1216 <= qnum <= 1305:
        return {"dom-1": 2, "dom-7": 3}
    return {"dom-3": 3, "dom-7": 2}


def reference_domain_prior(refs: list[str]) -> dict[str, int]:
    """Extract domain priors from Shon Harris / CBK chapter names in book references."""
    joined = " ".join(refs).lower()
    priors: dict[str, int] = defaultdict(int)
    if "access control" in joined:
        priors["dom-5"] += 5
    if "telecommunications" in joined or "network" in joined:
        priors["dom-4"] += 5
    if "security management" in joined or "risk" in joined or "governance" in joined:
        priors["dom-1"] += 5
    if "application" in joined or "software" in joined or "database" in joined:
        priors["dom-8"] += 5
    if "cryptography" in joined:
        priors["dom-3"] += 6
    if "architecture" in joined or "security models" in joined:
        priors["dom-3"] += 5
    if "operations security" in joined:
        priors["dom-7"] += 5
    if "business continuity" in joined or "disaster recovery" in joined:
        priors["dom-1"] += 3
        priors["dom-7"] += 3
    if "law" in joined or "investigation" in joined or "ethics" in joined:
        priors["dom-1"] += 3
        priors["dom-7"] += 3
    if "physical" in joined:
        priors["dom-3"] += 4
        priors["dom-7"] += 2
    if "protection of information assets" in joined or "asset security" in joined:
        priors["dom-2"] += 5
    return priors


def load_taxonomy() -> tuple[dict[str, Any], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    tax = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    sub_map: dict[str, dict[str, Any]] = {}
    topic_map: dict[str, dict[str, Any]] = {}
    for dom in tax["domains"]:
        for sub in dom["subdomains"]:
            sub_info = {
                "domainId": dom["domainId"],
                "domainNumber": dom["number"],
                "domainName": dom["name"],
                "subdomainId": sub["subdomainId"],
                "subdomainName": sub["name"],
                "topics": sub["topics"],
            }
            sub_map[sub["subdomainId"]] = sub_info
            for top in sub["topics"]:
                topic_map[top["topicId"]] = {
                    **sub_info,
                    "topicId": top["topicId"],
                    "topicName": top["name"],
                }
    return tax, sub_map, topic_map


# Sensible general-topic fallback priority when a domain has zero regex hits
DEFAULT_TOPIC_RANK = {
    "1.4.1": 0, "1.3.1": 1, "1.8.1": 2,
    "2.1.1": 0, "2.5.1": 1,
    "3.4.1": 0, "3.1.2": 1,
    "4.1.1": 0, "4.2.1": 1,
    "5.1.1": 0, "5.4.1": 1,
    "6.1.1": 0, "6.2.1": 1,
    "7.4.1": 0, "7.5.1": 1,
    "8.5.2": 0, "8.1.1": 1,
}


def classify_question(q: dict[str, Any], topic_map: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], int, int]:
    """
    Score all 95 CISSP CBK 2026 micro-topics using weighted regex matches over
    stem (3x), options (2x), and explanation (1x), plus book-section and
    reference-chapter priors. Returns (topic_info, top_score, margin_over_second).
    """
    qnum = q["questionNumber"]
    stem_only_lower = q["stem"].lower()
    opts_only_lower = " ".join(o["text"] for o in q["options"]).lower()
    expl_lower = q["explanation"]["fullText"].lower()
    refs = q["explanation"]["references"]

    dom_prior = book_domain_prior(qnum)
    ref_prior = reference_domain_prior(refs)

    scores: list[tuple[int, int, str]] = []
    for tid, info in topic_map.items():
        did = info["domainId"]
        score = dom_prior.get(did, 0) + ref_prior.get(did, 0)
        for pat, weight in TOPIC_RULES.get(tid, []):
            stem_hits = len(re.findall(pat, stem_only_lower))
            opt_hits = len(re.findall(pat, opts_only_lower))
            expl_hits = len(re.findall(pat, expl_lower))
            score += min(stem_hits, 3) * weight * 3 + min(opt_hits, 2) * weight * 2 + min(expl_hits, 2) * weight
        tie_rank = -DEFAULT_TOPIC_RANK.get(tid, 50)
        scores.append((score, tie_rank, tid))

    scores.sort(key=lambda x: (-x[0], -x[1], x[2]))
    best_score, _, best_tid = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else 0
    return topic_map[best_tid], best_score, best_score - second_score


def fix_and_deduplicate(raw_questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Apply verified book errata fixes and remove exact/superseded duplicates."""
    fixed: list[dict[str, Any]] = []
    for q in raw_questions:
        qn = q["questionNumber"]
        if qn in SKIP_QUESTION_NUMBERS:
            continue

        q = json.loads(json.dumps(q))  # deep copy

        # Fix Q211: 6 split markers A-F -> merge A+B and D+E into clean 4 options
        if qn == 211:
            opts = q["options"]
            q["options"] = [
                {"id": "A", "text": f"{opts[0]['text'].rstrip()} {opts[1]['text'].lstrip()}"},
                {"id": "B", "text": opts[2]["text"]},
                {"id": "C", "text": f"{opts[3]['text'].rstrip()} {opts[4]['text'].lstrip()}"},
                {"id": "D", "text": opts[5]["text"]},
            ]
            q["correctAnswer"] = "B"

        # Fix Q931 positional option D
        if qn == 931:
            for o in q["options"]:
                if o["id"] == "D" and "none of the above" in o["text"].lower():
                    o["text"] = "None of the other listed choices."

        # Fix Q490 image-dependent stem -> describe diagram cleanly
        if qn == 490:
            q["stem"] = (
                "Based on the network attack topology described in the scenario (a single Master system "
                "issuing commands to multiple Zombie hosts flooding a single Victim server), identify the attack:"
            )
            q["_scenarioContextOverride"] = (
                "Diagram Topology: 1 Master controller -> arrows to 4 distributed Zombie hosts -> "
                "simultaneous traffic streams directed at 1 Victim server."
            )

        # Apply answer key overrides
        if qn in ANSWER_KEY_OVERRIDES:
            q["correctAnswer"] = ANSWER_KEY_OVERRIDES[qn]

        # Apply short stem expansions
        if qn in SHORT_STEM_EXPANSIONS:
            q["stem"] = SHORT_STEM_EXPANSIONS[qn]

        # Clean minor whitespace/PDF artifacts in stem & options
        q["stem"] = re.sub(r"[ \t]+", " ", q["stem"]).strip()
        for o in q["options"]:
            o["text"] = re.sub(r"\s+", " ", o["text"]).strip()

        fixed.append(q)

    # Deduplicate questions with identical normalized stem AND identical normalized option texts
    groups: dict[tuple[str, tuple[str, ...]], list[dict[str, Any]]] = defaultdict(list)
    for q in fixed:
        stem_key = re.sub(r"[^a-z0-9]+", " ", q["stem"].lower()).strip()
        opts_key = tuple(
            sorted(re.sub(r"[^a-z0-9]+", " ", o["text"].lower()).strip() for o in q["options"])
        )
        groups[(stem_key, opts_key)].append(q)

    deduped: list[dict[str, Any]] = []
    for _, grp in groups.items():
        if len(grp) == 1:
            deduped.append(grp[0])
        else:
            # Prefer copy with longest explanation + references + 4 options + earliest clean ID
            def quality_score(item: dict[str, Any]) -> tuple[int, int, int, int]:
                has_4 = 1 if len(item["options"]) == 4 else 0
                expl_len = len(item["explanation"]["fullText"])
                ref_cnt = len(item["explanation"]["references"])
                has_inc = 1 if item["explanation"]["incorrectByOption"] else 0
                return (has_4, has_inc, expl_len + ref_cnt * 100, -item["questionNumber"])

            best = max(grp, key=quality_score)
            best["_mergedBookNumbers"] = sorted(item["questionNumber"] for item in grp)
            deduped.append(best)

    deduped.sort(key=lambda x: x["questionNumber"])
    return deduped


def infer_cognitive_and_style(q: dict[str, Any]) -> tuple[str, str, int, list[str]]:
    """Determine cognitiveLevel, questionStyle, difficulty (1..5), and highlightKeywords."""
    stem = q["stem"]
    sl = stem.lower()

    # Highlight keywords
    kw_candidates = [
        "BEST", "FIRST", "MOST", "LEAST", "NOT", "EXCEPT", "PRIMARY", "PRIMARILY",
        "MAIN", "WEAKEST", "STRONGEST", "HIGHEST", "LOWEST", "FALSE", "TRUE",
        "ALWAYS", "NEVER", "NEXT", "ONLY", "INITIALLY", "CRITICAL", "GREATEST",
    ]
    highlight = [kw for kw in kw_candidates if re.search(rf"\b{kw}\b", stem)]
    if not highlight:
        # Check case-insensitive for words like "not" / "first" / "best"
        for kw in ["FIRST", "BEST", "MOST", "LEAST", "NOT", "EXCEPT", "PRIMARY"]:
            if re.search(rf"\b{kw.lower()}\b", sl):
                highlight.append(kw)

    # Question style
    if re.search(r"\b(calculate|how\s+many|annualized\s+loss|sle|ale|aro\s*=|mtbf|key\s+size\s+is|\bbits\b.*\bhow\s+many)\b", sl) and re.search(r"\d", sl):
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

    # Cognitive level
    word_count = len(stem.split())
    if style in {"best_answer", "first_action"} or re.search(r"\b(best|most\s+appropriate|most\s+effective|first\s+step|should\s+.*\s+do)\b", sl):
        cog = "evaluate"
    elif style == "calculation" or re.search(r"\b(scenario|if\s+a\s+|suppose|you\s+are\s+the|an\s+organization|a\s+company|when\s+implementing)\b", sl):
        cog = "apply" if style == "calculation" or word_count < 32 else "analyze"
    elif style == "least_likely" or re.search(r"\b(difference\s+between|compare|compared\s+to|why\s+does|except|not\s+true)\b", sl):
        cog = "analyze" if word_count >= 22 else "understand"
    elif re.search(r"\b(describes|purpose\s+of|why\s+is|advantage\s+of|disadvantage\s+of|role\s+of)\b", sl):
        cog = "understand"
    else:
        cog = "remember"

    # Difficulty 1..5 calibrated to CISSP item complexity
    diff = 2
    if cog == "remember":
        diff = 1 if word_count <= 14 else 2
    elif cog == "understand":
        diff = 2 if word_count <= 22 else 3
    elif cog == "apply":
        diff = 3
    elif cog == "analyze":
        diff = 3 if word_count < 28 else 4
    elif cog == "evaluate":
        diff = 4 if word_count >= 25 else 3

    if style == "calculation" or word_count >= 50:
        diff = min(5, diff + 1)

    return cog, style, diff, highlight[:5]


def infer_perspective(domain_id: str, subdomain_id: str, stem: str) -> str:
    sl = stem.lower()
    if re.search(r"\b(forensic|evidence|chain\s+of\s+custody|incident\s+response|containment|intrusion|attack|breach|malware|dos|ddos)\b", sl):
        return "incident_responder"
    if re.search(r"\b(audit|auditor|compliance|regulation|gdpr|hipaa|sox|law|legal|court|subpoena|warrant|ethics|canon|privacy|soc\s*[123])\b", sl):
        return "compliance_auditor"
    if re.search(r"\b(\bale\b|\bsle\b|\baro\b|\bbia\b|\bmtd\b|\brto\b|\brpo\b|risk\s+(analysis|assessment|mitigation|transfer|accept)|cost[- ]benefit|vendor|third-?party|\bsla\b)\b", sl):
        return "risk_advisor"
    if domain_id in {"dom-1", "dom-2"} or re.search(r"\b(policy|policies|governance|management|awareness|training|separation\s+of\s+duties|job\s+rotation|bcp|drp|classification|custodian|owner)\b", sl):
        return "manager_governance"
    if domain_id == "dom-6":
        return "compliance_auditor"
    if domain_id == "dom-7" and subdomain_id in {"7.1", "7.6", "7.7"}:
        return "incident_responder"
    return "technical_architect"


def classify_distractor_trap(
    opt_text: str, opt_expl: str, stem: str, domain_id: str, correct_text: str
) -> str:
    ol = opt_text.lower()
    el = opt_expl.lower()
    sl = stem.lower()

    if re.search(r"\b(always|never|all\s+risk|100%|completely\s+eliminate|totally\s+prevent|eliminate\s+all|only\s+way|every\s+case|unlimited|impossible)\b", ol):
        return "extreme_absolutist"
    if re.search(r"\b(human\s+safety|life\s+safety|evacuat|personnel\s+safety|water\s+on\s+electrical|electrocution)\b", sl + " " + el):
        return "ignores_human_safety"
    if re.search(r"\b(cost|expensive|exceed|budget|cost[- ]effective|price)\b", el):
        return "cost_disproportionate"
    if re.search(r"\b(law\s+enforcement|police|media|fbi|regulator|publicly\s+disclose)\b", ol):
        return "premature_escalation"
    if re.search(r"\b(phase|step|before|after|first|precede|follow|prior\s+to|containment|eradication|recovery|initiation|early|late)\b", el) and re.search(r"\b(first|phase|step|order|sequence|flow|lifecycle|stage)\b", sl):
        return "wrong_lifecycle_phase"
    if (
        re.search(r"\b(policy|governance|management|process|procedure|standard|guideline|compliance|audit|first|program)\b", sl + " " + correct_text.lower())
        and re.search(r"\b(firewall|encrypt|install|configure|patch|antivirus|ids|ips|router|filter|software|hardware|technical|tool|script)\b", ol)
        and not re.search(r"\b(firewall|encrypt|protocol|software|tool)\b", correct_text.lower())
    ):
        return "technical_fix_over_process"
    if re.search(r"\b(narrow|partial|only\s+one|incomplete|part\s+of|subset|also\s+requires|not\s+enough|more\s+than|only\s+provides|as\s+well)\b", el):
        return "incomplete_partial_answer"
    if re.search(r"\b(not\s+address|unrelated|bogus|detractor|distracter|different\s+purpose|wrong\s+problem|does\s+not\s+provide|does\s+not\s+fulfill|no\s+such\s+thing|not\s+a\s+valid)\b", el):
        return "solves_wrong_problem"
    # If option shares key vocabulary with stem/correct answer -> confuses_similar_terms; otherwise solves_wrong_problem
    corr_words = set(re.findall(r"[a-z]{4,}", correct_text.lower()))
    opt_words = set(re.findall(r"[a-z]{4,}", ol))
    if corr_words & opt_words:
        return "confuses_similar_terms"
    if re.search(r"\b(not|false|least|except)\b", sl):
        return "solves_wrong_problem"
    return "confuses_similar_terms"


def extract_key_terms(q: dict[str, Any], topic_info: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Extract conceptsTested and keyTerms from stem, options, explanation, and topic."""
    blob = f"{q['stem']} {' '.join(o['text'] for o in q['options'])} {q['explanation']['fullText']}"
    glossary = [
        "CIA Triad", "Non-repudiation", "Least Privilege", "Separation of Duties", "Defense in Depth",
        "Due Care", "Due Diligence", "BIA", "BCP", "DRP", "RTO", "RPO", "MTD", "ALE", "SLE", "ARO",
        "Bell-LaPadula", "Biba", "Clark-Wilson", "Brewer-Nash", "Common Criteria", "TCSEC",
        "TPM", "HSM", "Reference Monitor", "Security Kernel", "AES", "DES", "RSA", "ECC",
        "Diffie-Hellman", "PKI", "Digital Signature", "HMAC", "SHA-256", "X.509", "CRL", "OCSP",
        "One-Time Pad", "Steganography", "CPTED", "HVAC", "UPS", "OSI Model", "TCP/IP",
        "IPsec", "IKE", "TLS", "SSL", "SSH", "L2TP", "PPTP", "VPN", "DMZ", "VLAN", "Firewall",
        "802.1X", "WPA2", "WPA3", "DNSSEC", "SPF", "DKIM", "DMARC", "VoIP",
        "MFA", "Biometrics", "CER", "FAR", "FRR", "Kerberos", "SAML", "OAuth", "OIDC",
        "RADIUS", "TACACS+", "LDAP", "SSO", "DAC", "MAC", "RBAC", "ABAC", "RuBAC",
        "Penetration Testing", "Vulnerability Scanning", "SAST", "DAST", "SOC 2", "SAS 70",
        "Chain of Custody", "Order of Volatility", "RFC 3227", "SIEM", "IDS", "IPS",
        "Incident Response", "Change Management", "Full Backup", "Incremental Backup",
        "Differential Backup", "RAID", "Hot Site", "Warm Site", "Cold Site",
        "SDLC", "Buffer Overflow", "SQL Injection", "XSS", "CSRF", "TOCTOU", "DBMS",
        "NIST SP 800-88", "Degaussing", "Data Classification", "DLP", "GDPR", "HIPAA",
    ]
    found: list[str] = []
    for term in glossary:
        if re.search(rf"\b{re.escape(term)}\b", blob, re.I):
            found.append(term)
            if len(found) >= 6:
                break

    if not found:
        # Fallback to capitalized phrases or acronyms in stem + correct option
        correct_txt = next(o["text"] for o in q["options"] if o["id"] == q["correctAnswer"])
        acronyms = re.findall(r"\b[A-Z][A-Z0-9/+]{1,10}\b", f"{q['stem']} {correct_txt}")
        found = list(dict.fromkeys(a for a in acronyms if a not in {"A", "B", "C", "D", "NOT", "BEST", "MOST", "FIRST"}))[:4]

    topic_concept = topic_info["topicName"].split("(")[0].strip()
    concepts = [topic_concept]
    for f in found[:3]:
        if f.lower() not in topic_concept.lower():
            concepts.append(f)

    return concepts[:4], (found[:5] if found else [topic_concept])


def parse_structured_references(raw_refs: list[str], domain_id: str, subdomain_id: str) -> list[dict[str, str]]:
    """Convert raw book reference strings into QuestionSchema {source, section} objects."""
    parsed: list[dict[str, str]] = []
    for r in raw_refs:
        s = re.sub(r"^(?:Reference\s*\(?s?\)?\s*:|Source\s*:)\s*", "", r, flags=re.I).strip()
        s = re.sub(r"\s+", " ", s)
        if len(s) < 4:
            continue
        if re.match(r"^https?://", s, re.I):
            parsed.append({"source": "Web Reference", "section": s})
            continue
        # Try splitting at page / chapter / comma
        m = re.search(r",?\s*((?:Chapter|Ch\.?|Section|Page|pp?\.|Kindle)\b.*)$", s, re.I)
        if m and m.start() > 5:
            src = s[: m.start()].strip(" ,;:-")
            sec = m.group(1).strip(" ,;:-")
            parsed.append({"source": src or "CISSP Reference", "section": sec or "General"})
        else:
            parsed.append({"source": s[:120], "section": "Cited in CertKingdom CISSP (1373 Q&A)"})

    if not parsed:
        parsed.append({
            "source": "ISC2 CISSP Common Body of Knowledge (CBK)",
            "section": f"Domain {domain_id.replace('dom-', '')} — Sub-domain {subdomain_id}",
        })
    return parsed[:4]


def build_option_explanations(
    q: dict[str, Any],
    summary_text: str,
    incorrect_by_opt: dict[str, str],
    topic_info: dict[str, Any],
) -> list[dict[str, Any]]:
    """Produce detailed, non-generic explanations and trapTypes for all 4 options."""
    correct_id = q["correctAnswer"]
    correct_opt = next(o for o in q["options"] if o["id"] == correct_id)
    full_text = q["explanation"]["fullText"]
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", full_text) if len(s.strip()) > 15]

    out_opts: list[dict[str, Any]] = []
    for opt in q["options"]:
        oid = opt["id"]
        otext = opt["text"]
        is_corr = oid == correct_id

        if is_corr:
            base = summary_text.strip()
            if not base.lower().startswith("correct"):
                expl = f"Correct. {otext} is right because {base[0].lower()}{base[1:]}" if len(base) > 10 and not base.startswith(otext) else f"Correct. {base}"
            else:
                expl = base
            if len(expl) < 25:
                expl = f"Correct. '{otext}' accurately satisfies the question's {topic_info['topicName']} requirement."
            out_opts.append({
                "id": oid,
                "text": otext,
                "isCorrect": True,
                "explanation": expl,
                "trapType": None,
            })
        else:
            raw_inc = incorrect_by_opt.get(oid, "").strip()
            if raw_inc:
                # Strip redundant leading "- OptionText:" or "OptionText is incorrect"
                cleaned = re.sub(r"^[-*•]\s*", "", raw_inc).strip()
                if not cleaned.lower().startswith("incorrect"):
                    cleaned = f"Incorrect. {cleaned}"
                opt_expl = cleaned
            else:
                # Search full_text sentences mentioning key words from this option
                opt_words = [
                    w for w in re.findall(r"[a-zA-Z0-9-]{4,}", otext.lower())
                    if w not in {"that", "this", "with", "from", "have", "will", "which", "they", "their", "used", "only", "most", "more", "some", "none", "other"}
                ]
                matched_sents = [
                    s for s in sentences
                    if any(re.search(rf"\b{re.escape(w)}\b", s.lower()) for w in opt_words[:4])
                    and ("incorrect" in s.lower() or "not " in s.lower() or "instead" in s.lower() or "whereas" in s.lower() or len(opt_words) >= 1)
                ]
                if matched_sents and otext.lower() not in correct_opt["text"].lower():
                    snippet = " ".join(matched_sents[:2])
                    opt_expl = f"Incorrect. {snippet}"
                else:
                    opt_expl = (
                        f"Incorrect. '{otext}' does not fulfill the core requirement tested in "
                        f"{topic_info['subdomainName']}; '{correct_opt['text']}' is the accurate choice."
                    )

            if len(opt_expl) < 25:
                opt_expl = f"Incorrect. '{otext}' is a distractor; '{correct_opt['text']}' is correct for this {topic_info['topicName']} scenario."

            trap = classify_distractor_trap(otext, opt_expl, q["stem"], topic_info["domainId"], correct_opt["text"])
            out_opts.append({
                "id": oid,
                "text": otext,
                "isCorrect": False,
                "explanation": opt_expl,
                "trapType": trap,
            })

    return out_opts


def build_mindset_and_takeaway(
    q: dict[str, Any],
    topic_info: dict[str, Any],
    perspective: str,
    summary_text: str,
    key_terms: list[str],
) -> tuple[str, str, str]:
    """Generate tailored managerMindsetTip, studyFocusDirective, and keyTakeaway."""
    dom_id = topic_info["domainId"]
    sub_name = topic_info["subdomainName"]
    top_name = topic_info["topicName"]
    correct_txt = next(o["text"] for o in q["options"] if o["id"] == q["correctAnswer"])
    terms_str = ", ".join(key_terms[:3]) if key_terms else top_name

    perspective_tips = {
        "manager_governance": (
            f"From a governance lens in {sub_name}, prioritize policies, management accountability, and business-aligned controls over ad-hoc technical tweaks."
        ),
        "risk_advisor": (
            f"As a CISSP Risk Advisor on {sub_name}, always ground decisions in risk likelihood, business impact, and cost-effective risk treatment."
        ),
        "incident_responder": (
            f"In {sub_name} operational scenarios, follow disciplined lifecycle sequence—preserve evidence, validate scope, contain impact, and remediate methodically."
        ),
        "compliance_auditor": (
            f"When evaluating {sub_name} under an audit or legal lens, verify objective evidence, statutory requirements, and formal organizational accountability."
        ),
        "technical_architect": (
            f"When designing controls for {sub_name}, match the exact security mechanism ({terms_str}) to the security property and layer required by the architecture."
        ),
    }
    mindset_tip = perspective_tips[perspective]

    study_directive = (
        f"Review {top_name} ({topic_info['topicId']}) focusing on {terms_str}, and contrast why '{correct_txt}' outperforms close distractors."
    )

    # Extract crisp first meaningful sentence from summaryText as keyTakeaway, or build from Q+A
    first_sent = re.split(r"(?<=[.!?])\s+", summary_text.strip())[0].strip()
    if (
        25 <= len(first_sent) <= 200
        and not first_sent.lower().startswith(("the following", "details:", "is a ", "is the ", "are "))
    ):
        key_takeaway = first_sent
    else:
        key_takeaway = f"{top_name}: {correct_txt.rstrip('.')} — {q['stem'].rstrip('?:.')}."
    if len(key_takeaway) < 20:
        key_takeaway = f"{sub_name} ({topic_info['topicId']}): Remember that '{correct_txt}' is the key principle here."

    return mindset_tip, study_directive, key_takeaway


def get_existing_max_qnum() -> dict[tuple[str, str], int]:
    """Scan existing src/content/questions/**/*.json so new IDs never collide."""
    existing_ids: set[str] = set()
    max_per_sub: dict[tuple[str, str], int] = defaultdict(int)
    for p in glob.glob(str(CONTENT_QUESTIONS_DIR / "**" / "*.json"), recursive=True):
        if Path(p).name.endswith("-certkingdom-questions.json"):
            continue
        items = json.loads(Path(p).read_text(encoding="utf-8"))
        for item in items:
            qid = item["id"]
            existing_ids.add(qid)
            m = re.match(r"^cissp-(d[1-8])-s(\d+\.\d+)-q(\d+)$", qid)
            if m:
                key = (m.group(1), m.group(2))
                max_per_sub[key] = max(max_per_sub[key], int(m.group(3)))
    return max_per_sub


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-content", action="store_true", help="Write final files into src/content/questions/domain-*/")
    args = parser.parse_args()

    raw_data = json.loads(RAW_JSON_PATH.read_text(encoding="utf-8"))
    _, _, topic_map = load_taxonomy()

    cleaned_qs = fix_and_deduplicate(raw_data["questions"])
    max_per_sub = get_existing_max_qnum()
    seq_counters: dict[tuple[str, str], int] = defaultdict(int, max_per_sub)

    by_domain: dict[str, list[dict[str, Any]]] = defaultdict(list)
    low_confidence: list[dict[str, Any]] = []
    domain_counts = Counter()
    subdomain_counts = Counter()
    cog_counts = Counter()
    diff_counts = Counter()
    trap_counts = Counter()

    for q in cleaned_qs:
        qn = q["questionNumber"]
        topic_info, top_score, margin = classify_question(q, topic_map)
        did = topic_info["domainId"]      # dom-1..dom-8
        dshort = did.replace("dom-", "d")  # d1..d8
        sid = topic_info["subdomainId"]
        tid = topic_info["topicId"]

        seq_counters[(dshort, sid)] += 1
        seq = seq_counters[(dshort, sid)]
        qid = f"cissp-{dshort}-s{sid}-q{seq:03d}"

        if top_score < 10 or margin <= 2:
            low_confidence.append({
                "bookQ": qn,
                "assignedTopic": tid,
                "score": top_score,
                "margin": margin,
                "stem": q["stem"][:100],
            })

        # Determine explanation text
        if qn in EMPTY_EXPLANATION_AUTHORED:
            summary_text = EMPTY_EXPLANATION_AUTHORED[qn]
            q["explanation"]["fullText"] = summary_text
            q["explanation"]["summaryText"] = summary_text
        else:
            summary_text = (q["explanation"]["summaryText"] or q["explanation"]["fullText"]).strip()
            if len(summary_text) < 40:
                full_t = q["explanation"]["fullText"].strip()
                if len(full_t) >= 40:
                    summary_text = full_t
                else:
                    corr_txt = next(o["text"] for o in q["options"] if o["id"] == q["correctAnswer"])
                    summary_text = (
                        f"{summary_text} Therefore, '{corr_txt}' is the correct choice under {topic_info['subdomainName']} ({tid})."
                    ).strip()
                    if len(summary_text) < 40:
                        summary_text = (
                            f"In {topic_info['subdomainName']} ({tid}), '{corr_txt}' is correct because it directly addresses the requirement in the stem."
                        )

        cog, style, diff, highlight = infer_cognitive_and_style(q)
        persp = infer_perspective(did, sid, q["stem"])
        concepts, key_terms = extract_key_terms(q, topic_info)
        opts_enriched = build_option_explanations(
            q, summary_text, q["explanation"].get("incorrectByOption", {}), topic_info
        )
        mindset_tip, study_dir, key_takeaway = build_mindset_and_takeaway(
            q, topic_info, persp, summary_text, key_terms
        )
        refs = parse_structured_references(q["explanation"]["references"], did, sid)

        # Estimated time
        wc = len(q["stem"].split()) + sum(len(o["text"].split()) for o in q["options"])
        est_sec = min(150, max(35, int(30 + wc * 0.65 + (diff - 1) * 8)))

        # Scenario context (e.g. Q490 diagram or Q902 binary table)
        scenario_ctx = q.get("_scenarioContextOverride")
        if not scenario_ctx and "\n" in q["stem"] and re.search(r"[01]{4}\s+[01]{4}", q["stem"]):
            scenario_ctx = "Binary / bit-level operation illustration included in the question stem."

        tags = [
            f"domain-{topic_info['domainNumber']}",
            f"sub-{sid}",
            "certkingdom-1373",
            f"book-q{qn}",
        ]
        if style == "calculation":
            tags.append("calculation")
        if persp in {"manager_governance", "risk_advisor"}:
            tags.append("think-like-a-manager")

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
            "difficultyLabel": DIFFICULTY_LABELS[diff],
            "estimatedTimeSeconds": est_sec,
            "conceptsTested": concepts,
            "keyTerms": key_terms,
            "tags": tags,
            "stem": q["stem"],
            "scenarioContext": scenario_ctx,
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

        # Self-validate strict QuestionSchema invariants in Python
        assert re.match(r"^cissp-d[1-8]-s\d+\.\d+-q\d{3,4}$", enriched["id"]), enriched["id"]
        assert len(enriched["stem"]) >= 30, (qn, enriched["stem"])
        assert len(enriched["options"]) == 4, (qn, enriched["options"])
        assert sum(1 for o in enriched["options"] if o["isCorrect"]) == 1, qn
        for o in enriched["options"]:
            assert len(o["explanation"]) >= 20, (qn, o)
            if o["isCorrect"]:
                assert o["trapType"] is None
                assert o["id"] == enriched["explanation"]["correctOptionId"]
            else:
                assert o["trapType"] in VALID_TRAP_TYPES
                trap_counts[o["trapType"]] += 1
        assert len(enriched["explanation"]["summary"]) >= 40, (qn, enriched["explanation"]["summary"])
        assert len(enriched["explanation"]["managerMindsetTip"]) >= 20
        assert len(enriched["explanation"]["studyFocusDirective"]) >= 20
        assert len(enriched["explanation"]["keyTakeaway"]) >= 20
        assert len(enriched["explanation"]["references"]) >= 1

        by_domain[did].append(enriched)
        domain_counts[did] += 1
        subdomain_counts[sid] += 1
        cog_counts[cog] += 1
        diff_counts[diff] += 1

    audit = {
        "inputBookQuestions": len(raw_data["questions"]),
        "uniqueEnrichedQuestions": len(cleaned_qs),
        "skippedErrata": sorted(SKIP_QUESTION_NUMBERS),
        "answerOverrides": ANSWER_KEY_OVERRIDES,
        "domainDistribution": dict(sorted(domain_counts.items())),
        "subdomainCoverageCount": len(subdomain_counts),
        "subdomainDistribution": dict(sorted(subdomain_counts.items())),
        "cognitiveDistribution": dict(sorted(cog_counts.items())),
        "difficultyDistribution": dict(sorted(diff_counts.items())),
        "trapTypeDistribution": dict(sorted(trap_counts.items())),
        "lowConfidenceClassificationCount": len(low_confidence),
        "lowConfidenceSample": low_confidence[:50],
    }
    AUDIT_OUTPUT_PATH.write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")

    out_base = CONTENT_QUESTIONS_DIR if args.write_content else (REPO_ROOT / "scripts" / "extracted" / "enriched_staged")
    for dom_num in range(1, 9):
        did = f"dom-{dom_num}"
        dom_dir = out_base / f"domain-{dom_num}"
        dom_dir.mkdir(parents=True, exist_ok=True)
        out_file = dom_dir / f"d{dom_num}-certkingdom-questions.json"
        out_file.write_text(
            json.dumps(by_domain[did], indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {len(by_domain[did]):4d} questions -> {out_file}")

    print("\nAudit summary:")
    print(json.dumps({k: v for k, v in audit.items() if k != "lowConfidenceSample"}, indent=2))


if __name__ == "__main__":
    main()
