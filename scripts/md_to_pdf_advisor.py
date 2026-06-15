#!/usr/bin/env python3
"""Render the Jessica Solomon advisor-questions markdown into a styled PDF."""
import re
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, ListFlowable, ListItem,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

SRC = "docs/business/advisor-questions-jessica-solomon.md"
OUT = "docs/business/advisor-questions-jessica-solomon.pdf"

INK = HexColor("#1a1a2e")
ACCENT = HexColor("#2d5f8a")
MUTED = HexColor("#6b6b80")
RULE = HexColor("#c9c9d4")

styles = getSampleStyleSheet()
base = dict(fontName="Helvetica", textColor=INK, leading=15, fontSize=10.5)

H1 = ParagraphStyle("H1", **{**base, "fontName": "Helvetica-Bold",
                             "fontSize": 20, "leading": 24, "textColor": INK,
                             "spaceAfter": 4})
H2 = ParagraphStyle("H2", **{**base, "fontName": "Helvetica-Bold",
                             "fontSize": 14, "leading": 18, "textColor": ACCENT,
                             "spaceBefore": 14, "spaceAfter": 6})
BODY = ParagraphStyle("BODY", **{**base, "spaceAfter": 6, "alignment": TA_LEFT})
ITALIC = ParagraphStyle("ITALIC", **{**base, "fontName": "Helvetica-Oblique",
                                     "textColor": MUTED, "fontSize": 9.5,
                                     "leading": 13, "spaceAfter": 6})
QUOTE = ParagraphStyle("QUOTE", **{**base, "fontName": "Helvetica-Oblique",
                                   "leftIndent": 16, "textColor": HexColor("#333344"),
                                   "borderColor": ACCENT, "spaceAfter": 6,
                                   "backColor": HexColor("#f2f5f9"),
                                   "borderPadding": (8, 8, 8, 10), "leading": 15})
BULLET = ParagraphStyle("BULLET", **{**base, "spaceAfter": 3, "leading": 14})


def inline(text):
    """Convert markdown inline emphasis/code into reportlab markup."""
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier" size="9.5">\1</font>', text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    return text


def build():
    with open(SRC) as f:
        lines = f.read().split("\n")

    story = []
    i = 0
    pending_bullets = []

    def flush_bullets():
        nonlocal pending_bullets
        if pending_bullets:
            items = [ListItem(Paragraph(inline(b), BULLET), leftIndent=14,
                              value="•") for b in pending_bullets]
            story.append(ListFlowable(items, bulletType="bullet", start="•",
                                      leftIndent=12, bulletColor=ACCENT,
                                      spaceAfter=6))
            pending_bullets = []

    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("# "):
            flush_bullets()
            story.append(Paragraph(inline(line[2:]), H1))
        elif line.startswith("## "):
            flush_bullets()
            story.append(Paragraph(inline(line[3:]), H2))
        elif line.startswith("### "):
            flush_bullets()
            story.append(Paragraph(inline(line[4:]), H2))
        elif line.strip() == "---":
            flush_bullets()
            story.append(Spacer(1, 4))
            story.append(HRFlowable(width="100%", thickness=0.6, color=RULE,
                                    spaceBefore=2, spaceAfter=8))
        elif line.startswith("> "):
            flush_bullets()
            # gather consecutive quote lines
            quote = [line[2:]]
            while i + 1 < len(lines) and lines[i + 1].startswith(">"):
                i += 1
                quote.append(lines[i].lstrip(">").strip())
            story.append(Paragraph(inline(" ".join(quote)), QUOTE))
        elif line.startswith("- "):
            pending_bullets.append(line[2:])
        elif line.startswith("*") and line.endswith("*") and len(line) > 2:
            flush_bullets()
            story.append(Paragraph(inline(line.strip("*")), ITALIC))
        elif line.strip() == "":
            flush_bullets()
        else:
            flush_bullets()
            story.append(Paragraph(inline(line), BODY))
        i += 1
    flush_bullets()

    doc = SimpleDocTemplate(OUT, pagesize=letter,
                            leftMargin=0.85 * inch, rightMargin=0.85 * inch,
                            topMargin=0.8 * inch, bottomMargin=0.8 * inch,
                            title="Advisor Questions — Jessica Solomon")
    doc.build(story)
    print("wrote", OUT)


if __name__ == "__main__":
    build()
