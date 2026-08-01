#!/usr/bin/env python3
"""Extract plain text from a .docx file using only the Python standard library.

A .docx is a ZIP archive; the document body lives in `word/document.xml`. We
read that part, convert paragraph/line/tab markup to whitespace, strip the
remaining XML tags, and unescape entities. No third-party dependency needed
(mirrors the dependency-light approach of pdf_to_markdown.py, but stdlib-only).
"""
import json
import re
import sys
import zipfile


def _xml_to_text(xml: str) -> str:
    # Convert Word structural markup to whitespace BEFORE stripping tags so we
    # keep paragraph/line breaks and tabs.
    xml = re.sub(r"<w:tab\b[^>]*/?>", "\t", xml)
    xml = re.sub(r"<w:br\b[^>]*/?>", "\n", xml)
    xml = re.sub(r"<w:cr\b[^>]*/?>", "\n", xml)
    xml = re.sub(r"</w:p>", "\n", xml)
    # Drop everything else that is a tag; run text (<w:t>…</w:t>) survives.
    text = re.sub(r"<[^>]+>", "", xml)
    # Unescape the XML entities that appear in document.xml.
    text = (
        text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
    )
    text = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), text)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    # Ampersand last so we don't double-decode the entities above.
    text = text.replace("&amp;", "&")
    # Normalise whitespace: trim trailing spaces per line, collapse blank runs.
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract(path: str) -> str:
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if "word/document.xml" not in names:
            raise ValueError("Not a Word .docx file (missing word/document.xml).")
        with archive.open("word/document.xml") as handle:
            xml = handle.read().decode("utf-8", "replace")
    return _xml_to_text(xml)


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "No .docx path provided."}))
        return
    try:
        text = extract(sys.argv[1])
        print(json.dumps({"ok": True, "text": text}))
    except Exception as err:  # noqa: BLE001 — surface any failure to the caller
        print(json.dumps({"ok": False, "error": str(err)}))


if __name__ == "__main__":
    main()
