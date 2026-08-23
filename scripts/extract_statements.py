#!/usr/bin/env python3
"""
Local-only statement extraction. Reads Amex CSVs and Chase PDFs from
~/Documents/bank statements/, classifies each transaction as
income/spending/other/transfer (plus a best-effort merchantCategory /
merchantSubcategory for spending), and prints a JSON array to stdout —
{account, date, amount, category, merchantCategory, merchantSubcategory,
description, dedupeHash} per line item.

As of 2026-08 the raw merchant description IS included in the output (the
`description` field) so real transactions can be reviewed and categorized
by hand downstream — import-transactions.mjs encrypts it before it touches
the database, same as amount. dedupeHash is still a one-way SHA-256
fingerprint of date+description+amount, used downstream to avoid importing
the same transaction twice.

This script does not touch the network or the database — it only reads
local files and prints JSON to stdout for another (local) process to
consume.
"""
import csv
import glob
import hashlib
import json
import os
import re
import sys

STATEMENTS_DIR = os.path.expanduser("~/Documents/bank statements")

INCOME_PATTERN = re.compile(r"amazon|whole\s*foods", re.IGNORECASE)
TRANSFER_PATTERNS = [
    re.compile(r"online transfer to", re.IGNORECASE),
    re.compile(r"online transfer from", re.IGNORECASE),
    re.compile(r"transfer to sav", re.IGNORECASE),
    re.compile(r"american express", re.IGNORECASE),
    re.compile(r"amex.*epayment", re.IGNORECASE),
    re.compile(r"epayment", re.IGNORECASE),
]
AMEX_PAYMENT_PATTERN = re.compile(r"payment.*thank you|autopay", re.IGNORECASE)

MONEY_TOKEN = re.compile(r"-?[\d,]+\.\d{2}")

# Best-effort merchant-type classification, built from the real merchant
# tokens in this data. Only applied to category="spending" transactions.
# First matching pattern wins; anything unmatched falls into "other" rather
# than guessing wrong. Key = merchantSubcategory (fine-grained); each maps
# to a broader merchantCategory umbrella via SUBCATEGORY_TO_CATEGORY below.
# Both are starting points — meant to be corrected by hand once real
# descriptions are reviewed, not treated as final.
MERCHANT_CATEGORY_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("groceries", re.compile(r"whole\s*foods|wholefds|h-e-b|\bheb\b|trader\s*joe|kroger", re.IGNORECASE)),
    # Coffee shops before the general dining pattern — starbucks/desnudo
    # used to fall through to "dining" since that pattern also matched them
    # and came first; keeping this ahead of it is what fixes that.
    ("coffee_shop", re.compile(
        r"starbucks|desnudo|la colombe|blank street|\bbsc\b|blue bottle|"
        r"merit coffee|cafe creme|dunkin|petes coffee|ruta maya",
        re.IGNORECASE,
    )),
    ("dining", re.compile(
        r"tst\*|thundercloud|torchys|sonic drive|papalote|"
        r"flo'?s|slice|olive garden|doordash|\bdd\b|grubhub|ubereats",
        re.IGNORECASE,
    )),
    ("transport", re.compile(r"lyft|uber(?!eats)|\bnyct\b|transit|parking", re.IGNORECASE)),
    ("gas", re.compile(r"exxon|mobil|texaco|chevron|shell|buc-?ee'?s|conoco|valero", re.IGNORECASE)),
    ("airport", re.compile(r"airport|hudson st\d|\bairp\b", re.IGNORECASE)),
    ("flights", re.compile(r"delta air|southwest|\bairlines\b|\bflight\b", re.IGNORECASE)),
    ("airbnb", re.compile(r"airbnb", re.IGNORECASE)),
    ("hotel", re.compile(r"courtyard|marriott|hilton|\bhotel\b|homewood suit|sheraton", re.IGNORECASE)),
    ("subscriptions", re.compile(
        r"hulu|netflix|spotify|crunchyroll|nvidia|epic games|asana|mlb\.?tv|"
        r"squarespace|google \*|spectrum|comcast|xfinity|apple\.com/bill",
        re.IGNORECASE,
    )),
    ("gym", re.compile(r"la fitness|planet fitness|equinox|\bgym\b|yoga|crossfit", re.IGNORECASE)),
    ("dental", re.compile(r"dentistry|\bdental\b", re.IGNORECASE)),
    ("vision", re.compile(r"zenni|eyecare|eye care|optical", re.IGNORECASE)),
    ("pharmacy", re.compile(r"\bpharmacy\b|\bcvs\b|walgreens", re.IGNORECASE)),
    ("doctor", re.compile(r"\bmedical\b|\bclinic\b|\bdoctor\b|urgent care", re.IGNORECASE)),
    # Specific known insurers — insurance type can't be inferred from
    # generic text, so this only catches carriers seen in real statements.
    ("insurance_auto", re.compile(r"progressive ins|geico|allstate|state farm", re.IGNORECASE)),
    ("insurance_renters", re.compile(r"asi lloyds", re.IGNORECASE)),
    ("phone_internet", re.compile(r"\batt\b|bell south|verizon|t-mobile", re.IGNORECASE)),
    ("electric_water", re.compile(r"city of \w+.*payment|electric|water dept", re.IGNORECASE)),
    ("loans", re.compile(r"bmwfs|bmw bank|auto loan|student loan|mortgage|loan pymt", re.IGNORECASE)),
    ("shopping", re.compile(r"amazon|target\b|bookpeople|walmart|best buy|\bcostco\b", re.IGNORECASE)),
    ("personal_transfer", re.compile(r"venmo|paypal(?! \*)|apple cash|zelle|cash app", re.IGNORECASE)),
    ("personal_care", re.compile(r"cleaners|salon|barber|spa\b", re.IGNORECASE)),
]

# merchantSubcategory -> merchantCategory umbrella. Anything not listed here
# (including "other") falls back to merchantCategory = merchantSubcategory,
# i.e. no umbrella grouping applied yet — left for the manual review pass.
SUBCATEGORY_TO_CATEGORY: dict[str, str] = {
    "groceries": "food",
    "coffee_shop": "food",
    "dining": "food",
    "transport": "transport",
    "gas": "transport",
    "airport": "travel",
    "flights": "travel",
    "airbnb": "travel",
    "hotel": "travel",
    "subscriptions": "subscriptions",
    "gym": "fitness",
    "climbing_gym": "fitness",
    "supplements": "fitness",
    "dental": "health",
    "vision": "health",
    "pharmacy": "health",
    "doctor": "health",
    "urgent_care": "health",
    "auto": "insurance",
    "renters": "insurance",
    "phone_internet": "utilities",
    "electric_water": "utilities",
    "loans": "debt",
    "shopping": "shopping",
    "personal_transfer": "personal_transfer",
    "personal_care": "personal_care",
}

# insurance_auto/insurance_renters exist only to disambiguate by carrier
# name at classification time — the stored merchantSubcategory should just
# read "auto"/"renters" (the category already says "insurance").
SUBCATEGORY_RENAME: dict[str, str] = {
    "insurance_auto": "auto",
    "insurance_renters": "renters",
}


def classify_merchant_subcategory(description: str) -> str:
    for subcategory, pattern in MERCHANT_CATEGORY_PATTERNS:
        if pattern.search(description):
            return SUBCATEGORY_RENAME.get(subcategory, subcategory)
    return "other"


# Tracks how many times a given (date, description, amount) signature has
# been seen so far in this run, so two genuinely distinct transactions that
# happen to share all three (e.g. two identical coffee purchases the same
# day) get distinct hashes instead of colliding and silently dropping one.
_signature_counts: dict[str, int] = {}


def dedupe_hash(date_str: str, description: str, amount: float) -> str:
    signature = f"{date_str}|{description.strip()}|{amount:.2f}"
    occurrence = _signature_counts.get(signature, 0)
    _signature_counts[signature] = occurrence + 1
    raw = f"{signature}|{occurrence}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_amex(path: str) -> list[dict]:
    out = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            date_str = row.get("Date", "").strip()
            desc = row.get("Description", "").strip()
            amount_str = row.get("Amount", "").strip()
            if not date_str or not amount_str:
                continue
            amount = float(amount_str)
            mm, dd, yyyy = date_str.split("/")
            iso_date = f"{yyyy}-{mm}-{dd}"

            if AMEX_PAYMENT_PATTERN.search(desc):
                category = "transfer"
                stored_amount = amount
            else:
                category = "spending"
                # Normalize sign convention to match Chase (and every other
                # account): negative = cash outflow, positive = inflow. Amex's
                # raw export is the opposite for charges (positive = charged),
                # so flip it here at the source rather than juggling two sign
                # conventions everywhere downstream.
                stored_amount = -amount

            subcategory = classify_merchant_subcategory(desc) if category == "spending" else None
            out.append(
                {
                    "account": "Amex",
                    "date": iso_date,
                    "amount": stored_amount,
                    "category": category,
                    "merchantSubcategory": subcategory,
                    "merchantCategory": SUBCATEGORY_TO_CATEGORY.get(subcategory, subcategory)
                    if subcategory
                    else None,
                    "description": desc,
                    "dedupeHash": dedupe_hash(date_str, desc, amount),
                }
            )
    return out


def _parse_candidate(
    full_text: str, begin_amount: float, end_amount: float, block_start: int, block_end: int,
    start_year: int | None, end_year: int | None,
) -> tuple[list[dict], float]:
    """Parses one candidate transaction-detail block. Returns (transactions,
    computed_ending_balance) so the caller can pick whichever candidate
    section actually reconciles against the statement's own stated balance."""
    block = full_text[block_start:block_end]
    date_pat = re.compile(r"(?<![\d/])(\d{2}/\d{2})(?!/)")
    matches = list(date_pat.finditer(block))

    running_balance = begin_amount
    transactions = []
    for i, m in enumerate(matches):
        chunk_start = m.start()
        # Bound each chunk to a short window after its date: real transaction
        # lines (description + optional card number + amount + balance) are
        # well under this length. This matters most for the *last* chunk,
        # which has no following date to stop it and would otherwise bleed
        # into trailing footer prose (fee disclosures, deposit totals, etc.)
        # that also contains dollar-amount-shaped numbers.
        natural_end = matches[i + 1].start() if i + 1 < len(matches) else len(block)
        chunk_end = min(natural_end, chunk_start + 250)
        chunk = block[chunk_start:chunk_end]
        date_str = m.group(1)

        money_tokens = MONEY_TOKEN.findall(chunk)
        if not money_tokens:
            continue  # not a real transaction line (e.g. a stray date in prose)

        new_balance = float(money_tokens[-1].replace(",", ""))
        amount = round(new_balance - running_balance, 2)
        if amount == 0:
            continue

        # description = chunk with the date and all money tokens stripped.
        # Used for classification and, as of 2026-08, included in the
        # script's output (see module docstring).
        desc = chunk[len(date_str):]
        desc = MONEY_TOKEN.sub("", desc)
        desc = re.sub(r"\s+", " ", desc).strip()

        mm, dd = date_str.split("/")
        # Statement periods span a year boundary (e.g. Feb–Mar); assign the
        # year from whichever end of the period this month falls closer to.
        year = start_year
        if start_year and end_year and start_year != end_year and int(mm) <= 2:
            year = end_year
        iso_date = f"{year}-{mm}-{dd}" if year else f"2026-{mm}-{dd}"

        if amount > 0:
            category = "income" if INCOME_PATTERN.search(desc) else "other"
        else:
            is_transfer = any(p.search(desc) for p in TRANSFER_PATTERNS)
            category = "transfer" if is_transfer else "spending"

        subcategory = classify_merchant_subcategory(desc) if category == "spending" else None
        transactions.append(
            {
                "account": "Chase Checking",
                "date": iso_date,
                "amount": amount,
                "category": category,
                "merchantSubcategory": subcategory,
                "merchantCategory": SUBCATEGORY_TO_CATEGORY.get(subcategory, subcategory)
                if subcategory
                else None,
                "description": desc,
                "dedupeHash": dedupe_hash(date_str, desc, amount),
            }
        )
        running_balance = new_balance

    return transactions, round(running_balance, 2)


def parse_chase(path: str) -> tuple[list[dict], dict]:
    """Returns (transactions, checksum_info). checksum_info reports whether
    the sum of parsed transaction amounts reconciles with the statement's
    own Beginning/Ending Balance — a correctness guard, not a data value.

    Some statements repeat a short account-summary blurb (e.g. a combined
    checking+savings overview) right next to the real per-account detail
    section, each with its own Beginning/Ending Balance mention. Rather than
    assume the first occurrence is the real one, every candidate section is
    parsed and the one whose transactions actually reconcile to the stated
    ending balance is kept.
    """
    from pypdf import PdfReader

    reader = PdfReader(path)
    full_text = "\n".join(p.extract_text() for p in reader.pages)

    begin_matches = list(
        re.finditer(r"Beginning Balance\s*\$?([\d,]+\.\d{2})", full_text)
    )
    end_matches = list(re.finditer(r"Ending Balance\s*\$?([\d,]+\.\d{2})", full_text))
    detail_positions = [m.start() for m in re.finditer(r"TRANSACTION DETAIL", full_text)]
    if not begin_matches or not end_matches:
        return [], {"ok": False, "reason": "beginning/ending balance not found"}

    period_match = re.search(
        r"([A-Z][a-z]+ \d{1,2}, (\d{4})) through ([A-Z][a-z]+ \d{1,2}, (\d{4}))",
        full_text,
    )
    start_year = int(period_match.group(2)) if period_match else None
    end_year = int(period_match.group(4)) if period_match else None

    best = None  # (ok, transaction_count, transactions, checksum_dict)
    for begin_match, end_match in zip(begin_matches, end_matches):
        beginning_balance = float(begin_match.group(1).replace(",", ""))
        stated_ending_balance = float(end_match.group(1).replace(",", ""))

        # The summary box itself extracts out of visual order — "Ending
        # Balance" appears in the text *before* the itemized transaction
        # list, not after. The real per-transaction lines start right after
        # that summary box and run until the next "TRANSACTION DETAIL"
        # heading (also out of order, trailing the list rather than
        # introducing it).
        block_start = end_match.end()
        next_detail = next((p for p in detail_positions if p > block_start), None)
        block_end = next_detail if next_detail is not None else len(full_text)

        transactions, computed_ending = _parse_candidate(
            full_text, beginning_balance, stated_ending_balance,
            block_start, block_end, start_year, end_year,
        )
        ok = abs(computed_ending - stated_ending_balance) < 0.01
        checksum = {
            "ok": ok,
            "beginning_balance": beginning_balance,
            "stated_ending_balance": stated_ending_balance,
            "computed_ending_balance": computed_ending,
            "transaction_count": len(transactions),
        }
        # Prefer a reconciled candidate; among those (or if none reconcile),
        # prefer the one with the most transactions — the real itemized
        # section, not a short teaser summary.
        candidate = (ok, len(transactions), transactions, checksum)
        if best is None or candidate[:2] > best[:2]:
            best = candidate

    _, _, transactions, checksum = best
    return transactions, checksum


def main():
    all_transactions = []
    checksums = {}

    for path in sorted(glob.glob(os.path.join(STATEMENTS_DIR, "*.csv"))) + sorted(
        glob.glob(os.path.join(STATEMENTS_DIR, "*.CSV"))
    ):
        name = os.path.basename(path)
        if name.lower().startswith("amex"):
            all_transactions.extend(parse_amex(path))

    for path in sorted(glob.glob(os.path.join(STATEMENTS_DIR, "chase*.pdf"))):
        name = os.path.basename(path)
        txns, checksum = parse_chase(path)
        checksums[name] = checksum
        all_transactions.extend(txns)

    result = {"transactions": all_transactions, "checksums": checksums}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
