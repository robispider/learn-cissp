# CISSP Question & Exam Data Specification for Agents

**Repository**: `D:\git\learn-cissp`  
**Companion to**: [VISION_AND_AGENT_PLAYBOOK.md](file:///D:/git/learn-cissp/docs/VISION_AND_AGENT_PLAYBOOK.md)  
**Purpose**: Canonical reference for Content Authoring Agents, Data Pipeline Agents, and Analytics Agents creating or consuming CISSP exam and question JSON files.

---

## 1. Why "Self-Indicating Data" Matters

In this system, a question JSON file is not just display text—it is **telemetry metadata**. When a user selects an answer in an exam, the client-side diagnostic engine joins the user's response (`selectedOptionId`, `confidence`, `timeSpentSeconds`) with the question's **indicating fields** to automatically determine:
1. **Structural Location**: Which Domain (`dom-1`..`dom-8`), Sub-domain (`1.1`..`8.5`), and Micro-Topic (`1.4.2`) is strong or weak.
2. **Cognitive Ceiling**: Whether the user succeeds at `remember` / `understand` questions but fails at `analyze` / `evaluate` scenario questions.
3. **CISSP Mindset Alignment**: Whether the user struggles when wearing the `manager_governance` or `risk_advisor` hat versus the `technical_architect` hat.
4. **Root Cause of Error (`trapType`)**: Every wrong option (`isCorrect: false`) is tagged with a specific `trapType` so the post-exam report can tell the user *why* they got tricked (e.g., *"You repeatedly chose hands-on technical fixes instead of management policy/process steps"*).
5. **Actionable Remediation (`studyFocusDirective`)**: Every question carries an explicit 1-sentence study instruction that is aggregated into the post-exam Focused Study Plan whenever the question is missed or guessed with low confidence.

---

## 2. Canonical CISSP 8-Domain & Sub-Domain Registry

All question and exam JSON files MUST use the exact `domainId` and `subdomainId` values from this table:

### Domain 1: Security and Risk Management (`dom-1` · Weight: 16%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `1.1` | Professional Ethics & ISC2 Code of Ethics | `1.1.1` ISC2 Canons & Priority Order, `1.1.2` Organizational Ethics & Conflicts |
| `1.2` | Security Concepts (CIA, DAD, Non-Repudiation, 5 Pillars) | `1.2.1` CIA Triad & Parkerian Hexad, `1.2.2` Authenticity & Non-repudiation |
| `1.3` | Security Governance Principles & Alignment | `1.3.1` Governance vs. Management, `1.3.2` Roles & Responsibilities (Owner, Custodian, User), `1.3.3` Security Frameworks (NIST, ISO 27001, COBIT, SABSA) |
| `1.4` | Risk Management Concepts & Risk Analysis | `1.4.1` Risk Terminology (Asset, Threat, Vulnerability, Exposure), `1.4.2` Quantitative Risk (AV, EF, SLE, ARO, ALE), `1.4.3` Qualitative Risk & Risk Matrices, `1.4.4` Risk Treatment (Mitigate, Transfer, Accept, Avoid) |
| `1.5` | Threat Modeling Concepts & Methodologies | `1.5.1` STRIDE, PASTA, VAST, DREAD, `1.5.2` Attack Trees & Reduction Analysis |
| `1.6` | Supply Chain Risk Management (SCRM) | `1.6.1` Third-Party & Vendor Risk, `1.6.2` SLAs, NDAs, MOUs, ISAs, Right-to-Audit |
| `1.7` | Legal, Regulatory, Compliance & Privacy | `1.7.1` Cybercrime Laws & Intellectual Property (Copyright, Patent, Trade Secret), `1.7.2` Privacy Regulations (GDPR, CCPA, HIPAA, PCI-DSS), `1.7.3` Cross-Border Data Flows |
| `1.8` | Security Policies, Standards, Procedures & Baselines | `1.8.1` Policy Hierarchy (Policy vs. Standard vs. Guideline vs. Procedure), `1.8.2` Baselines & Scoping/Tailoring |
| `1.9` | Business Continuity (BCP) Requirements | `1.9.1` BCP Project Initiation & Scope, `1.9.2` Business Impact Analysis (BIA: MTD, RTO, RPO, WRT) |
| `1.10` | Personnel Security Policies & Processes | `1.10.1` Hiring, Background Checks & Onboarding, `1.10.2` Job Rotation, Mandatory Vacations, Separation of Duties, `1.10.3` Termination & Offboarding |
| `1.11` | Security Awareness, Education, and Training | `1.11.1` Awareness vs. Training vs. Education, `1.11.2` Phishing Simulations & Program Metrics |
| `1.12` | Due Care & Due Diligence | `1.12.1` Prudent Person Rule, `1.12.2` Distinguishing Due Diligence (Knowing) from Due Care (Doing) |

### Domain 2: Asset Security (`dom-2` · Weight: 10%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `2.1` | Identify and Classify Information and Assets | `2.1.1` Government vs. Commercial Classification Labels, `2.1.2` Asset Inventory & Categorization (FIPS 199) |
| `2.2` | Information and Asset Ownership | `2.2.1` Data Owner vs. Data Controller vs. Data Processor, `2.2.2` Custodian Duties |
| `2.3` | Protect Privacy & Sensitive Data | `2.3.1` PII, PHI, Cardholder Data, `2.3.2` Data Anonymization, Pseudonymization, Tokenization, Masking |
| `2.4` | Asset Retention & End-of-Life Media Sanitization | `2.4.1` Record Retention Schedules, `2.4.2` Media Sanitization (NIST SP 800-88: Clear, Purge, Destroy, Cryptographic Erase) |
| `2.5` | Data Security Controls & States of Data | `2.5.1` Data at Rest, Data in Transit, Data in Use, `2.5.2` DLP (Network vs. Endpoint) & CASB |
| `2.6` | Data Handling Requirements | `2.6.1` Marking, Labeling, Storage, and Secure Transport of Sensitive Media |

### Domain 3: Security Architecture and Engineering (`dom-3` · Weight: 13%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `3.1` | Secure Design Principles | `3.1.1` Saltzer & Schroeder Principles (Least Privilege, Fail-Safe Defaults, Economy of Mechanism, Complete Mediation, Open Design), `3.1.2` Defense in Depth & Zero Trust |
| `3.2` | Fundamental Concepts of Security Models | `3.2.1` Confidentiality Models (Bell-LaPadula), `3.2.2` Integrity Models (Biba, Clark-Wilson), `3.2.3` Brewer-Nash (Chinese Wall), Graham-Denning, Take-Grant |
| `3.3` | Select Controls Based Upon Systems Security Requirements | `3.3.1` Common Criteria (ISO 15408: TOE, PP, ST, EALs), `3.3.2` System Certification vs. Accreditation / Authorization (RMF) |
| `3.4` | Security Capabilities of Information Systems | `3.4.1` Memory Protection, Protection Rings, Trusted Platform Module (TPM), HSM, Secure Enclaves, Reference Monitor & Security Kernel |
| `3.5` | Cloud, Virtualization, IoT & Embedded Systems Security | `3.5.1` Hypervisors (Type 1 vs. Type 2), VM Escape, Containers, `3.5.2` Cloud Shared Responsibility (IaaS, PaaS, SaaS), `3.5.3` ICS/SCADA, IoT, Edge Computing |
| `3.6` | Cryptography & Symmetric/Asymmetric Algorithms | `3.6.1` Symmetric Ciphers (AES, ChaCha20, Block Modes: GCM, CBC, ECB), `3.6.2` Asymmetric Cryptography (RSA, ECC, Diffie-Hellman) & Post-Quantum Crypto |
| `3.7` | PKI, Digital Signatures, Hashing & Key Management | `3.7.1` Hashing & MACs (SHA-2/3, HMAC), `3.7.2` Digital Signatures & Certificates (X.509, CA, CRL, OCSP, Pinning), `3.7.3` Key Lifecycle & Escrow |
| `3.8` | Cryptanalytic Attacks | `3.8.1` Ciphertext-Only, Known-Plaintext, Chosen-Plaintext, Side-Channel, Birthday, Replay, Downgrade |
| `3.9` | Site and Facility Design Secure Principles | `3.9.1` CPTED (Crime Prevention Through Environmental Design), Site Selection |
| `3.10` | Physical Security & Environmental Controls | `3.10.1` Perimeter Controls, Mantraps, Bollards, Locks, `3.10.2` HVAC, Power (UPS, Generators), Fire Suppression (Wet/Dry Pipe, Pre-action, Clean Agents) |

### Domain 4: Communication and Network Security (`dom-4` · Weight: 13%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `4.1` | Secure Design Principles in Network Architecture | `4.1.1` OSI & TCP/IP Models & Encapsulation, `4.1.2` IPsec (AH vs. ESP, Tunnel vs. Transport, IKE), TLS 1.3, SSH, `4.1.3` Wireless Security (WPA2/WPA3, 802.1X/EAP), Cellular (4G/5G) |
| `4.2` | Secure Network Components | `4.2.1` Firewalls (Stateful, NGFW, WAF), Proxies, NAC, `4.2.2` Network Segmentation (VLANs, DMZ, Micro-segmentation, SDN, SD-WAN, SASE) |
| `4.3` | Secure Communication Channels | `4.3.1` Voice/VoIP Security, Email Security (SPF, DKIM, DMARC, S/MIME), `4.3.2` VPNs (Split vs. Full Tunnel, Always-On), Remote Access, CDN & DNSSEC |

### Domain 5: Identity and Access Management (IAM) (`dom-5` · Weight: 13%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `5.1` | Control Physical and Logical Access to Assets | `5.1.1` Subject/Object Access Control Matrix, `5.1.2` Smart Cards, Badges, Physical Access Logs |
| `5.2` | Identification and Authentication of People, Devices, and Services | `5.2.1` MFA Factors (Something You Know, Have, Are, Somewhere You Are), `5.2.2` Biometrics (FAR/CER/FRR, Crossover Error Rate), `5.2.3` Passkeys/FIDO2 & Passwordless |
| `5.3` | Federated Identity with a Third-Party Service | `5.3.1` SAML 2.0, OAuth 2.0, OpenID Connect (OIDC), `5.3.2` Kerberos (AS, TGS, KDC, Tickets), RADIUS, TACACS+, LDAP |
| `5.4` | Implement and Manage Authorization Mechanisms | `5.4.1` DAC, MAC, RBAC, ABAC, Rule-Based, Risk-Based Access Control |
| `5.5` | Manage the Identity and Access Provisioning Lifecycle | `5.5.1` Provisioning, Onboarding, Role Changes (Privilege Creep), Deprovisioning, Access Reviews/Attestation |
| `5.6` | Implement Authentication Systems & PAM | `5.6.1` Privileged Access Management (PAM), Just-in-Time (JIT) Access, Credential Vaulting, Service Account Governance |

### Domain 6: Security Assessment and Testing (`dom-6` · Weight: 12%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `6.1` | Design and Validate Assessment, Test, and Audit Strategies | `6.1.1` Internal vs. External vs. Third-Party Assessments, `6.1.2` Rules of Engagement (RoE) & Scope |
| `6.2` | Conduct Security Control Testing | `6.2.1` Vulnerability Scanning vs. Penetration Testing (Known/Partially Known/Unknown Environment), `6.2.2` SAST, DAST, IAST, SCA, Fuzzing, Code Review, Breach & Attack Simulation |
| `6.3` | Collect Security Process Data | `6.3.1` Account Management Reviews, Management Review & KPIs/KRIs, Backup Verification, Disaster Recovery Tabletop/Full-Interruption Metrics |
| `6.4` | Analyze Test Output and Generate Report | `6.4.1` False Positives vs. False Negatives, CVSS Prioritization, Remediation Tracking & Exception Handling |
| `6.5` | Conduct or Facilitate Security Audits | `6.5.1` SOC 1 (Type I/II), SOC 2 (Type I/II), SOC 3, ISO 27001 Audits |

### Domain 7: Security Operations (`dom-7` · Weight: 13%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `7.1` | Understand and Comply with Investigations | `7.1.1` Digital Forensics Order of Volatility (RFC 3227), Chain of Custody, `7.1.2` Evidence Types (Best, Secondary, Direct, Circumstantial, Hearsay) & eDiscovery |
| `7.2` | Conduct Logging and Monitoring Activities | `7.2.1` SIEM, SOAR, UEBA, NDR, EDR/XDR, `7.2.2` Log Integrity, NTP Synchronization, Egress Monitoring |
| `7.3` | Configuration Management (CM) & Hardening | `7.3.1` Baseline Images, Drift Detection, Asset Inventory, Change Management Workflow |
| `7.4` | Apply Foundational Security Operations Concepts | `7.4.1` Need-to-Know, Least Privilege, Separation of Duties, Dual Control, Split Knowledge |
| `7.5` | Apply Resource Protection | `7.5.1` Media Management, Hardware/Software Asset Protection |
| `7.6` | Conduct Incident Management | `7.6.1` Incident Response Lifecycle (Detection, Triage, Containment, Eradication, Recovery, Post-Incident / Lessons Learned) |
| `7.7` | Operate and Maintain Detective and Preventative Measures | `7.7.1` IDS/IPS (Signature vs. Anomaly), Honeypots/Honeynets, Sandboxing, Anti-Malware |
| `7.8` | Implement and Support Patch and Vulnerability Management | `7.8.1` Patch Testing, Emergency Out-of-Band Patching, Virtual Patching / Compensating Controls |
| `7.9` | Understand and Participate in Change Management Processes | `7.9.1` CAB Approval, Rollback Plans, Emergency Change Procedures |
| `7.10` | Implement Recovery Strategies | `7.10.1` Backup Types (Full, Incremental, Differential), 3-2-1 Rule, Immutable Backups, `7.10.2` Recovery Sites (Cold, Warm, Hot, Mobile, Cloud/Mirrored), RAID Levels, Clustering |
| `7.11` | Implement Disaster Recovery (DR) Processes | `7.11.1` DRP Activation, Emergency Communications, Restoration vs. Salvage |
| `7.12` | Test Disaster Recovery Plans | `7.12.1` DR Test Types: Read-Through/Checklist, Walkthrough, Simulation, Parallel, Full-Interruption |
| `7.13` | Participate in Business Continuity (BC) Planning and Exercises | `7.13.1` Cross-Functional BC Exercises & Executive Tabletop Drills |
| `7.14` | Implement and Manage Physical Security | `7.14.1` Visitor Logs, Escorts, Tailgating/Piggybacking Prevention, Guard Operations |
| `7.15` | Address Personnel Safety and Security Concerns | `7.15.1` Duress Alarms, Travel Security, Emergency Assembly Points (Human Safety First Rule) |

### Domain 8: Software Development Security (`dom-8` · Weight: 10%)
| `subdomainId` | Sub-Domain Name | Example Micro-Topics (`topicId`) |
|---|---|---|
| `8.1` | Understand and Integrate Security in the SDLC | `8.1.1` SDLC Models (Agile, DevSecOps, Waterfall, Spiral), `8.1.2` Security Gates at Requirements, Design, Coding, Testing, Deployment |
| `8.2` | Identify and Apply Security Controls in Development Environments | `8.2.1` CI/CD Pipeline Security, Secrets Management, IDE/Repo Security, Environment Separation (Dev/Test/Staging/Prod) |
| `8.3` | Assess the Effectiveness of Software Security | `8.3.1` Software Assurance Maturity Model (SAMM / BSIMM), Acceptance Testing |
| `8.4` | Assess Security Impact of Acquired Software | `8.4.1` COTS, SaaS, Open-Source Libraries, SBOM (Software Bill of Materials), Supply Chain Tampering |
| `8.5` | Define and Apply Secure Coding Guidelines and Standards | `8.5.1` OWASP Top 10 (Injection, Broken Access Control, SSRF, XSS, CSRF), `8.5.2` Buffer Overflows, Race Conditions (TOCTOU), Input Validation, Memory Safety, API Security |

---

## 3. Complete Annotated Question JSON Example

Every question file in `src/content/questions/domain-*/` is a JSON array of objects adhering to `QuestionSchema`. Below is a gold-standard example demonstrating how the **self-indicating fields** and **answer explanations** must be authored:

```json
[
  {
    "id": "cissp-d1-s1.4-q001",
    "version": 1,
    "domainId": "dom-1",
    "subdomainId": "1.4",
    "subdomainName": "Risk Management Concepts & Risk Analysis",
    "topicId": "1.4.2",
    "topicName": "Quantitative Risk Analysis & Cost-Benefit Evaluation (ALE, SLE, ARO, ACS)",
    "cognitiveLevel": "evaluate",
    "perspective": "risk_advisor",
    "questionStyle": "best_answer",
    "difficulty": 4,
    "difficultyLabel": "exam_hard",
    "estimatedTimeSeconds": 90,
    "conceptsTested": [
      "Annualized Loss Expectancy (ALE)",
      "Single Loss Expectancy (SLE)",
      "Exposure Factor (EF)",
      "Countermeasure Value / Cost-Benefit Analysis",
      "Residual Risk Acceptance"
    ],
    "keyTerms": ["AV", "EF", "SLE", "ARO", "ALE", "ACS"],
    "tags": ["quantitative-risk", "think-like-a-manager", "calculation"],
    "stem": "A financial services firm operates a proprietary trading cluster valued at $800,000. Historical threat intelligence indicates that a targeted DDoS event occurs once every 4 years and results in a 30% loss of asset value per occurrence. A security vendor proposes a cloud-based DDoS scrubbing control that costs $55,000 per year and reduces the Exposure Factor (EF) to 5% without changing the frequency of attacks. As the Information Security Risk Advisor reporting to senior management, what is the BEST recommendation?",
    "scenarioContext": "Asset Value (AV) = $800,000 | Pre-control EF = 30% | ARO = 0.25 (once every 4 years) | Annual Control Cost (ACS) = $55,000 | Post-control EF = 5%",
    "highlightKeywords": ["BEST", "Risk Advisor"],
    "options": [
      {
        "id": "A",
        "text": "Reject the proposed control because its annual cost exceeds the net annual risk reduction by $5,000, and evaluate lower-cost alternatives or risk acceptance.",
        "isCorrect": true,
        "explanation": "Correct. Pre-control SLE = $800,000 × 0.30 = $240,000. With ARO = 0.25, pre-control ALE_1 = $240,000 × 0.25 = $60,000. Post-control SLE = $800,000 × 0.05 = $40,000, so post-control ALE_2 = $40,000 × 0.25 = $10,000. The annual risk reduction is ($60,000 - $10,000) = $50,000. Because the safeguard costs $55,000/year (ACS), its net value is $50,000 - $55,000 = -$5,000/year.",
        "trapType": null
      },
      {
        "id": "B",
        "text": "Approve the control immediately because reducing the Exposure Factor from 30% to 5% eliminates the majority of technical DDoS impact.",
        "isCorrect": false,
        "explanation": "Incorrect. While the EF drops from 30% to 5%, a CISSP Risk Advisor never recommends a control based purely on percentage technical reduction without first calculating the net financial benefit (ALE_1 - ALE_2 - ACS) and presenting the business case to senior management.",
        "trapType": "technical_fix_over_process"
      },
      {
        "id": "C",
        "text": "Deploy an on-premises hardware scrubbing appliance immediately to bring the Exposure Factor to 0% regardless of annual maintenance cost.",
        "isCorrect": false,
        "explanation": "Incorrect. Total risk elimination (0% EF) is unrealistic and violates cost-benefit proportionality in CISSP risk management.",
        "trapType": "extreme_absolutist"
      },
      {
        "id": "D",
        "text": "Transfer 100% of the regulatory and reputational accountability to the cloud DDoS provider via a Service Level Agreement (SLA).",
        "isCorrect": false,
        "explanation": "Incorrect. While financial liability can be partially shared or insured, ultimate accountability for risk and regulatory compliance can NEVER be transferred away from senior management.",
        "trapType": "confuses_similar_terms"
      }
    ],
    "explanation": {
      "correctOptionId": "A",
      "summary": "Quantitative cost-benefit analysis requires comparing the Annualized Loss Expectancy before the control (ALE_1 = $60,000) and after the control (ALE_2 = $10,000) against the Annualized Cost of the Safeguard (ACS = $55,000): Value = (ALE_1 - ALE_2) - ACS = -$5,000.",
      "managerMindsetTip": "Never approve or reject a control on technical merit alone. Always calculate SLE = AV × EF, ALE = SLE × ARO, and Safeguard Value = (ALE_1 - ALE_2) - ACS. Also remember: financial risk can be transferred, but ultimate accountability always remains with executive management.",
      "studyFocusDirective": "Practice multi-step quantitative risk formulas (SLE, ARO, ALE, and Safeguard Cost-Benefit) where a control reduces either EF or ARO, and verify whether (ALE_1 - ALE_2 - ACS) is positive or negative.",
      "keyTakeaway": "Safeguard Value = (ALE_before - ALE_after) - Annual_Control_Cost. If the result is negative, the control costs more per year than the risk it mitigates.",
      "references": [
        {
          "source": "ISC2 CISSP Official Study Guide (10th Edition)",
          "section": "Chapter 2: Personnel Security and Risk Management Concepts — Quantitative Risk Analysis"
        },
        {
          "source": "NIST SP 800-30 Rev. 1",
          "section": "Guide for Conducting Risk Assessments"
        }
      ]
    }
  }
]
```

> [!IMPORTANT]
> **Math Verification Rule for Question Authoring Agents**: Whenever `questionStyle` is `"calculation"` or involves quantitative numbers (`AV`, `EF`, `SLE`, `ARO`, `ALE`, `MTBF`, `MTTR`, `RTO`, `RPO`), the authoring agent MUST verify the arithmetic so that the numbers in `stem`, `scenarioContext`, and `options` match `explanation.summary` with 100% mathematical precision.

---

## 4. Exam Manifest JSON Examples

### 4.1 Sub-Domain Exam Manifest (`src/content/exams/domain-1/d1-sub-1.4.json`)

```json
{
  "examId": "d1-sub-1.4",
  "title": "Domain 1.4 Drill: Risk Management & Quantitative/Qualitative Analysis",
  "description": "Focused sub-domain assessment covering risk terminology, SLE/ARO/ALE calculations, qualitative risk matrices, risk appetite vs. tolerance, and risk treatment strategies.",
  "examScope": "subdomain",
  "domainId": "dom-1",
  "subdomainId": "1.4",
  "timeLimitMinutes": 35,
  "passingScorePercent": 70,
  "masteryScorePercent": 85,
  "questionIds": [
    "cissp-d1-s1.4-q001",
    "cissp-d1-s1.4-q002",
    "cissp-d1-s1.4-q003",
    "cissp-d1-s1.4-q004",
    "cissp-d1-s1.4-q005",
    "cissp-d1-s1.4-q006",
    "cissp-d1-s1.4-q007",
    "cissp-d1-s1.4-q008",
    "cissp-d1-s1.4-q009",
    "cissp-d1-s1.4-q010",
    "cissp-d1-s1.4-q011",
    "cissp-d1-s1.4-q012",
    "cissp-d1-s1.4-q013",
    "cissp-d1-s1.4-q014",
    "cissp-d1-s1.4-q015",
    "cissp-d1-s1.4-q016",
    "cissp-d1-s1.4-q017",
    "cissp-d1-s1.4-q018",
    "cissp-d1-s1.4-q019",
    "cissp-d1-s1.4-q020"
  ]
}
```

### 4.2 Full Domain Exam Manifest (`src/content/exams/domain-1/d1-full-01.json`)

```json
{
  "examId": "d1-full-01",
  "title": "Domain 1 Full Exam: Security and Risk Management (Comprehensive)",
  "description": "Full-length Domain 1 mastery assessment spanning all 12 sub-domains (1.1 through 1.12), weighted to mirror official ISC2 CISSP exam emphasis.",
  "examScope": "domain_full",
  "domainId": "dom-1",
  "subdomainId": null,
  "timeLimitMinutes": 90,
  "passingScorePercent": 70,
  "masteryScorePercent": 85,
  "blueprintWeights": {
    "1.1": 0.06,
    "1.2": 0.08,
    "1.3": 0.10,
    "1.4": 0.16,
    "1.5": 0.08,
    "1.6": 0.08,
    "1.7": 0.10,
    "1.8": 0.08,
    "1.9": 0.10,
    "1.10": 0.06,
    "1.11": 0.04,
    "1.12": 0.06
  },
  "questionIds": [
    "cissp-d1-s1.1-q001",
    "cissp-d1-s1.1-q002",
    "cissp-d1-s1.2-q001",
    "cissp-d1-s1.3-q001",
    "cissp-d1-s1.4-q001"
  ]
}
```

### 4.3 Full CISSP (Overall) Exam Manifest (`src/content/exams/overall/full-01.json`)

Predefined sets spanning all 8 domains use `examScope: "overall"` with `domainId: "all"` and `subdomainId: null` (the schema rejects `"all"` on any other scope).

```json
{
  "examId": "full-01",
  "title": "Full CISSP Set 1",
  "description": "Fixed 100-question set weighted across all 8 domains.",
  "examScope": "overall",
  "domainId": "all",
  "subdomainId": null,
  "timeLimitMinutes": 120,
  "questionIds": ["cissp-d1-s1.4-q001", "cissp-d7-s7.6-q001", "..."]
}
```

### 4.4 Content Is Picked Up Automatically (No Code Changes)

Adding content never requires touching application code:

| You add… | Where | What appears automatically |
|---|---|---|
| Question JSON array | `src/content/questions/<any-folder>/<any-name>.json` | Question counts on Home / Exams / Domain / Study pages; the questions become eligible for every auto-generated exam (full CISSP, domain, sub-domain drill, weak-area review); `keyTakeaway` text shows on the Study map. Domains/sub-domains with zero questions switch from "coming soon" to playable. |
| Exam manifest JSON | `src/content/exams/<any-folder>/<any-name>.json` | A **fixed set** card: `overall` → Exams › Full exam; `domain_full` → the domain page and Exams › Domains; `subdomain` → inside that sub-domain's row. |

Auto-generated exams are assembled in the browser by `src/lib/exam-engine/assembler.ts`, which mirrors CISSP item selection: blueprint-weighted apportionment (domain `weightPercent` → sub-domain `weight` → topics), redistribution of quota from areas with no items, a difficulty mix centred on exam-level items (`DIFFICULTY_TARGET`), exposure control (unseen → previously missed → previously correct), and a randomised interleaved order. Time limits follow CAT pacing (1.2 min per item).

Run `npm run build` after adding files — schema violations fail the build.

---

## 5. Diagnostic Output Contract (`DiagnosticReport`)

When `completeSession()` runs in the browser, it computes and saves a `DiagnosticReport` object inside `ExamSessionRecord.diagnosticReport`. All graphical components (`SubdomainGapChart`, `DomainRadarChart`, `TrapBreakdownChart`, `ConfidenceMatrix`, `PacingTimeline`, `StrengthWeaknessTable`) consume this exact structure:

```typescript
export interface BreakdownNode {
  id: string;                        // e.g. "1.4" (subdomain) or "1.4.2" (topic)
  name: string;
  level: 'subdomain' | 'topic';
  parentId: string;                  // "dom-1" or "1.4"
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  rawAccuracyPercent: number;        // 0 - 100
  difficultyWeightedPercent: number; // 0 - 100
  confidenceAdjustedPercent: number; // 0 - 100
  gapToPassPercent: number;          // max(0, 70 - rawAccuracyPercent)
  gapToMasteryPercent: number;       // max(0, 85 - confidenceAdjustedPercent)
  priorityGapIndex: number;          // Higher = more urgent to study
  masteryTier: 'mastered' | 'proficient' | 'developing' | 'critical_weakness';
  blindSpotCount: number;            // High confidence + Wrong
  luckyGuessCount: number;           // Low confidence + Right
  avgTimeSpentSeconds: number;
  avgEstimatedTimeSeconds: number;
  studyDirectives: string[];         // Aggregated from missed/weak questions in this node
}

export interface DiagnosticReport {
  sessionId: string;
  examId: string;
  computedAt: string;

  // 1. Executive Summary KPIs
  overall: {
    totalQuestions: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    rawAccuracyPercent: number;
    difficultyWeightedPercent: number;
    confidenceAdjustedPercent: number;
    passedBenchmark: boolean;        // rawAccuracyPercent >= 70
    achievedMastery: boolean;        // confidenceAdjustedPercent >= 85
    gapToPassPercent: number;
    gapToMasteryPercent: number;
    totalTimeSpentSeconds: number;
    timeLimitSeconds: number;
  };

  // 2. Hierarchical Breakdown (Powers Radar Chart, Gap Bullet Chart, and Strength/Weakness Table)
  subdomainBreakdown: BreakdownNode[];
  topicBreakdown: BreakdownNode[];

  // 3. Sorted Action Lists
  topWeaknesses: BreakdownNode[];    // Sorted descending by priorityGapIndex
  topStrengths: BreakdownNode[];     // Filtered by masteryTier === 'mastered' | 'proficient', sorted by confidenceAdjustedPercent

  // 4. Metacognitive Matrix (Powers 2x2 Quadrant Chart)
  metacognition: {
    solidMasteryQuestionIds: string[];    // Correct + High/Med Confidence
    luckyGuessQuestionIds: string[];      // Correct + Low Confidence
    knownGapQuestionIds: string[];        // Incorrect + Low/Med Confidence
    blindSpotQuestionIds: string[];       // Incorrect + High Confidence
  };

  // 5. Behavioral & Cognitive Diagnostics (Powers Trap & Cognitive Charts)
  trapTallies: Array<{
    trapType: string;
    label: string;
    count: number;
    shareOfErrorsPercent: number;
    questionIds: string[];
    remediationAdvice: string;
  }>;

  cognitiveBreakdown: Array<{
    cognitiveLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate';
    total: number;
    correct: number;
    accuracyPercent: number;
  }>;

  perspectiveBreakdown: Array<{
    perspective: string;
    total: number;
    correct: number;
    accuracyPercent: number;
  }>;

  // 6. Pacing Diagnostics (Powers Pacing Timeline)
  pacing: {
    rushedErrorQuestionIds: string[];     // Incorrect & timeSpent < 0.4 * estimatedTime
    timeSinkQuestionIds: string[];        // timeSpent > 1.5 * estimatedTime
    perQuestionPacing: Array<{
      questionNumber: number;
      questionId: string;
      timeSpentSeconds: number;
      estimatedTimeSeconds: number;
      isCorrect: boolean;
    }>;
  };
}
```

---

## 6. Authoring Checklist for Question Generation Agents

When an agent is instructed to generate CISSP questions for any domain or sub-domain:
1. **Scenario Realism**: At least 75% of questions in any pack must be scenario-based (`apply`, `analyze`, `evaluate`), reflecting the CISSP CAT exam style rather than trivial one-line definitions.
2. **Plausible Distractors**: Every wrong option must look realistic to an unprepared technical candidate. Tag each wrong option with the exact `trapType` it represents.
3. **Complete Per-Option Rationales**: Never write `"Incorrect. B is not right."` Explain *why* that option is tempting, *what concept* it actually describes, and *why* the correct option supersedes it.
4. **Balanced Coverage**: Across a sub-domain question pack, ensure every micro-topic (`topicId`) in that sub-domain has at least 3–5 questions spanning difficulties `2` through `5`.
5. **Strict ID Convention**: Use `cissp-d<domainNum>-s<subdomainId>-q<001..999>` (e.g., `cissp-d3-s3.6-q012`) so IDs never collide across parallel authoring agents.
