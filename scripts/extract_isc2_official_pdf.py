#!/usr/bin/env python3
"""
Extract all questions, options, answers, explanations, chapter/domain metadata,
and embedded figures from:
  "ref books/CISSP Official (ISC)2 Practice Test.pdf"

Outputs (all git-ignored under scripts/extracted/):
  scripts/extracted/isc2_official_raw.json                - Full structured dataset
  scripts/extracted/isc2_official_extraction_report.json  - Audit & anomaly report
  scripts/extracted/isc2_official_images/                 - Non-opener page images
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pypdf
from pdfminer.high_level import extract_pages
from pdfminer.layout import LAParams, LTTextContainer, LTTextLine

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF_PATH = REPO_ROOT / "ref books" / "CISSP Official (ISC)2 Practice Test.pdf"
OUTPUT_DIR = REPO_ROOT / "scripts" / "extracted"
IMAGES_DIR = OUTPUT_DIR / "isc2_official_images"

CHAPTER_META = [
    {"chapter": 1, "title": "Security and Risk Management (Domain 1)", "domainId": "dom-1", "qPages": (14, 38), "aHint": 330},
    {"chapter": 2, "title": "Asset Security (Domain 2)", "domainId": "dom-2", "qPages": (40, 62), "aHint": 339},
    {"chapter": 3, "title": "Security Architecture and Engineering (Domain 3)", "domainId": "dom-3", "qPages": (64, 90), "aHint": 350},
    {"chapter": 4, "title": "Communication and Network Security (Domain 4)", "domainId": "dom-4", "qPages": (92, 114), "aHint": 359},
    {"chapter": 5, "title": "Identity and Access Management (Domain 5)", "domainId": "dom-5", "qPages": (116, 138), "aHint": 370},
    {"chapter": 6, "title": "Security Assessment and Testing (Domain 6)", "domainId": "dom-6", "qPages": (140, 162), "aHint": 381},
    {"chapter": 7, "title": "Security Operations (Domain 7)", "domainId": "dom-7", "qPages": (164, 186), "aHint": 393},
    {"chapter": 8, "title": "Software Development Security (Domain 8)", "domainId": "dom-8", "qPages": (188, 212), "aHint": 405},
    {"chapter": 9, "title": "Practice Test 1", "domainId": None, "qPages": (214, 242), "aHint": 416},
    {"chapter": 10, "title": "Practice Test 2", "domainId": None, "qPages": (244, 270), "aHint": 430},
    {"chapter": 11, "title": "Practice Test 3", "domainId": None, "qPages": (272, 298), "aHint": 443},
    {"chapter": 12, "title": "Practice Test 4", "domainId": None, "qPages": (300, 328), "aHint": 457},
]

QUESTION_CHAPTER_OPENERS = {13, 39, 63, 91, 115, 139, 163, 187, 213, 243, 271, 299}
APPENDIX_PAGE_RANGE = (330, 470)  # 1-based inclusive


def extract_all_pdfminer_pages(pdf_path: Path, page_numbers_1based: list[int]) -> dict[int, str]:
    """
    Single-pass pdfminer extraction reconstructing true visual lines sorted by
    (visual row y, left x0) so narrow left-margin item numbers ("5.") never swap
    vertically with adjacent answer/stem lines.
    """
    laparams = LAParams(char_margin=2.0, line_margin=0.5, boxes_flow=None)
    zero_based = [p - 1 for p in page_numbers_1based]
    result: dict[int, str] = {}
    for pno_1b, page_layout in zip(page_numbers_1based, extract_pages(str(pdf_path), page_numbers=zero_based, laparams=laparams)):
        lines: list[LTTextLine] = []
        for elem in page_layout:
            if isinstance(elem, LTTextContainer):
                for child in elem:
                    if isinstance(child, LTTextLine) and child.get_text().strip():
                        lines.append(child)
        lines.sort(key=lambda ln: (-ln.y1, ln.x0))
        rows: list[list[LTTextLine]] = []
        for ln in lines:
            if not rows or abs(rows[-1][0].y1 - ln.y1) > 4.0:
                rows.append([ln])
            else:
                rows[-1].append(ln)

        out_lines: list[str] = []
        prev_y0: float | None = None
        for r in rows:
            r.sort(key=lambda ln: ln.x0)
            row_y1 = max(ln.y1 for ln in r)
            row_y0 = min(ln.y0 for ln in r)
            if prev_y0 is not None and (prev_y0 - row_y1) > 6.0:
                out_lines.append("")
            out_lines.append(" ".join(ln.get_text().strip() for ln in r))
            prev_y0 = row_y0

        result[pno_1b] = "\n".join(out_lines)
    return result


def clean_question_page(raw_text: str) -> str:
    """Remove top running header/footer page numbers from question pages."""
    # Normalize non-breaking spaces
    text = raw_text.replace("\xa0", " ")
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Strip leading empty lines, standalone page number, and "Chapter X ■ Title"
    non_empty_indices = [idx for idx, ln in enumerate(lines) if ln.strip()]
    strip_indices: set[int] = set()
    for idx in non_empty_indices[:4]:
        s = lines[idx].strip()
        if re.fullmatch(r"\d{1,3}", s):
            strip_indices.add(idx)
        elif re.match(r"^(?:\d{1,3}\s+)?Chapter\s+\d+\s+■\s+.+?(?:\s+\d{1,3})?$", s):
            strip_indices.add(idx)
        else:
            break
    for idx in reversed(non_empty_indices[-2:]):
        s = lines[idx].strip()
        if re.fullmatch(r"\d{1,3}", s):
            strip_indices.add(idx)
        else:
            break
    kept = [ln for idx, ln in enumerate(lines) if idx not in strip_indices]
    return "\n".join(kept)


def clean_appendix_page(raw_text: str) -> str:
    """Remove even/odd Appendix running headers & page numbers while keeping mid-page Chapter headings."""
    text = raw_text.replace("\xa0", " ")
    lines = [ln.rstrip() for ln in text.splitlines()]
    non_empty = [idx for idx, ln in enumerate(lines) if ln.strip()]
    strip_indices: set[int] = set()

    # Check first up to 3 non-empty lines for running headers:
    # Even page: "<pno>" + "Appendix ■ Answers" (or vice versa)
    # Odd page: "<pno>" + "Chapter N: <title>" (or "Chapter N: <title>" + "<pno>")
    top = non_empty[:3]
    if top:
        l0 = lines[top[0]].strip()
        if re.match(r"^(?:\d{1,3}\s+)?Appendix\s+■\s+Answers(?:\s+\d{1,3})?$", l0):
            strip_indices.add(top[0])
        elif re.match(r"^(?:\d{1,3}\s+)?Chapter\s+\d+\s*:.*\s+\d{1,3}$", l0) or re.match(
            r"^\d{1,3}\s+Chapter\s+\d+\s*:", l0
        ):
            strip_indices.add(top[0])
        elif len(top) >= 2:
            l1 = lines[top[1]].strip()
            if (re.fullmatch(r"\d{1,3}", l0) and re.match(r"^Appendix\s+■\s+Answers$", l1)) or (
                re.match(r"^Appendix\s+■\s+Answers$", l0) and re.fullmatch(r"\d{1,3}", l1)
            ):
                strip_indices.add(top[0])
                strip_indices.add(top[1])
            elif (re.match(r"^Chapter\s+\d+\s*:", l0) and re.fullmatch(r"\d{1,3}", l1)) or (
                re.fullmatch(r"\d{1,3}", l0) and re.match(r"^Chapter\s+\d+\s*:", l1)
            ):
                strip_indices.add(top[0])
                strip_indices.add(top[1])
    # Standalone trailing page number at very bottom if any
    if non_empty:
        last_idx = non_empty[-1]
        if re.fullmatch(r"\d{1,3}", lines[last_idx].strip()):
            strip_indices.add(last_idx)

    kept = [ln for idx, ln in enumerate(lines) if idx not in strip_indices]
    return "\n".join(kept)


def reflow_paragraphs(text: str) -> str:
    """Reflow wrapped PDF lines into clean paragraphs while preserving intentional breaks."""
    lines = [ln.rstrip() for ln in text.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ""

    out_lines: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            out_lines.append(" ".join(buf))
            buf.clear()

    for ln in lines:
        s = re.sub(r"\s{2,}", " ", ln.strip())
        if not s:
            flush()
            if out_lines and out_lines[-1] != "":
                out_lines.append("")
            continue

        is_special = bool(
            re.match(r"^([-*•■]|\d+[.)]|[A-Da-d][.)])\s+", s)
            or re.match(r"^(?:[A-Z0-9_]+\s*=|[{}[\];]|SELECT\s|INSERT\s|chmod\s|-[rwx-]{9})", s)
        )
        if is_special:
            flush()
            out_lines.append(s)
            continue

        if buf:
            prev = buf[-1]
            if prev.endswith("-") and not prev.endswith(" -"):
                buf[-1] = prev + s
            else:
                buf.append(s)
        else:
            buf.append(s)

    flush()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out_lines)).strip()


def extract_non_opener_images(pdf_path: Path) -> dict[int, list[str]]:
    """Save embedded images from non-opener question pages under scripts/extracted/isc2_official_images."""
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    reader = pypdf.PdfReader(str(pdf_path))
    page_to_images: dict[int, list[str]] = {}
    for pno in range(13, 329):
        if pno in QUESTION_CHAPTER_OPENERS:
            continue
        page = reader.pages[pno - 1]
        if not page.images:
            continue
        saved: list[str] = []
        for idx, img in enumerate(page.images, start=1):
            ext = Path(img.name).suffix.lower() or ".bin"
            fname = f"p{pno:03d}_img{idx}{ext}"
            out_path = IMAGES_DIR / fname
            out_path.write_bytes(img.data)
            saved.append(f"isc2_official_images/{fname}")
        page_to_images[pno] = saved
    return page_to_images


def split_sequential_numbered_blocks(
    tagged_lines: list[tuple[int, str]], mode: str
) -> list[dict[str, Any]]:
    """
    Split chapter text lines into sequential numbered items (1, 2, ..., N).
    In 'question' mode, only accept N+1 once current question already has option markers
    (A. / B.) or sub-item section completed, preventing matching sub-lists (1..4) from
    causing premature question splits.
    """
    item_re = re.compile(r"^\s*(\d{1,3})\.(?:\s+(.*))?$")
    option_marker_re = re.compile(r"^\s*[A-D]\.(?:\s+|$)")

    blocks: list[dict[str, Any]] = []
    expected = 1
    current_num: int | None = None
    current_lines: list[str] = []
    current_pages: set[int] = set()
    seen_option_in_current = False

    for pno, line in tagged_lines:
        m = item_re.match(line)
        if m:
            num = int(m.group(1))
            rest = (m.group(2) or "").strip()
            # In answer mode, skip numbered matching sub-items like "3. Evil twin: A. ..." or "1. Category 5e: B. ..."
            is_matching_subitem = mode == "answer" and bool(
                re.match(r"^[^:\n]{1,65}:\s*(?:[A-F]\.|Type\s+\d)", rest)
            )
            if (
                num == expected
                and not is_matching_subitem
                and (current_num is None or mode == "answer" or seen_option_in_current)
            ):
                if current_num is not None:
                    blocks.append(
                        {
                            "number": current_num,
                            "pages": sorted(current_pages),
                            "rawText": "\n".join(current_lines),
                        }
                    )
                current_num = num
                current_lines = [line]
                current_pages = {pno}
                seen_option_in_current = False
                # For single-line answers like "1. D. ...", line itself doesn't affect question mode
                expected += 1
                continue

        if current_num is not None:
            if option_marker_re.match(line):
                seen_option_in_current = True
            current_lines.append(line)
            current_pages.add(pno)

    if current_num is not None:
        blocks.append(
            {
                "number": current_num,
                "pages": sorted(current_pages),
                "rawText": "\n".join(current_lines),
            }
        )
    return blocks


def parse_question_block(raw_text: str) -> dict[str, Any]:
    """Parse question number, stem, options A-D (or more), and style flags."""
    anomalies: list[str] = []
    # Strip leading "N."
    body = re.sub(r"^\s*\d{1,3}\.\s*", "", raw_text, count=1)

    opt_matches = list(re.finditer(r"(?m)^\s*([A-F])\.(?:\s+|$)", body))
    if not opt_matches:
        anomalies.append("no_options_found")
        return {
            "stem": reflow_paragraphs(body),
            "options": [],
            "questionFormat": "unparsed",
            "anomalies": anomalies,
        }

    # If multiple option blocks exist or letters repeat (unlikely), take sequential A..D/F from first 'A'
    first_a = next((m for m in opt_matches if m.group(1) == "A"), opt_matches[0])
    start_idx = opt_matches.index(first_a)
    selected_matches = opt_matches[start_idx:]

    stem_raw = body[: selected_matches[0].start()]
    stem = reflow_paragraphs(stem_raw)

    options: list[dict[str, str]] = []
    for idx, m in enumerate(selected_matches):
        opt_id = m.group(1)
        start = m.end()
        end = selected_matches[idx + 1].start() if idx + 1 < len(selected_matches) else len(body)
        opt_text = reflow_paragraphs(body[start:end])
        options.append({"id": opt_id, "text": opt_text})

    # Strip shared scenario preambles ("For questions 37-39..." / "Using ... answer questions 13 through 15...")
    # or floating diagrams/tables appended below the final option after a blank line ("\n\n").
    trailing_scenario: dict[str, str] = {}
    if options:
        last_txt = options[-1]["text"]
        if "\n\n" in last_txt:
            head, tail = last_txt.split("\n\n", 1)
            m_rng = re.search(
                r"(?i)\bquestions?\s+(\d+)\s*(?:[–-]|through|to|and)\s*(\d+)\b", tail
            )
            options[-1]["text"] = head.strip()
            if m_rng:
                trailing_scenario = {
                    "startQ": m_rng.group(1),
                    "endQ": m_rng.group(2),
                    "text": tail.strip(),
                }
            else:
                stem = f"{stem}\n\n{tail.strip()}".strip()
        else:
            m_scen = re.search(r"(?ims)^\s*(For\s+questions?\s+(\d+)\s*(?:[–-]|through|to|and)\s*(\d+).*)\Z", last_txt)
            if m_scen:
                options[-1]["text"] = last_txt[: m_scen.start()].strip()
                trailing_scenario = {
                    "startQ": m_scen.group(2),
                    "endQ": m_scen.group(3),
                    "text": m_scen.group(1).strip(),
                }

    # Detect question format
    q_format = "single_choice"
    stem_l = stem.lower()
    if (
        stem_l.startswith("match ")
        or "match each " in stem_l
        or "match the following" in stem_l
        or ("descriptions" in stem_raw.lower() and re.search(r"(?m)^\s*1\.\s+", stem_raw))
    ):
        q_format = "matching"
    elif re.search(r"\b(rearrange|place\b.*\bin\b.*\border|in\s+order\s+from|from\s+least\b.*\bto\s+most|from\s+layer\s+1\s+to)\b", stem_l):
        q_format = "ordering"
    elif re.search(r"\b(choose|select)\s+(two|three|all\s+that\s+apply|2|3)\b", stem_l):
        q_format = "multi_select"

    opt_ids = [o["id"] for o in options]
    if q_format in ("single_choice", "multi_select") and opt_ids != ["A", "B", "C", "D"]:
        anomalies.append(f"non_standard_options:{''.join(opt_ids)}")

    return {
        "stem": stem,
        "options": options,
        "questionFormat": q_format,
        "trailingScenario": trailing_scenario,
        "anomalies": anomalies,
    }


def parse_answer_block(raw_text: str, q_format: str) -> dict[str, Any]:
    """Parse Appendix answer letter(s), matching pairs, or ordered sequence plus explanation text."""
    body = re.sub(r"^\s*\d{1,3}\.\s*", "", raw_text, count=1).strip()
    anomalies: list[str] = []

    if q_format == "matching":
        pairs_num = re.findall(r"(?m)^\s*(\d+)\.\s*([^\n:]+):\s*([A-F])\.\s*(.+)$", body)
        pairs_let = re.findall(r"(?m)^\s*([A-F])\.\s*([^\n:]+):\s*(.+)$", body)
        if pairs_num:
            mapping = {
                int(num): {"term": term.strip(), "letter": let, "description": desc.strip()}
                for num, term, let, desc in pairs_num
            }
            return {
                "correctAnswer": ",".join(f"{k}:{v['letter']}" for k, v in sorted(mapping.items())),
                "correctAnswers": [f"{k}:{v['letter']}" for k, v in sorted(mapping.items())],
                "matchingPairs": mapping,
                "explanation": reflow_paragraphs(body),
                "anomalies": anomalies,
            }
        if pairs_let:
            mapping_let = {
                let: {"item": item.strip(), "target": tgt.strip()}
                for let, item, tgt in pairs_let
            }
            return {
                "correctAnswer": ",".join(f"{k}:{v['target']}" for k, v in sorted(mapping_let.items())),
                "correctAnswers": [f"{k}:{v['target']}" for k, v in sorted(mapping_let.items())],
                "matchingPairs": mapping_let,
                "explanation": reflow_paragraphs(body),
                "anomalies": anomalies,
            }
        anomalies.append("matching_pairs_unparsed")
        return {
            "correctAnswer": "",
            "correctAnswers": [],
            "explanation": reflow_paragraphs(body),
            "anomalies": anomalies,
        }

    if q_format == "ordering":
        seq_letters = re.findall(r"(?m)^\s*([A-F])\.\s+", body)
        if len(seq_letters) >= 3:
            return {
                "correctAnswer": ",".join(seq_letters),
                "correctAnswers": seq_letters,
                "explanation": reflow_paragraphs(body),
                "anomalies": anomalies,
            }

    # Standard single or comma-separated answers: "D.  The final step..." or "A, C. ..." or "A and C. ..."
    m_single = re.match(
        r"^([A-F](?:\s*(?:,|and|&)\s*[A-F])*)\.\s*(.*)$",
        body,
        flags=re.DOTALL,
    )
    if m_single:
        raw_ans = m_single.group(1)
        letters = re.findall(r"[A-F]", raw_ans)
        correct_answer = letters[0] if len(letters) == 1 else ",".join(letters)
        expl = reflow_paragraphs(m_single.group(2))
        return {
            "correctAnswer": correct_answer,
            "correctAnswers": letters,
            "explanation": expl,
            "anomalies": anomalies,
        }

    anomalies.append("answer_letter_unparsed")
    return {
        "correctAnswer": "",
        "correctAnswers": [],
        "explanation": reflow_paragraphs(body),
        "anomalies": anomalies,
    }


def split_appendix_chapters(appendix_pages: dict[int, str]) -> dict[int, list[tuple[int, str]]]:
    """Split cleaned Appendix pages into Chapter 1..12 tagged line lists."""
    # Concatenate tagged lines first, then locate each "Chapter N:" section boundary cleanly
    all_lines: list[tuple[int, str]] = []
    for pno in sorted(appendix_pages.keys()):
        cleaned = clean_appendix_page(appendix_pages[pno])
        for ln in cleaned.splitlines():
            all_lines.append((pno, ln))

    chapters: dict[int, list[tuple[int, str]]] = {}
    current_chap: int | None = None
    chap_hdr_re = re.compile(r"^\s*Chapter\s+(\d{1,2})\s*:\s*(.+)$")

    skip_next_wrapped_title = False
    for pno, ln in all_lines:
        if skip_next_wrapped_title:
            s = ln.strip()
            if s and not re.match(r"^\d+\.", s):
                # Continuation of wrapped Chapter title line like "Management (Domain 1)"
                skip_next_wrapped_title = False
                continue
            skip_next_wrapped_title = False

        m = chap_hdr_re.match(ln)
        if m:
            cnum = int(m.group(1))
            if 1 <= cnum <= 12 and cnum not in chapters:
                current_chap = cnum
                chapters[current_chap] = []
                # If title wrapped across lines (doesn't end with "(Domain X)" or "Test N")
                tail = m.group(2).strip()
                if "Domain" not in tail and "Test" not in tail:
                    skip_next_wrapped_title = True
                continue

        if current_chap is not None:
            chapters[current_chap].append((pno, ln))

    return chapters


def main() -> None:
    pdf_path = DEFAULT_PDF_PATH
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    print(f"Extracting text via pdfminer from: {pdf_path}")
    # Pages to read: all question content pages + appendix pages
    q_pages_needed: list[int] = []
    for cm in CHAPTER_META:
        s_p, e_p = cm["qPages"]
        q_pages_needed.extend(range(s_p, e_p + 1))
    a_pages_needed = list(range(APPENDIX_PAGE_RANGE[0], APPENDIX_PAGE_RANGE[1] + 1))

    page_texts = extract_all_pdfminer_pages(pdf_path, sorted(set(q_pages_needed + a_pages_needed)))
    print(f"Extracted {len(page_texts)} pages of text.")

    page_images = extract_non_opener_images(pdf_path)
    print(f"Extracted images from {len(page_images)} non-opener question pages -> {IMAGES_DIR}")

    appendix_sub = {p: page_texts[p] for p in a_pages_needed}
    appendix_by_chap = split_appendix_chapters(appendix_sub)

    all_questions: list[dict[str, Any]] = []
    chapter_summaries: list[dict[str, Any]] = []
    anomaly_counts: Counter[str] = Counter()
    format_counts: Counter[str] = Counter()
    global_idx = 0

    for cm in CHAPTER_META:
        cnum = cm["chapter"]
        s_p, e_p = cm["qPages"]
        q_tagged: list[tuple[int, str]] = []
        for pno in range(s_p, e_p + 1):
            cleaned = clean_question_page(page_texts[pno])
            for ln in cleaned.splitlines():
                q_tagged.append((pno, ln))

        q_blocks = split_sequential_numbered_blocks(q_tagged, mode="question")
        a_blocks = split_sequential_numbered_blocks(appendix_by_chap.get(cnum, []), mode="answer")
        a_map = {b["number"]: b for b in a_blocks}

        q_nums = [b["number"] for b in q_blocks]
        a_nums = sorted(a_map.keys())
        mismatch = len(q_nums) != len(a_nums) or q_nums != a_nums

        pending_scenarios: list[tuple[int, int, str]] = []

        for qb in q_blocks:
            global_idx += 1
            qnum = qb["number"]
            pq = parse_question_block(qb["rawText"])
            ts = pq.get("trailingScenario") or {}
            if ts:
                pending_scenarios.append((int(ts["startQ"]), int(ts["endQ"]), ts["text"]))

            active_scen = [txt for sq, eq, txt in pending_scenarios if sq <= qnum <= eq]

            ab = a_map.get(qnum)
            if ab:
                pa = parse_answer_block(ab["rawText"], pq["questionFormat"])
            else:
                pa = {
                    "correctAnswer": "",
                    "correctAnswers": [],
                    "explanation": "",
                    "anomalies": ["missing_appendix_answer"],
                }

            imgs: list[str] = []
            for pno in qb["pages"]:
                imgs.extend(page_images.get(pno, []))

            q_anomalies = pq["anomalies"] + pa["anomalies"]
            if imgs:
                q_anomalies.append("has_page_image")
            for a in q_anomalies:
                anomaly_counts[a] += 1
            format_counts[pq["questionFormat"]] += 1

            item: dict[str, Any] = {
                "globalIndex": global_idx,
                "chapter": cnum,
                "chapterTitle": cm["title"],
                "bookDomainId": cm["domainId"],
                "questionNumber": qnum,
                "questionPages": qb["pages"],
                "answerPages": ab["pages"] if ab else [],
                "questionFormat": pq["questionFormat"],
                "sharedScenario": "\n".join(active_scen) if active_scen else "",
                "stem": pq["stem"],
                "options": pq["options"],
                "correctAnswer": pa["correctAnswer"],
                "correctAnswers": pa["correctAnswers"],
                "explanation": pa["explanation"],
                "imageAssets": imgs,
                "anomalies": q_anomalies,
                "stemSha256": hashlib.sha256(pq["stem"].encode("utf-8")).hexdigest()[:16],
            }
            if "matchingPairs" in pa:
                item["matchingPairs"] = pa["matchingPairs"]
            all_questions.append(item)

        chapter_summaries.append(
            {
                "chapter": cnum,
                "title": cm["title"],
                "domainId": cm["domainId"],
                "parsedQuestions": len(q_blocks),
                "parsedAnswers": len(a_blocks),
                "aligned": not mismatch,
                "qRange": [q_nums[0], q_nums[-1]] if q_nums else [],
                "aRange": [a_nums[0], a_nums[-1]] if a_nums else [],
            }
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_out = OUTPUT_DIR / "isc2_official_raw.json"
    report_out = OUTPUT_DIR / "isc2_official_extraction_report.json"

    payload = {
        "sourcePdf": str(pdf_path),
        "bookTitle": "(ISC)2 CISSP Official Practice Tests (2nd Edition)",
        "authors": "Mike Chapple, David Seidl",
        "totalQuestions": len(all_questions),
        "questions": all_questions,
    }
    raw_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    report = {
        "sourcePdf": str(pdf_path),
        "totalQuestions": len(all_questions),
        "chapterSummaries": chapter_summaries,
        "formatCounts": dict(format_counts),
        "anomalyCounts": dict(anomaly_counts),
        "imagePagesCount": len(page_images),
    }
    report_out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {len(all_questions)} questions -> {raw_out}")
    print(f"Wrote extraction report -> {report_out}")
    print("Chapter alignment:")
    for cs in chapter_summaries:
        print(f"  Ch {cs['chapter']:2d} ({cs['title'][:36]:36s}): Q={cs['parsedQuestions']:3d} A={cs['parsedAnswers']:3d} aligned={cs['aligned']}")
    print("Formats:", dict(format_counts))
    print("Anomalies:", dict(anomaly_counts))


if __name__ == "__main__":
    main()
