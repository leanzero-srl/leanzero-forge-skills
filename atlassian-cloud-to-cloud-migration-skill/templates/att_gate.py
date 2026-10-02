#!/usr/bin/env python3
"""
att_gate.py — ONE privacy verdict for attachment BYTES, called by every script that uploads a file to the target.

    import att_gate
    v = att_gate.gate(name, data, ctx)        # ctx: see Context below
    v["status"]           "clean" | "HIT" | "HELD_UNREADABLE" | "SECRET"   (anything but "clean" = do not upload)
    v["reasons"]          ["list:<hit> @ <where> (<src>)", "shape:<line> @ ...", "unreadable:<why> @ ...", ...]
    v["blur_candidates"]  OCR lines that carry a finding (feed your blur step)
    v["needs_review"]     True when the only findings come from the name-SHAPE lens (a human looks, then records a verdict)

Why one function: a migration grows several scanners and many upload scripts (copy, release, late release, restore,
replace, comment attachments, report files). Field notes: each new lens (light-on-dark OCR, screenshots inside documents,
people who never had an account, binaries) was added to the scanner of the day, while upload paths that did not call it
kept shipping files the newest lens would have stopped; a restore path with a names-only check re-published a private key;
a blurred document was verified with the lens that had missed the name. Call this right before the PUT/POST, everywhere,
and enforce it with templates/check_upload_paths.py.

What it reads (FAIL CLOSED: anything it cannot read completely is HELD_UNREADABLE):
  archives        zip/jar/war (zipfile), tar/tgz/tbz/txz (tarfile), gz/bz2/xz, 7z/rar/cab via bsdtar - recursive, every
                  member gated as a file; member paths and tar owner names are text too; encrypted members = unreadable
  office (OOXML)  every XML part's text + author attributes; every embedded image OCR'd; EMF/WMF parsed; embeddings recursed
  PDF             pdftotext + pdfinfo metadata + EVERY page rendered and OCR'd (native + upscaled + inverted)
  images          OCR native + 2x/3x upscaled + inverted as a union (the variants read different text: tiny UI text only
                  the upscale reads, other tokens only native produces) + metadata strings. Judge hits on the pixels.
  EMF/WMF         text records (ASCII + UTF-16 strings) + bitmap records decoded to images and OCR'd; others = unreadable
  data: URIs      images embedded in draw.io / SVG / HTML decoded and OCR'd BEFORE any base64 blanking
  e-mail (.eml)   headers, text parts, every attachment recursed
  binaries        ASCII + UTF-16 strings (names, e-mails, user-profile paths) + PNG/JPEG resources carved and OCR'd;
                  an unknown non-executable blob with near-random bytes = unreadable
  video/audio     HELD_UNREADABLE (a recording shows/voices its participants), by extension AND by magic bytes
  secrets         key/keystore/vault file names and extensions, PEM private keys WITH a base64 body (a key-parsing
                  class carries the BEGIN marker as a constant - not a key), Ansible vault headers
  file names      the file name and every archive member path go through the name lenses too

Name lenses (you provide the list lens; the shape lens is built in):
  ctx["names"](text) -> [hits]   YOUR matcher: deny list of people who do not move, keep list allowed, e-mail and employee-id
                                 rules. Without it the gate refuses to call anything clean (status HELD_UNREADABLE).
  shape lens (built in)          people in NO list: "First Last" with a known first name, "Surname, First", e-mail
                                 addresses; per OCR line + over every text. Noisy on UI screenshots by design: a shape-only
                                 finding sets needs_review; a human looks and records the verdict for those exact bytes.

Allowlists are DATA, each entry with a reason and a source (ctx["data_dir"], JSON files, all optional):
  noise_tokens.json       [{"token","scope":"ocr"|"any","reason","source"}]  OCR fragments / ordinary words the matcher hits.
                          Never a lone first name; a token that could be a fragment of a person gets a per-file verdict.
  functional_mailboxes.json [{"address"}|{"suffix"}, "reason"]           removed from text before matching
  oss_credits.json        [{"phrase","reason"}]  e.g. zlib's copyright line (it names its two authors) inside compiled code
  oss_paths.json          [{"regex","reason"}]   dependency trees inside archives (BOOT-INF/lib/*.jar!, node_modules/)
  not_person.json         [{"string","reason","font"?}]  product/UI/company names; "font": true strips it from vector text
  eye_verdicts.json       [{"sha256","verdict":"clean"|"hold","reason","source"}]  never clears SECRET
Context: {"names": callable, "first_names": set (for the shape lens), "data_dir": path, "shape": True,
          "langs": "eng", "threads": 8, "disable": {...}}  ("disable" exists for negative controls in tests)
Requires: Python 3.8+; tesseract, pdftoppm/pdftotext/pdfinfo (poppler) and Pillow for images/PDFs; bsdtar for 7z/rar.
A missing tool makes the files that need it HELD_UNREADABLE - never clean.
"""
import base64
import collections
import email
import gzip
import bz2
import hashlib
import io
import json
import lzma
import math
import os
import re
import shutil
import struct
import subprocess
import tarfile
import tempfile
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor

MAX_DEPTH = 6
MAX_UNPACKED = 2_000_000_000
MEDIA_EXT = {"mp4", "m4v", "mov", "avi", "mkv", "webm", "wmv", "flv", "mpg", "mpeg", "3gp", "ogv", "mp3", "wav", "m4a",
             "aac", "ogg", "oga", "flac", "wma", "opus", "amr"}
OOXML = {"docx", "docm", "dotx", "pptx", "pptm", "ppsx", "potx", "xlsx", "xlsm", "xltx", "vsdx", "odt", "ods", "odp"}
RASTER = {"png", "jpg", "jpeg", "jfif", "gif", "bmp", "webp", "tif", "tiff", "ico"}
SECRET_EXT = {"p12", "pfx", "key", "jks", "keystore", "kdbx", "ppk", "keytab", "gpg", "asc", "pem"}
SECRET_NAMES = {".env", "id_rsa", "id_ed25519", "id_dsa", "id_ecdsa", ".netrc", ".pgpass", "credentials", ".vault_pass"}
EXEC_MAGIC = (b"MZ", b"\x7fELF", b"\xca\xfe\xba\xbe", b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf", b"\xcf\xfa\xed\xfe")
PEM_BODY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----\s*(?:[A-Za-z0-9+/=]{40,}\s*){2,}")
DATAURI = re.compile(r"data:image/[A-Za-z0-9+.\-]+(?:;[A-Za-z0-9=\-]+)*;base64,([A-Za-z0-9+/=%]{40,})")
B64RUN = re.compile(r"[A-Za-z0-9+/=]{200,}")
MAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PROFILE = re.compile(r"(?i)(?:[a-z]:\\users\\|/home/|/users/)([^\\/\s\"'|<>:]{2,40})")
GENERIC_PROFILES = {"public", "default", "administrator", "admin", "all users", "user", "username", "shared", "runner",
                    "builder", "buildagent", "jenkins", "vssadministrator", "appveyor", "travis", "agent"}


def ext_of(name):
    n = name.split("?")[0].rsplit("/", 1)[-1].rsplit("!", 1)[-1]
    return n.rsplit(".", 1)[-1].lower() if "." in n else ""


def _load(ctx, fn):
    d = ctx.get("data_dir")
    p = os.path.join(d, fn) if d else None
    return json.load(open(p, encoding="utf-8")) if p and os.path.exists(p) else []


class _Run:
    def __init__(self, ctx):
        self.ctx, self.seg, self.unread, self.secret, self.jobs = ctx, [], [], [], []
        self.stats = collections.Counter()

    def text(self, where, src, txt):
        if txt and txt.strip():
            self.seg.append({"where": where, "src": src, "txt": txt})

    def un(self, where, why):
        self.unread.append(f"{why} @ {where}")

    def img(self, where, data, ext):
        self.jobs.append((where, data, ext))
        self.stats["images"] += 1


# ------------------------------------------------------------------ OCR
def _tess(path, ctx):
    exe = shutil.which("tesseract")
    if not exe:
        raise RuntimeError("tesseract not installed")
    r = subprocess.run([exe, path, "-", "-l", ctx.get("langs", "eng")], capture_output=True, timeout=300)
    if r.returncode:
        raise RuntimeError("tesseract failed")
    return r.stdout.decode("utf8", "ignore")


def _ocr(data, ext, ctx):
    """native + upscaled + inverted, union. Raises when the image cannot be read (caller marks it unreadable)."""
    from PIL import Image, ImageOps  # Pillow is required for images: without it every image is unreadable
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(io.BytesIO(data))
    im.load()
    if getattr(im, "n_frames", 1) > 1:
        im.seek(0)
    rgb = im.convert("RGB")
    k = 3 if rgb.width < 800 else (2 if rgb.width < 1600 else 1)
    variants = [rgb, ImageOps.invert(rgb)]
    if k > 1:
        up = rgb.resize((rgb.width * k, rgb.height * k), Image.LANCZOS)
        variants += [up, ImageOps.invert(up)]
    out = []
    with tempfile.TemporaryDirectory() as d:
        for i, v in enumerate(variants):
            p = os.path.join(d, f"v{i}.png")
            v.save(p)
            out.append(_tess(p, ctx))
    return "\n".join(out)


def _run_ocr(run):
    uniq = {}
    for j in run.jobs:
        uniq.setdefault(hashlib.sha256(j[1]).hexdigest(), j)

    def one(j):
        where, data, ext = j
        try:
            return where, _ocr(data, ext, run.ctx), None
        except Exception as e:  # fail closed
            return where, None, f"image not readable ({type(e).__name__})"

    with ThreadPoolExecutor(run.ctx.get("threads", 8)) as ex:
        for where, txt, err in ex.map(one, uniq.values()):
            if err:
                run.un(where, err)
            else:
                run.text(where, "ocr", txt)
    run.jobs = []


# ------------------------------------------------------------------ carving + vector images
def _carve(b, min_area=0):
    out = []
    i = 0
    while True:
        i = b.find(b"\x89PNG\r\n\x1a\n", i)
        if i < 0:
            break
        j = b.find(b"IEND", i)
        if j < 0:
            break
        out.append(("png", b[i:j + 8]))
        i = j + 8
    try:
        from PIL import Image
    except ImportError:
        return out
    i = 0
    while len(out) < 400:
        i = b.find(b"\xff\xd8\xff", i)
        if i < 0:
            break
        j, ok = i + 3, None
        for _ in range(30):
            j = b.find(b"\xff\xd9", j)
            if j < 0:
                break
            try:
                Image.open(io.BytesIO(b[i:j + 2])).load()
                ok = b[i:j + 2]
                break
            except Exception:
                j += 2
        if ok:
            out.append(("jpg", ok))
            i += len(ok)
        else:
            i += 3
    res = []
    for e, x in out:
        try:
            im = Image.open(io.BytesIO(x))
            if im.width * im.height >= min_area:
                res.append((e, x))
        except Exception:
            pass
    return res


def _dib_to_png(bmi, bits=b""):
    from PIL import Image
    hs = struct.unpack_from("<I", bmi, 0)[0]
    bc = struct.unpack_from("<H", bmi, 14)[0] if hs >= 16 else 0
    comp = struct.unpack_from("<I", bmi, 16)[0] if hs >= 20 else 0
    used = struct.unpack_from("<I", bmi, 32)[0] if hs >= 36 else 0
    pal = (used or (1 << bc)) * 4 if bc and bc <= 8 else 0
    pal += 12 if comp == 3 and hs == 40 else 0
    raw = bmi + bits
    bmp = b"BM" + struct.pack("<IHHI", 14 + len(raw), 0, 0, 14 + hs + pal) + raw
    im = Image.open(io.BytesIO(bmp))
    im.load()
    o = io.BytesIO()
    im.convert("RGB").save(o, "PNG")
    return o.getvalue()


def _strings(b):
    a = " ".join(x.decode("latin1") for x in re.findall(rb"[\x20-\x7e]{4,}", b))
    u = " ".join(x.decode("utf-16le", "ignore") for x in re.findall(rb"(?:[\x20-\x7e]\x00){4,}", b))
    return a + "\n" + u


def _vector(data, where, run):
    """EMF/WMF: text strings + bitmap records decoded and OCR'd; bitmap ops we cannot decode = unreadable"""
    run.text(where, "vector", _strings(data))
    imgs, bad = [], []
    if data[40:44] == b" EMF":
        o = 0
        while o + 8 <= len(data):
            t, sz = struct.unpack_from("<II", data, o)
            if sz < 8 or o + sz > len(data):
                bad.append("truncated EMF record")
                break
            r = data[o:o + sz]
            try:
                if t in (80, 81):            # SETDIBITSTODEVICE / STRETCHDIBITS
                    ob, cb, obits, cbits = struct.unpack_from("<IIII", r, 48)
                    if cb:
                        imgs.append(_dib_to_png(r[ob:ob + cb], r[obits:obits + cbits]))
                elif t in (76, 77):          # BITBLT / STRETCHBLT: cbBmiSrc 0 = pattern fill
                    ob, cb, obits, cbits = struct.unpack_from("<IIII", r, 84)
                    if cb:
                        imgs.append(_dib_to_png(r[ob:ob + cb], r[obits:obits + cbits]))
                elif t in (78, 79, 114, 116):
                    bad.append(f"EMF bitmap record {t} not decoded")
            except Exception as e:
                bad.append(f"EMF bitmap record {t} undecodable ({type(e).__name__})")
            if t == 14:
                break
            o += sz
        if b"EMF+" in data:
            imgs += [x for _, x in _carve(data)]
    else:
        o = 22 if data[:4] == b"\xd7\xcd\xc6\x9a" else 0
        o += 18
        while o + 6 <= len(data):
            sz, fn = struct.unpack_from("<IH", data, o)
            if sz < 3:
                break
            r = data[o:o + sz * 2]
            try:
                if fn == 0x0F43:
                    imgs.append(_dib_to_png(r[28:]))
                elif fn == 0x0B41 and sz * 2 > 26:
                    imgs.append(_dib_to_png(r[26:]))
                elif fn == 0x0940 and sz * 2 > 22:
                    imgs.append(_dib_to_png(r[22:]))
                elif fn in (0x0922, 0x0B23):
                    bad.append(f"WMF bitmap record {fn:#x} not decoded")
            except Exception as e:
                bad.append(f"WMF bitmap record {fn:#x} undecodable ({type(e).__name__})")
            if fn == 0:
                break
            o += sz * 2
    for x in bad[:3]:
        run.un(where, x)
    for i, x in enumerate(imgs):
        run.img(f"{where}#bitmap{i}", x, "png")


def _datauris(txt, where, run):
    import urllib.parse
    for n, m in enumerate(DATAURI.finditer(txt.replace("\n", ""))):
        try:
            run.img(f"{where}#datauri{n}", base64.b64decode(urllib.parse.unquote(m.group(1))), "png")
        except Exception:
            run.un(where, "data: URI image undecodable")


# ------------------------------------------------------------------ containers
def _arc_kind(name, data):
    n, e = name.lower(), ext_of(name)
    if n.endswith((".tar.gz", ".tar.xz", ".tar.bz2")) or e in ("tar", "tgz", "tbz", "tbz2", "txz") or data[257:262] == b"ustar":
        return "tar"
    if e in OOXML:
        return None
    if data[:4] == b"PK\x03\x04":
        return "zip"
    if data[:2] == b"\x1f\x8b" or data[:3] == b"BZh" or data[:6] == b"\xfd7zXZ\x00":
        return "one"
    if data[:6] == b"7z\xbc\xaf\x27\x1c" or data[:4] == b"Rar!" or data[:4] == b"MSCF":
        return "bsd"
    return None


def _entries(kind, name, data):
    """-> [(path, bytes|None, encrypted)], metadata text"""
    out, meta, total = [], [], 0
    if kind == "zip":
        z = zipfile.ZipFile(io.BytesIO(data))
        meta.append(z.comment.decode("utf8", "ignore"))
        for i in z.infolist():
            if i.is_dir():
                continue
            if i.flag_bits & 1:
                out.append((i.filename, None, True))
                continue
            total += i.file_size
            if total > MAX_UNPACKED:
                raise ValueError("too large")
            out.append((i.filename, z.read(i), False))
    elif kind == "tar":
        t = tarfile.open(fileobj=io.BytesIO(data), mode="r:*")
        for m in t.getmembers():
            meta += [m.uname or "", m.gname or ""]
            if m.isfile():
                total += m.size
                if total > MAX_UNPACKED:
                    raise ValueError("too large")
                out.append((m.name, t.extractfile(m).read(), False))
    elif kind == "one":
        mod = gzip if data[:2] == b"\x1f\x8b" else (bz2 if data[:3] == b"BZh" else lzma)
        raw = mod.decompress(data)
        if len(raw) > MAX_UNPACKED:
            raise ValueError("too large")
        out.append((re.sub(r"\.(gz|bz2|xz)$", "", name.rsplit("/", 1)[-1], flags=re.I) or "inner", raw, False))
    else:
        exe = shutil.which("bsdtar")
        if not exe:
            raise RuntimeError("bsdtar not installed")
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "in")
            open(src, "wb").write(data)
            x = os.path.join(d, "x")
            os.makedirs(x)
            r = subprocess.run([exe, "-xf", src, "-C", x], capture_output=True, timeout=1800)
            if r.returncode:
                raise ValueError("bsdtar failed (encrypted or damaged)")
            for dp, _, fns in os.walk(x):
                for f in fns:
                    p = os.path.join(dp, f)
                    total += os.path.getsize(p)
                    if total > MAX_UNPACKED:
                        raise ValueError("too large")
                    out.append((os.path.relpath(p, x), open(p, "rb").read(), False))
    return out, "\n".join(meta)


def _is_media(name, data):
    h = data[:16]
    return ext_of(name) in MEDIA_EXT or (h[4:8] == b"ftyp" and h[8:12] not in (b"heic", b"heix", b"mif1", b"avif")) \
        or h[:4] in (b"OggS", b"\x1a\x45\xdf\xa3", b"fLaC") or h[:3] == b"ID3" \
        or (h[:4] == b"RIFF" and h[8:12] in (b"AVI ", b"WAVE"))


def _entropy(b):
    c = collections.Counter(b[:4_000_000])
    n = sum(c.values()) or 1
    return -sum(v / n * math.log2(v / n) for v in c.values())


def _text_of(data):
    for bom, codec in ((b"\xef\xbb\xbf", "utf-8"), (b"\xff\xfe", "utf-16-le"), (b"\xfe\xff", "utf-16-be")):
        if data.startswith(bom):
            return data[len(bom):].decode(codec, "ignore")
    h = data[:65536]
    if h.count(b"\x00") > len(h) * 0.3:
        return data.decode("utf-16-le", "ignore")
    ctl = sum(1 for ch in h if ch < 32 and ch not in (9, 10, 12, 13))
    if h and ctl / len(h) > 0.05:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode("cp1252", "replace")


def _pdf(data, where, run):
    for tool in ("pdftotext", "pdftoppm", "pdfinfo"):
        if not shutil.which(tool):
            run.un(where, f"{tool} not installed")
            return
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "in.pdf")
        open(f, "wb").write(data)
        run.text(where, "text", subprocess.run(["pdftotext", "-q", f, "-"], capture_output=True, timeout=600).stdout.decode("utf8", "ignore"))
        run.text(where, "meta", subprocess.run(["pdfinfo", "-meta", f], capture_output=True, timeout=60).stdout.decode("utf8", "ignore"))
        r = subprocess.run(["pdftoppm", "-r", "150", "-png", f, os.path.join(d, "pg")], capture_output=True, timeout=3600)
        pages = sorted(x for x in os.listdir(d) if x.startswith("pg") and x.endswith(".png"))
        if r.returncode or not pages:
            run.un(where, "PDF pages could not be rendered (encrypted/damaged)")
            return
        for p in pages:
            no = int(re.findall(r"(\d+)", p)[-1])
            run.img(f"{where}#page{no}", open(os.path.join(d, p), "rb").read(), "png")


def _walk(name, data, where, run, depth=0):
    e, base = ext_of(name), name.rsplit("/", 1)[-1].lower()
    if depth > MAX_DEPTH:
        return run.un(where, "nested too deep")
    run.stats["files"] += 1
    if e in SECRET_EXT or base in SECRET_NAMES:
        return run.secret.append(f"secret file name/extension @ {where}")
    if _is_media(name, data):
        return run.un(where, "video/audio recording (not checkable)")
    kind = _arc_kind(name, data)
    if kind:
        try:
            ents, meta = _entries(kind, name, data)
        except Exception as x:
            return run.un(where, f"archive unreadable ({str(x)[:60]})")
        run.text(where, "path", "\n".join(p for p, _, _ in ents))
        run.text(where, "meta", meta)
        for p, b, enc in ents:
            if enc:
                run.un(f"{where}!{p}", "encrypted member")
            else:
                _walk(p, b, f"{where}!{p}", run, depth + 1)
        return
    if e in OOXML:
        try:
            z = zipfile.ZipFile(io.BytesIO(data))
        except Exception:
            return run.un(where, "office file unreadable")
        for i in z.infolist():
            n, ie = i.filename, ext_of(i.filename)
            if i.is_dir():
                continue
            if i.flag_bits & 1:
                run.un(f"{where}!{n}", "encrypted part")
                continue
            b = z.read(i)
            if n.lower().endswith((".xml", ".rels")):
                x = b.decode("utf8", "ignore")
                t = re.sub(r"<[^>]+>", " ", x) + " " + " ".join(re.findall(r'(?:author|initials|creator|lastModifiedBy|userId)="([^"]*)"', x))
                run.text(where, "text", t)
                _datauris(x, f"{where}!{n}", run)
            elif ie in RASTER:
                run.img(f"{where}!{n}", b, ie)
            elif ie in ("emf", "wmf"):
                _vector(b, f"{where}!{n}", run)
            elif ie in ("ttf", "odttf", "otf", "fntdata"):
                continue
            else:
                _walk(n, b, f"{where}!{n}", run, depth + 1)   # embeddings, OLE objects, vba
        return
    if e == "pdf" or data[:5] == b"%PDF-":
        return _pdf(data, where, run)
    if e in RASTER:
        run.img(where, data, e)
        run.text(where, "meta", " ".join(x.decode("latin1") for x in re.findall(rb"[\x20-\x7e]{4,}", data[:262144])))
        return
    if e in ("emf", "wmf") or data[40:44] == b" EMF" or data[:4] == b"\xd7\xcd\xc6\x9a":
        return _vector(data, where, run)
    if e == "eml":
        m = email.message_from_bytes(data)
        run.text(where, "meta", "\n".join(f"{k}: {v}" for k, v in m.items()))
        for n, part in enumerate(m.walk()):
            if part.is_multipart():
                continue
            p, fn = part.get_payload(decode=True) or b"", part.get_filename()
            if fn or not (part.get_content_type() or "").startswith("text/"):
                _walk(fn or f"part{n}.bin", p, f"{where}!{fn or 'part' + str(n)}", run, depth + 1)
            else:
                t = p.decode(part.get_content_charset() or "utf-8", "ignore")
                run.text(where, "text", t)
                _datauris(t, where, run)
        return
    t = _text_of(data)
    if t is not None and not data[:4].startswith(EXEC_MAGIC):
        if "PRIVATE KEY-----" in t and PEM_BODY.search(t) or "$ANSIBLE_VAULT;" in t:
            return run.secret.append(f"private key / vault text @ {where}")
        run.text(where, "text", t)
        _datauris(t, where, run)
        return
    known_exec = data[:4].startswith(EXEC_MAGIC) or e in ("dll", "exe", "so", "dylib", "class", "pyd", "o", "a", "lib")
    if not known_exec and _entropy(data) > 7.2:
        return run.un(where, "compressed/encrypted binary, not readable")
    s = _strings(data)
    if PEM_BODY.search(s):
        return run.secret.append(f"private key inside binary @ {where}")
    run.text(where, "binary", s)
    for ce, x in _carve(data, min_area=300 * 100):
        run.img(f"{where}#res", x, ce)


# ------------------------------------------------------------------ name lenses
def _shape_hits(text, first_names, not_person):
    """people in NO list: '<First> <Capitalised>' with a known first name, '<Surname>, <First>', e-mail addresses"""
    out = []
    for line in text.splitlines():
        l = line.strip()
        if not l or len(l) > 160:
            continue
        for np_ in not_person:
            l = l.replace(np_, " ")
        toks = re.findall(r"[^\W\d_]+", l)
        if len(toks) >= 4 and sum(len(t) <= 3 for t in toks) >= 0.75 * len(toks) and not MAIL.search(l):
            continue  # OCR texture garbage
        pair = re.search(r"\b([A-Z][a-z]{2,})\s+([A-Z][a-z]{2,})\b", l)
        rev = re.search(r"\b([A-Z][a-z]{2,}),\s*([A-Z][a-z]{2,})\b", l)
        if (pair and pair.group(1) in first_names) or (rev and rev.group(2) in first_names) or MAIL.search(l):
            out.append(line.strip()[:120])
    return out


def gate(name, data, ctx=None):
    ctx = dict(ctx or {})
    dis = set(ctx.get("disable") or ())
    sha = hashlib.sha256(data).hexdigest()
    noise = _load(ctx, "noise_tokens.json")
    mbox = _load(ctx, "functional_mailboxes.json")
    oss = [o["phrase"] for o in _load(ctx, "oss_credits.json")]
    oss_paths = [(re.compile(o["regex"]), o) for o in _load(ctx, "oss_paths.json")]
    notp = [o["string"] for o in _load(ctx, "not_person.json")]
    fonts = [o["string"] for o in _load(ctx, "not_person.json") if o.get("font")]
    eye = {o["sha256"]: o for o in _load(ctx, "eye_verdicts.json")}
    run = _Run(ctx)
    try:
        _walk(name, data, name.rsplit("/", 1)[-1], run)
        while run.jobs:
            _run_ocr(run)
    except Exception as x:
        return {"status": "HELD_UNREADABLE", "reasons": [f"unreadable:gate error {type(x).__name__}"], "findings": [],
                "blur_candidates": [], "needs_review": False, "sha256": sha, "stats": dict(run.stats)}
    allowed, find = set(), []
    exact = {m["address"].lower() for m in mbox if m.get("address")}
    suff = tuple(m["suffix"].lower() for m in mbox if m.get("suffix"))
    segs = []
    for s in run.seg + [{"where": "(file name)", "src": "name", "txt": name.rsplit("/", 1)[-1]}]:
        t = B64RUN.sub(" ", DATAURI.sub(" ", s["txt"]))
        t = MAIL.sub(lambda m: (allowed.add("mailbox:" + m.group(0)) or " ") if m.group(0).lower() in exact or (suff and m.group(0).lower().endswith(suff)) else m.group(0), t)
        for p in oss:
            if p in t:
                allowed.add("oss:" + p)
                t = t.replace(p, " ")
        if s["src"] == "vector":
            for f in fonts:
                t = re.sub(re.escape(f[:4]) + r"\w*", " ", t)
        segs.append(dict(s, txt=t))
    names = ctx.get("names")
    if names is None and "list" not in dis:
        run.un(name, "no list lens configured (ctx['names'])")
    for s in segs:
        if names is not None and "list" not in dis:
            for h in set(names(s["txt"])):
                n = next((x for x in noise if x["token"] == h and (x.get("scope", "any") == "any" or s["src"] in ("ocr", "vector"))), None)
                if n:
                    allowed.add(f"noise:{h}")
                else:
                    find.append({"lens": "list", "hit": h, "where": s["where"], "src": s["src"]})
        if ctx.get("shape", True) and "shape" not in dis and s["src"] in ("ocr", "vector", "text", "meta"):
            for h in _shape_hits(s["txt"], ctx.get("first_names", set()), notp):
                find.append({"lens": "shape", "hit": h, "where": s["where"], "src": s["src"]})
        if "profile" not in dis:
            for m in set(PROFILE.findall(s["txt"])):
                if m.lower().strip(".,;") not in GENERIC_PROFILES:
                    find.append({"lens": "profile-path", "hit": m, "where": s["where"], "src": s["src"]})
    keep = []
    for f in find:
        dep = next((o for rx, o in oss_paths if rx.search(f["where"])), None)
        if dep and f["lens"] != "profile-path":
            allowed.add("oss-dependency:" + f["hit"][:40])
        else:
            keep.append(f)
    find = keep
    status = "SECRET" if run.secret else "HIT" if find else "HELD_UNREADABLE" if run.unread else "clean"
    reasons = [f"secret:{x}" for x in run.secret] + [f"{f['lens']}:{f['hit']} @ {f['where']} ({f['src']})" for f in find] \
        + [f"unreadable:{x}" for x in run.unread]
    v = eye.get(sha)
    if v and status != "SECRET":
        if v.get("verdict") == "clean" and status != "clean":
            reasons = [f"eye verdict ({v.get('source', '')}): {v.get('reason', '')}"] + ["overridden " + r for r in reasons]
            status = "clean"
        elif v.get("verdict") == "hold":
            reasons, status = [f"eye hold ({v.get('source', '')})"] + reasons, "HIT"
    blur = [{"where": f["where"], "text": f["hit"], "lens": f["lens"]} for f in find if f["src"] == "ocr"]
    return {"status": status, "reasons": reasons, "findings": find, "blur_candidates": blur, "allowed": sorted(allowed),
            "needs_review": bool(find) and all(f["lens"] == "shape" for f in find) and status == "HIT",
            "sha256": sha, "stats": dict(run.stats)}


def ok(name, data, ctx=None):
    return gate(name, data, ctx)["status"] == "clean"


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    for f in sys.argv[1:]:
        # DEMO ONLY: an empty list lens. Wire your own matcher in ctx["names"] before trusting a "clean".
        v = gate(os.path.basename(f), open(f, "rb").read(), {"names": lambda t: [], "data_dir": os.environ.get("GATE_DATA")})
        print(v["status"], f)
        for r in v["reasons"][:20]:
            print("   ", r[:160])
