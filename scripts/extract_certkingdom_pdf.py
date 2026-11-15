#!/usr/bin/env python3
"""
Extract all 1,373 CISSP questions, options, answers, explanations, references,
embedded images, and book metadata from:
  "ref books/CISSP Exam (1373 Q & A with Explanation).pdf"

Outputs:
  scripts/extracted/certkingdom_1373_raw.json   - Complete structured dataset
  scripts/extracted/extraction_report.json      - Audit summary & anomalies
  scripts/extracted/images/                     - Extracted PDF images (if any)

This produces the clean intermediate JSON dataset ready for downstream
CISSP CBK domain/subdomain/topic classification and diagnostic metadata
enrichment (Phase 2).
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import pypdf

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF_PATH = REPO_ROOT / "ref books" / "CISSP Exam (1373 Q & A with Explanation).pdf"
OUTPUT_DIR = REPO_ROOT / "scripts" / "extracted"
IMAGES_DIR = OUTPUT_DIR / "images"

# Regex patterns for CertKingdom PDF structure
QUESTION_SPLIT_RE = re.compile(r"(?m)^\s*QUESTION\s+(\d+)\s*$")
ANSWER_LINE_RE = re.compile(r"(?m)^\s*Answer:\s*([A-D])\s*$")
OPTION_LINE_RE = re.compile(r"(?m)^\s*([A-F])\.\s+")

REF_HEADER_RE = re.compile(
    r"(?im)^\s*(?:"
    r"(?:the\s+following\s+)?reference\s*\(?s?\)?\s*(?:were\s*/\s*was|was|were)?\s*(?:used|use)?\s*(?:for|to\s+create)?\s*(?:theis|this)?\s*quesit?on\s*:?"
    r"|reference\s*\(?s?\)?\s*used\s+for\s+this\s+question\s*:?"
    r"|references?\s*:?"
    r"|source\s*:"
    r")\s*(.*)$"
)

INCORRECT_HEADER_RE = re.compile(
    r"(?im)^\s*(?:"
    r"(?:the\s+following|following)\s+(?:answers?|choices?|options?)\s+(?:are|were)\s+(?:all\s+)?(?:incorrect(?:\s+answers?)?|wrong)"
    r"|(?:the\s+following\s+were\s+)?incorrect\s+answers?\s*(?:are)?"
    r"|all\s+of\s+the\s+other\s+(?:answers?|choices?|options?|detractors)\s+(?:are|were)\s+(?:incorrect|wrong|bogus|not\s+true|only\s+detractors|simply\s+detractors)[^\n]*"
    r")\s*:?\s*(.*)$"
)

EXPLANATION_PREFIX_RE = re.compile(r"(?is)^\s*Explanation\s*:\s*")
BOILERPLATE_ANSWER_ECHO_RE = re.compile(
    r"(?is)^(?:Details\s*:\s*)?(?:The\s+)?\n?\s*Answer\s*:\s*(?=[^\n]{2,})"
)


def clean_pdf_lines(raw_text: str) -> list[str]:
    """Strip CertKingdom running headers/footers and stray single-digit watermark artifacts."""
    cleaned: list[str] = []
    for line in raw_text.splitlines():
        stripped = line.strip()
        if stripped == "CISSP":
            continue
        if "www.certkingdom.com" in stripped:
            continue
        # Pages ~765+ contain a repeating 0-9 single-digit artifact on standalone lines
        if re.fullmatch(r"\d", stripped):
            continue
        cleaned.append(line.rstrip())
    return cleaned


def reflow_paragraphs(text: str) -> str:
    """
    Reflow hard-wrapped PDF lines into clean paragraphs while preserving
    intentional line breaks for lists, binary/code examples, and blank lines.
    """
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Trim leading/trailing blank lines
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    if not lines:
        return ""

    out_lines: list[str] = []
    buf: list[str] = []

    def flush_buf() -> None:
        if buf:
            out_lines.append(" ".join(buf))
            buf.clear()

    for ln in lines:
        s = ln.strip()
        if not s:
            flush_buf()
            if out_lines and out_lines[-1] != "":
                out_lines.append("")
            continue

        # Preserve explicit list items, binary/code lines, headings, URLs
        is_special = bool(
            re.match(r"^([-*•]|\d+[.)]|[a-zA-Z][.)])\s+", s)
            or re.match(r"^[01]{4}\s+[01]{4}", s)
            or re.match(r"^https?://", s, re.I)
            or (len(s) < 60 and s.isupper() and any(c.isalpha() for c in s))
        )
        if is_special:
            flush_buf()
            out_lines.append(s)
            continue

        if buf:
            prev = buf[-1]
            # Handle hyphenated line breaks like "McGraw-\nHill" -> "McGraw-Hill"
            if prev.endswith("-") and not prev.endswith(" -"):
                buf[-1] = prev + s
            else:
                buf.append(s)
        else:
            buf.append(s)

    flush_buf()
    result = "\n".join(out_lines)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def parse_stem_and_options(pre_answer: str) -> tuple[str, list[dict[str, str]], list[str]]:
    """Extract question stem and A/B/C/D (or anomaly) options from pre-Answer block."""
    anomalies: list[str] = []
    matches = list(OPTION_LINE_RE.finditer(pre_answer))

    if not matches:
        anomalies.append("no_options_found")
        return reflow_paragraphs(pre_answer), [], anomalies

    stem = reflow_paragraphs(pre_answer[: matches[0].start()])
    options: list[dict[str, str]] = []
    for idx, m in enumerate(matches):
        opt_id = m.group(1)
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(pre_answer)
        opt_text = reflow_paragraphs(pre_answer[start:end])
        # Collapse internal single newlines in short option text
        opt_text = re.sub(r"\s*\n\s*", " ", opt_text).strip()
        options.append({"id": opt_id, "text": opt_text})

    opt_ids = [o["id"] for o in options]
    if opt_ids != ["A", "B", "C", "D"]:
        anomalies.append(f"unexpected_option_ids:{','.join(opt_ids)}")

    return stem, options, anomalies


def parse_references(raw_ref_block: str) -> list[str]:
    """Split a raw reference block into clean individual reference citations/URLs."""
    if not raw_ref_block.strip():
        return []

    refs: list[str] = []
    lines = [ln.strip() for ln in raw_ref_block.splitlines()]
    current: list[str] = []

    for ln in lines:
        if not ln:
            if current:
                refs.append(" ".join(current))
                current.clear()
            continue
        if ln.lower() in {"and", "&"}:
            if current:
                refs.append(" ".join(current))
                current.clear()
            continue
        # Start a new ref entry if it begins with a URL, "Source:", or author/book prefix
        if current and (
            re.match(r"^https?://", ln, re.I)
            or re.match(r"^(?:Source|ISC2|OIG|CBK|AIO|Harris|Shon|NIST|RFC|Wikipedia|Krutz)\b", ln)
        ):
            refs.append(" ".join(current))
            current = [ln]
        else:
            if current and current[-1].endswith("-") and not current[-1].endswith(" -"):
                current[-1] = current[-1] + ln
            else:
                current.append(ln)

    if current:
        refs.append(" ".join(current))

    # Split semicolon-separated citations if not inside URLs
    expanded: list[str] = []
    for ref in refs:
        if ";" in ref and not ref.lower().startswith("http"):
            for part in ref.split(";"):
                part = part.strip()
                if part:
                    expanded.append(part)
        else:
            expanded.append(ref.strip())

    # Deduplicate preserving order
    seen: set[str] = set()
    unique_refs: list[str] = []
    for r in expanded:
        if r and r not in seen:
            seen.add(r)
            unique_refs.append(r)
    return unique_refs


def match_incorrect_option_notes(
    incorrect_text: str, options: list[dict[str, str]], correct_id: str
) -> dict[str, str]:
    """
    Attempt best-effort alignment between paragraphs/bullets in the
    'The following answers are incorrect:' section and the distractor options.
    """
    if not incorrect_text.strip():
        return {}

    distractors = [o for o in options if o["id"] != correct_id]
    if not distractors:
        return {}

    chunks = [c.strip() for c in re.split(r"\n(?:-|\*|\s*\n)", incorrect_text) if c.strip()]
    matched: dict[str, str] = {}

    for chunk in chunks:
        # Check explicit option letter reference like "A is incorrect" or "Option B:"
        m_letter = re.match(r"^(?:Option\s+)?([A-D])\b\s*(?:is\b|:|-|\.)", chunk)
        if m_letter:
            lid = m_letter.group(1)
            if lid != correct_id and lid not in matched:
                matched[lid] = reflow_paragraphs(chunk)
                continue

        # Fuzzy/prefix match against distractor option text
        chunk_norm = re.sub(r"[^a-z0-9]+", " ", chunk.lower()).strip()
        best_opt: str | None = None
        best_score = 0
        for d in distractors:
            if d["id"] in matched:
                continue
            opt_norm = re.sub(r"[^a-z0-9]+", " ", d["text"].lower()).strip()
            if not opt_norm:
                continue
            # Direct prefix match (first 25 chars or full option text)
            prefix = opt_norm[: min(25, len(opt_norm))]
            if chunk_norm.startswith(opt_norm) or (len(prefix) >= 8 and chunk_norm.startswith(prefix)):
                best_opt = d["id"]
                best_score = 100
                break
            # Token overlap
            opt_tokens = set(opt_norm.split())
            chunk_head_tokens = set(chunk_norm.split()[: max(4, len(opt_tokens) + 3)])
            overlap = len(opt_tokens & chunk_head_tokens)
            score = int(100 * overlap / max(1, len(opt_tokens)))
            if score >= 70 and score > best_score:
                best_score = score
                best_opt = d["id"]

        if best_opt:
            matched[best_opt] = reflow_paragraphs(chunk)

    return matched


def parse_post_answer(
    post_answer: str, options: list[dict[str, str]], correct_id: str
) -> dict[str, Any]:
    """Parse Explanation, Incorrect-Answers breakdown, and References from post-Answer block."""
    raw_block = post_answer.strip()
    anomalies: list[str] = []

    has_expl_header = bool(EXPLANATION_PREFIX_RE.match(raw_block))
    body = EXPLANATION_PREFIX_RE.sub("", raw_block, count=1).strip()

    # Check if Explanation starts directly with Reference/Source (no prose explanation)
    ref_start_idx: int | None = None
    ref_inline_tail = ""
    lines = body.splitlines()
    for i, ln in enumerate(lines):
        m_ref = REF_HEADER_RE.match(ln)
        if m_ref:
            # Make sure "Source:" inside an explanation prose isn't a mid-text sentence
            # unless it's at the start or looks like a citation
            stripped_ln = ln.strip()
            if stripped_ln.lower().startswith("source:"):
                tail = m_ref.group(1).strip()
                if not tail and i + 1 >= len(lines):
                    continue
                if tail and not re.search(r"(\d{4}|page|p\.|edition|http|mcgra|wiley|harris|isc2|nist|rfc)", tail, re.I):
                    continue
            ref_start_idx = len("\n".join(lines[:i]))
            ref_inline_tail = m_ref.group(1).strip()
            ref_rest = "\n".join(lines[i + 1 :])
            raw_ref_block = (ref_inline_tail + "\n" + ref_rest).strip()
            expl_only = body[:ref_start_idx].strip()
            break
    else:
        raw_ref_block = ""
        expl_only = body

    # Also catch mid-line "The following reference(s) ..." or "Reference(s) used for this question:"
    if ref_start_idx is None:
        m_mid_ref = re.search(
            r"(?i)(?:^|\s)((?:the\s+following\s+)?reference\s*\(?s?\)?\s*(?:were\s*/\s*was|was|were)?\s*(?:used|use)?\s*(?:for|to\s+create)?\s*(?:theis|this)?\s*quesit?on\s*:)",
            body,
        )
        if m_mid_ref:
            raw_ref_block = body[m_mid_ref.end() :].strip()
            expl_only = body[: m_mid_ref.start()].strip()
            ref_start_idx = m_mid_ref.start()

    # Detect inline "Source: <Author/Book/URL...>" if no dedicated reference header was found
    if ref_start_idx is None:
        m_inline_src = re.search(
            r"(?i)(?:^|\s)(Source\s*:\s*(?:KRUTZ|HARRIS|TIPTON|ISC2|Official|OIG|CBK|AIO|NIST|RFC|State\s+of|Chris\s+Hare|http|[A-Z][a-z]+,\s+[A-Z]).*)$",
            body,
            re.DOTALL,
        )
        if m_inline_src:
            raw_ref_block = m_inline_src.group(1).strip()
            expl_only = body[: m_inline_src.start()].strip()

    # Capture trailing bare citation lines (e.g. "CBK, pp. 329 - 330", "AIO3, pp. 302 - 306", bare URLs)
    if not raw_ref_block:
        expl_lines_tmp = expl_only.splitlines()
        trailing_refs: list[str] = []
        while expl_lines_tmp:
            last = expl_lines_tmp[-1].strip()
            if not last:
                expl_lines_tmp.pop()
                continue
            if re.match(
                r"^(?:CBK|AIO\d*|OIG|Shon\s+Harris|Harris,\s+Shon|Krutz|Tipton|Hernandez|NIST|RFC\s+\d+|https?://)",
                last,
                re.I,
            ) and len(last) < 180 and not last.endswith(("?", ":")):
                # Ensure it looks like a citation (has page/edition/year/URL) rather than prose
                if re.search(r"(\bpp?\.|\bpages?\b|\bedition\b|\bchapter\b|\b19\d\d\b|\b20\d\d\b|https?://|,\s*\d+)", last, re.I):
                    trailing_refs.insert(0, last)
                    expl_lines_tmp.pop()
                    continue
            break
        if trailing_refs:
            raw_ref_block = "\n".join(trailing_refs)
            expl_only = "\n".join(expl_lines_tmp).strip()

    # Remove trailing "Answer:" echo if PDF had an empty trailing Answer: line
    expl_only = re.sub(r"(?m)^\s*Answer:\s*$", "", expl_only).strip()
    # Clean CertKingdom's "Details:\nThe\nAnswer: <term>" prefix if present while preserving term
    expl_only_clean = BOILERPLATE_ANSWER_ECHO_RE.sub("", expl_only).strip()

    # Detect "The following answers are incorrect:" section
    incorrect_section_raw = ""
    main_expl_raw = expl_only_clean
    expl_lines = expl_only_clean.splitlines()
    for i, ln in enumerate(expl_lines):
        m_inc = INCORRECT_HEADER_RE.match(ln)
        if m_inc:
            idx_pos = len("\n".join(expl_lines[:i]))
            main_expl_raw = expl_only_clean[:idx_pos].strip()
            inline = m_inc.group(1).strip()
            rest = "\n".join(expl_lines[i + 1 :]).strip()
            incorrect_section_raw = (inline + "\n" + rest).strip() if inline else rest
            # If the header itself WAS the statement ("All of the other answers are incorrect."), keep it if no rest
            if not incorrect_section_raw:
                incorrect_section_raw = ln.strip()
            break

    main_explanation = reflow_paragraphs(main_expl_raw)
    incorrect_section = reflow_paragraphs(incorrect_section_raw)
    full_explanation = reflow_paragraphs(expl_only_clean)
    references = parse_references(raw_ref_block)
    incorrect_by_option = match_incorrect_option_notes(incorrect_section, options, correct_id)

    if not has_expl_header:
        anomalies.append("missing_explanation_header")
    if not full_explanation:
        anomalies.append("empty_explanation_prose")

    return {
        "fullText": full_explanation,
        "summaryText": main_explanation,
        "incorrectAnswersRaw": incorrect_section or None,
        "incorrectByOption": incorrect_by_option,
        "references": references,
        "rawReferenceBlock": raw_ref_block or None,
        "anomalies": anomalies,
    }


def extract_book(pdf_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run full extraction over the PDF and return (dataset, report)."""
    reader = pypdf.PdfReader(str(pdf_path))
    num_pages = len(reader.pages)

    # Extract cover metadata from page 1
    cover_text = reader.pages[0].extract_text() or ""

    # Concatenate cleaned pages while tracking char offsets -> PDF page numbers
    page_spans: list[tuple[int, int, int]] = []  # (start_char, end_char, page_number)
    chunks: list[str] = []
    cursor = 0
    image_pages: dict[int, list[str]] = {}

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    for page_idx, page in enumerate(reader.pages):
        pno = page_idx + 1
        # Extract embedded images (skip cover page 1 logo)
        if page.images and pno > 1:
            saved_imgs: list[str] = []
            for img_idx, img_file in enumerate(page.images, start=1):
                ext = Path(img_file.name).suffix or ".bin"
                out_name = f"page_{pno:04d}_img_{img_idx}{ext}"
                out_path = IMAGES_DIR / out_name
                out_path.write_bytes(img_file.data)
                saved_imgs.append(f"images/{out_name}")
            image_pages[pno] = saved_imgs

        raw_t = page.extract_text() or ""
        cleaned_lines = clean_pdf_lines(raw_t)
        page_str = "\n".join(cleaned_lines) + "\n"
        start = cursor
        end = cursor + len(page_str)
        page_spans.append((start, end, pno))
        chunks.append(page_str)
        cursor = end

    full_text = "".join(chunks)

    def offset_to_page(pos: int) -> int:
        # Binary search would be faster, linear/bisect is tiny for 1014 pages
        lo, hi = 0, len(page_spans) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            s, e, pno = page_spans[mid]
            if pos < s:
                hi = mid - 1
            elif pos >= e:
                lo = mid + 1
            else:
                return pno
        return page_spans[-1][2]

    matches = list(QUESTION_SPLIT_RE.finditer(full_text))
    questions: list[dict[str, Any]] = []
    seen_stems: dict[str, int] = {}
    anomalies_index: dict[str, list[int]] = defaultdict(list)

    for idx, m in enumerate(matches):
        qnum = int(m.group(1))
        body_start = m.end()
        body_end = matches[idx + 1].start() if idx + 1 < len(matches) else len(full_text)
        body = full_text[body_start:body_end]

        page_start = offset_to_page(m.start())
        page_end = offset_to_page(max(m.start(), body_end - 1))

        ans_match = ANSWER_LINE_RE.search(body)
        if not ans_match:
            raise ValueError(f"Question {qnum} (pages {page_start}-{page_end}) has no Answer line!")

        correct_id = ans_match.group(1)
        pre_answer = body[: ans_match.start()]
        post_answer = body[ans_match.end() :]

        stem, options, pre_anomalies = parse_stem_and_options(pre_answer)
        expl_parsed = parse_post_answer(post_answer, options, correct_id)

        q_images: list[str] = []
        q_img_pages: list[int] = []
        for p in range(page_start, page_end + 1):
            if p in image_pages:
                q_img_pages.append(p)
                q_images.extend(image_pages[p])

        stem_refers_image = bool(
            re.search(
                r"\b(view the image|image below|diagram below|exhibit|see (?:the )?figure|shown in (?:the )?figure)\b",
                stem,
                re.I,
            )
        )

        # Duplicate stem detection inside book
        stem_norm = re.sub(r"\s+", " ", stem.lower()).strip()
        stem_hash = hashlib.sha256(stem_norm.encode("utf-8")).hexdigest()[:12]
        dup_of: int | None = None
        if stem_hash in seen_stems:
            dup_of = seen_stems[stem_hash]
        else:
            seen_stems[stem_hash] = qnum

        q_anomalies = list(pre_anomalies) + list(expl_parsed["anomalies"])
        if stem_refers_image:
            q_anomalies.append("stem_refers_to_image")
        if dup_of is not None:
            q_anomalies.append(f"duplicate_stem_of_Q{dup_of}")

        for a in q_anomalies:
            key = a.split(":")[0]
            anomalies_index[key].append(qnum)

        questions.append(
            {
                "questionNumber": qnum,
                "correctAnswer": correct_id,
                "stem": stem,
                "options": options,
                "explanation": {
                    "fullText": expl_parsed["fullText"],
                    "summaryText": expl_parsed["summaryText"],
                    "incorrectAnswersRaw": expl_parsed["incorrectAnswersRaw"],
                    "incorrectByOption": expl_parsed["incorrectByOption"],
                    "references": expl_parsed["references"],
                },
                "bookMetadata": {
                    "sourceFile": pdf_path.name,
                    "pageStart": page_start,
                    "pageEnd": page_end,
                    "hasEmbeddedImage": bool(q_images),
                    "imagePages": q_img_pages,
                    "imageAssets": q_images,
                    "stemRefersToImage": stem_refers_image,
                    "rawReferenceBlock": expl_parsed["rawReferenceBlock"],
                    "stemHash": stem_hash,
                    "duplicateOfQuestionNumber": dup_of,
                    "anomalies": q_anomalies,
                },
            }
        )

    # Book-level metadata
    pdf_meta = {k.lstrip("/"): str(v) for k, v in (reader.metadata or {}).items()}
    book_meta = {
        "title": "Certified Information Systems Security Professional (CISSP) — 1373 Q & A with Explanation",
        "publisher": "CertKingdom (www.certkingdom.com)",
        "updatedVersion": "15.1",
        "sourcePdfPath": str(pdf_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "totalPages": num_pages,
        "totalQuestionsExtracted": len(questions),
        "coverPageText": reflow_paragraphs("\n".join(clean_pdf_lines(cover_text))),
        "pdfProperties": pdf_meta,
    }

    dataset = {
        "book": book_meta,
        "questions": questions,
    }

    answer_dist = Counter(q["correctAnswer"] for q in questions)
    report = {
        "sourcePdf": book_meta["sourcePdfPath"],
        "totalPages": num_pages,
        "totalQuestionsExtracted": len(questions),
        "questionNumberRange": [questions[0]["questionNumber"], questions[-1]["questionNumber"]]
        if questions
        else [],
        "missingQuestionNumbers": sorted(set(range(1, 1374)) - {q["questionNumber"] for q in questions}),
        "answerDistribution": dict(sorted(answer_dist.items())),
        "questionsWithReferences": sum(1 for q in questions if q["explanation"]["references"]),
        "questionsWithIncorrectNotes": sum(
            1 for q in questions if q["explanation"]["incorrectAnswersRaw"]
        ),
        "questionsWithParsedPerOptionIncorrectNotes": sum(
            1 for q in questions if q["explanation"]["incorrectByOption"]
        ),
        "questionsWithEmbeddedImages": sum(
            1 for q in questions if q["bookMetadata"]["hasEmbeddedImage"]
        ),
        "extractedImageFilesCount": sum(len(v) for v in image_pages.values()),
        "anomalyCounts": {k: len(v) for k, v in sorted(anomalies_index.items())},
        "anomalyQuestionNumbers": {k: v for k, v in sorted(anomalies_index.items())},
    }

    return dataset, report


def main() -> None:
    if not DEFAULT_PDF_PATH.exists():
        raise FileNotFoundError(f"PDF not found at: {DEFAULT_PDF_PATH}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dataset, report = extract_book(DEFAULT_PDF_PATH)

    raw_out = OUTPUT_DIR / "certkingdom_1373_raw.json"
    report_out = OUTPUT_DIR / "extraction_report.json"

    raw_out.write_text(json.dumps(dataset, indent=2, ensure_ascii=False), encoding="utf-8")
    report_out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Extracted {report['totalQuestionsExtracted']} questions -> {raw_out}")
    print(f"Extraction report -> {report_out}")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
